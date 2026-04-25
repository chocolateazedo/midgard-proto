import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { setPendingChannel } from "@/lib/channel";
import { botManager } from "@/lib/telegram";
import { getPixProvider } from "@/lib/pix";
import { getPublicUrl } from "@/lib/s3";
import { scheduleContentDelivery } from "@/lib/inline-jobs";
import { formatCurrency } from "@/lib/utils";
import { formatDuration } from "@/lib/subscription";
import {
  getActiveSubscription,
  hasLiveAccess,
  getExistingPaidPurchase,
  calculateEndDate,
} from "@/server/queries/subscriptions";
import { computeFees, loadCreatorFeeContext } from "@/lib/fees";
import { getPaymentLimits } from "@/lib/payment-limits";
import { prepareChargeSplits } from "@/lib/split";

// Bot API 7.3+ suporta InlineKeyboardButton com { copy_text: { text } }.
// Grammy 1.30 ainda tipa o campo como any; cast explícito pra evitar TS.
type CopyTextButton = {
  text: string;
  copy_text: { text: string };
};

function pixCopyKeyboard(copyPaste: string) {
  return {
    inline_keyboard: [
      [
        {
          text: "📋 Copiar código Pix",
          copy_text: { text: copyPaste },
        } as unknown as CopyTextButton,
      ],
    ],
  };
}

/**
 * Fluxo de 3 mensagens pra cobrança Pix:
 *   1) header (título + valor + instruções) em Markdown
 *   2) copia-cola puro em mensagem isolada (fácil long-press + copiar)
 *   3) passo-a-passo didático + expiração + botão "Copiar código Pix"
 *
 * A mensagem 2 tem propósito prático: em alguns clients do Telegram
 * long-press no code block escolhe só parte do texto. Mensagem pura
 * sem formatação resolve e o botão copy_text da mensagem 3 serve como
 * atalho.
 */
async function sendPixCharge(
  token: string,
  chatId: number,
  header: string,
  copyPaste: string,
  successMessage: string
): Promise<void> {
  const instructions =
    `*Como pagar em 4 passos:*\n\n` +
    `1️⃣ Toque no botão *📋 Copiar código Pix* logo abaixo desta mensagem.\n` +
    `2️⃣ Abra o aplicativo do seu banco no celular.\n` +
    `3️⃣ Toque em *Pix* e depois em *Pix Copia e Cola* (ou "Colar código Pix").\n` +
    `4️⃣ Cole o código, confira o valor e confirme o pagamento.\n\n` +
    `⏰ Este pagamento expira em *30 minutos*.\n` +
    `${successMessage}`;

  await botManager.sendMessage(token, chatId, header, {
    parse_mode: "Markdown",
  });
  await botManager.sendMessage(token, chatId, copyPaste);
  await botManager.sendMessage(token, chatId, instructions, {
    parse_mode: "Markdown",
    reply_markup: pixCopyKeyboard(copyPaste),
  });
}

const MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📚 Catálogo", callback_data: "cmd_catalogo" }],
    [{ text: "💳 Planos de Acesso", callback_data: "cmd_planos" }],
    [{ text: "🔴 Transmissão ao vivo", callback_data: "cmd_live" }],
  ],
};

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

interface TelegramChatMember {
  user: TelegramUser;
  status:
    | "creator"
    | "administrator"
    | "member"
    | "restricted"
    | "left"
    | "kicked";
}

interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
  invite_link?: { invite_link: string; name?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  // Mudanças no status do próprio bot num chat (ex: virou admin de canal)
  my_chat_member?: TelegramChatMemberUpdated;
  // Mudanças no status de outros users em chat onde bot é admin (ex: fã entrou no canal)
  chat_member?: TelegramChatMemberUpdated;
}

interface WelcomeButton {
  text: string;
  action: string;
}

// --- Helpers ---

async function upsertBotUser(
  botId: string,
  telegramUser: TelegramUser
): Promise<{ id: string; isFirstContact: boolean }> {
  const telegramUserId = BigInt(telegramUser.id);

  const existing = await db.botUser.findUnique({
    where: { botId_telegramUserId: { botId, telegramUserId } },
  });

  const result = await db.botUser.upsert({
    where: { botId_telegramUserId: { botId, telegramUserId } },
    create: {
      botId,
      telegramUserId,
      telegramUsername: telegramUser.username ?? null,
      telegramFirstName: telegramUser.first_name ?? null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
      telegramUsername: telegramUser.username ?? null,
      telegramFirstName: telegramUser.first_name ?? null,
    },
  });

  // Atualizar total de assinantes
  const subscriberCount = await db.botUser.count({ where: { botId } });
  await db.bot.update({
    where: { id: botId },
    data: { totalSubscribers: subscriberCount },
  });

  return { id: result.id, isFirstContact: !existing };
}

async function getLiveBanner(botId: string): Promise<string> {
  const liveStream = await db.liveStream.findUnique({ where: { botId } });
  if (liveStream?.isLive) {
    return "🔴 *AO VIVO AGORA!* Use /live para acessar.\n\n";
  }
  return "";
}

// --- /start ---

async function handleStart(
  token: string,
  chatId: number,
  botId: string,
  botDescription: string | null,
  isFirstContact: boolean,
  botUserId: string
): Promise<void> {
  const liveBanner = await getLiveBanner(botId);

  // Verificar assinatura ativa
  const activeSubscription = await getActiveSubscription(botId, botUserId);
  if (activeSubscription) {
    const endDateStr = activeSubscription.endDate
      ? activeSubscription.endDate.toLocaleDateString("pt-BR")
      : "—";

    // Decide a ação principal: se há canal vinculado, manda o assinante
    // pro canal (link direto, sem texto explicativo). Sem canal, abre o
    // catálogo dentro do próprio bot via callback.
    const botChannel = await db.bot.findUnique({
      where: { id: botId },
      select: { channelId: true, channelUsername: true },
    });
    let actionButton: { text: string; url?: string; callback_data?: string };
    if (botChannel?.channelId) {
      let channelUrl: string | null = null;
      if (botChannel.channelUsername) {
        channelUrl = `https://t.me/${botChannel.channelUsername}`;
      } else if (activeSubscription.channelInviteLink) {
        // Canal privado: reaproveita o invite link gerado no pagamento.
        channelUrl = activeSubscription.channelInviteLink;
      }
      actionButton = channelUrl
        ? { text: "📺 Ver Fotos", url: channelUrl }
        : { text: "📚 Ver Fotos", callback_data: "cmd_catalogo" };
    } else {
      actionButton = { text: "📚 Ver Fotos", callback_data: "cmd_catalogo" };
    }

    const subMessage =
      liveBanner +
      `👋 Bem-vindo de volta!\n\n` +
      `⭐ Você é assinante do plano *${activeSubscription.plan.name}*\n` +
      `⏰ Período: ${formatDuration(activeSubscription.plan.durationDays)}\n` +
      `📅 Válido até: *${endDateStr}*`;

    await botManager.sendMessage(token, chatId, subMessage, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[actionButton]] },
    });
    return;
  }

  const welcomeMsg = await db.welcomeMessage.findUnique({ where: { botId } });

  if (welcomeMsg) {
    // Se configurado para enviar só no primeiro contato, e não é primeiro contato, enviar catálogo
    if (!welcomeMsg.sendOnEveryStart && !isFirstContact) {
      await sendCatalog(token, chatId, botId, liveBanner + "Aqui está o catálogo de conteúdos:");
      return;
    }

    const text = liveBanner + welcomeMsg.text;

    // Montar botões inline a partir da configuração
    const buttons = (welcomeMsg.buttons as unknown as WelcomeButton[]) ?? [];
    const inlineKeyboard = buttons
      .map((btn) => {
        if (btn.action.startsWith("url:")) {
          return [{ text: btn.text, url: btn.action.replace("url:", "") }];
        }
        if (btn.action.startsWith("command:")) {
          const cmd = btn.action.replace("command:", "").replace("/", "");
          return [{ text: btn.text, callback_data: `cmd_${cmd}` }];
        }
        return null;
      })
      .filter(Boolean) as Array<Array<{ text: string; callback_data?: string; url?: string }>>;

    const replyMarkup = inlineKeyboard.length > 0
      ? { inline_keyboard: inlineKeyboard }
      : undefined;

    // Enviar mídia se configurada
    if (welcomeMsg.mediaType && welcomeMsg.mediaKey) {
      try {
        const mediaUrl = await getPublicUrl(welcomeMsg.mediaKey);
        if (welcomeMsg.mediaType === "image") {
          await botManager.sendPhoto(token, chatId, mediaUrl, text);
        } else if (welcomeMsg.mediaType === "video") {
          await botManager.sendVideo(token, chatId, mediaUrl, text);
        }
        // Se tem botões, enviar em mensagem separada após a mídia
        if (replyMarkup) {
          await botManager.sendMessage(token, chatId, "👇 Opções:", {
            reply_markup: replyMarkup,
          });
        }
      } catch (e) {
        console.error("[handleStart] Erro ao enviar mídia:", e);
        // Fallback: enviar só texto
        await botManager.sendMessage(token, chatId, text, {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });
      }
    } else {
      await botManager.sendMessage(token, chatId, text, {
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
      });
    }
  } else {
    // Sem welcome message configurada — usar comportamento padrão (catálogo)
    await sendCatalog(token, chatId, botId, liveBanner + (botDescription || "Bem-vindo! Confira os conteúdos disponíveis abaixo 👇"));
  }
}

// --- /catalogo (/catalog) ---

async function sendCatalog(
  token: string,
  chatId: number,
  botId: string,
  welcomeMessage?: string | null
): Promise<void> {
  const publishedContent = await db.content.findMany({
    where: { botId, isPublished: true },
  });

  const greeting =
    welcomeMessage ||
    "Bem-vindo! Confira os conteúdos disponíveis abaixo 👇";

  if (publishedContent.length === 0) {
    await botManager.sendMessage(token, chatId, `${greeting}\n\nNenhum conteúdo disponível no momento.`);
    return;
  }

  // Enviar saudação
  await botManager.sendMessage(token, chatId, greeting, {
    parse_mode: "Markdown",
  });

  // Enviar cada item com miniatura + botão de compra
  for (const item of publishedContent) {
    const price = parseFloat(item.price.toString());
    const priceLabel = price === 0 ? "🎁 Grátis" : `💰 ${formatCurrency(price)}`;
    const caption = `*${item.title}*\n${item.description ? `${item.description}\n` : ""}${priceLabel}`;

    const buyButton = {
      inline_keyboard: [
        [
          {
            text: price === 0 ? "🎁 Obter Grátis" : `Comprar — ${formatCurrency(price)}`,
            callback_data: `buy_${item.id}`,
          },
        ],
      ],
    };

    // Enviar com thumbnail se disponível (imagem ou vídeo)
    if (item.thumbnailKey) {
      try {
        const thumbUrl = await getPublicUrl(item.thumbnailKey);
        await botManager.sendPhoto(token, chatId, thumbUrl, caption, {
          parse_mode: "Markdown",
          reply_markup: buyButton,
        });
        continue;
      } catch (e) {
        console.warn("[sendCatalog] Erro ao enviar thumbnail, fallback para texto:", e);
      }
    }

    // Fallback: só texto
    await botManager.sendMessage(token, chatId, caption, {
      parse_mode: "Markdown",
      reply_markup: buyButton,
    });
  }
}

// --- /planos ---

async function handlePlanos(
  token: string,
  chatId: number,
  botId: string
): Promise<void> {
  const plans = await db.subscriptionPlan.findMany({
    where: { botId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (plans.length === 0) {
    await botManager.sendMessage(
      token,
      chatId,
      "Nenhum plano de assinatura disponível no momento."
    );
    return;
  }

  const plansText = plans
    .map((plan, index) => {
      const benefits = (plan.benefits as string[]) ?? [];
      const benefitsText =
        benefits.length > 0
          ? benefits.map((b) => `  • ${b}`).join("\n")
          : "";
      return (
        `${index + 1}. *${plan.name}*\n` +
        `${plan.description ? `${plan.description}\n` : ""}` +
        `💰 ${formatCurrency(parseFloat(plan.price.toString()))} / ${formatDuration(plan.durationDays)}\n` +
        (benefitsText ? `${benefitsText}\n` : "")
      );
    })
    .join("\n");

  const inlineKeyboard = plans.map((plan) => [
    {
      text: `${plan.name} — ${formatCurrency(parseFloat(plan.price.toString()))}`,
      callback_data: `sub_${plan.id}`,
    },
  ]);

  await botManager.sendMessage(
    token,
    chatId,
    `📋 *Planos de Assinatura*\n\n${plansText}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    }
  );
}

// --- /live ---

async function handleLive(
  token: string,
  chatId: number,
  botId: string,
  botUserId: string
): Promise<void> {
  try {
    const liveStream = await db.liveStream.findUnique({ where: { botId } });

    console.log("[handleLive] botId:", botId, "liveStream:", liveStream ? { isLive: liveStream.isLive, streamLink: liveStream.streamLink, price: liveStream.price.toString() } : null);

    // Não está ao vivo: tenta encontrar um schedule pertinente pra dar
    // uma resposta útil em vez do genérico "sem transmissão".
    if (!liveStream || !liveStream.isLive) {
      const now = new Date();
      const upcoming = await db.liveSchedule.findFirst({
        where: {
          botId,
          status: "scheduled",
          endAt: { gt: now },
        },
        orderBy: { startAt: "asc" },
        select: { title: true, startAt: true, endAt: true },
      });

      if (!upcoming) {
        await botManager.sendMessage(
          token,
          chatId,
          "📺 Nenhuma transmissão ao vivo no momento.\n\nFique ligado(a) — você vai receber um aviso aqui quando a próxima live for agendada!"
        );
        return;
      }

      // Se o horário já começou mas ainda não entrou no ar → aguardando modelo
      if (upcoming.startAt <= now) {
        await botManager.sendMessage(
          token,
          chatId,
          `⏳ *Aguardando transmissão começar*\n\n` +
            `🔴 ${upcoming.title}\n\n` +
            `A modelo tá se preparando pra entrar ao vivo. Assim que começar você recebe o link aqui mesmo — pode deixar a notificação ligada!`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Schedule no futuro → anuncia horário de forma amigável
      const whenStr = upcoming.startAt.toLocaleString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      const diffMs = upcoming.startAt.getTime() - now.getTime();
      const hoursUntil = Math.floor(diffMs / 3600_000);
      const minutesUntil = Math.floor((diffMs % 3600_000) / 60_000);
      let countdown = "";
      if (hoursUntil >= 24) {
        const days = Math.floor(hoursUntil / 24);
        countdown = `em ${days} dia${days > 1 ? "s" : ""}`;
      } else if (hoursUntil > 0) {
        countdown = `em ${hoursUntil}h${minutesUntil > 0 ? ` ${minutesUntil}min` : ""}`;
      } else {
        countdown = `em ${minutesUntil} min`;
      }

      await botManager.sendMessage(
        token,
        chatId,
        `📅 *Próxima live agendada!*\n\n` +
          `🔴 ${upcoming.title}\n` +
          `🕒 ${whenStr}\n` +
          `⏰ Começa ${countdown}\n\n` +
          `Você recebe um aviso 10 minutos antes e o link assim que começar. Fique de olho!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const price = parseFloat(liveStream.price.toString());
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const streamBase = liveStream.streamLink || `${baseUrl}/watch/${botId}`;
    const watchLink = `${streamBase}?token=${botUserId}`;

    console.log("[handleLive] price:", price, "watchLink:", watchLink);

    // Acesso gratuito
    if (price === 0) {
      const msg =
        `🔴 ${liveStream.title ?? "AO VIVO"}\n\n` +
        `${liveStream.description ? `${liveStream.description}\n\n` : ""}` +
        `🔗 Acesse: ${watchLink}`;

      console.log("[handleLive] Enviando mensagem gratuita");
      await botManager.sendMessage(token, chatId, msg);
      return;
    }

    // Verificar se tem assinatura com acesso à live
    const hasAccess = await hasLiveAccess(botId, botUserId);
    if (hasAccess) {
      const msg =
        `🔴 ${liveStream.title ?? "AO VIVO"}\n\n` +
        `${liveStream.description ? `${liveStream.description}\n\n` : ""}` +
        `✅ Você tem acesso pelo seu plano de assinatura!\n\n` +
        `🔗 Acesse: ${watchLink}`;

      await botManager.sendMessage(token, chatId, msg);
      return;
    }

  // Gerar cobrança Pix para acesso à live
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: { user: { select: { id: true } } },
  });
  if (!bot) return;

  const [feeCtx, limits] = await Promise.all([
    loadCreatorFeeContext(bot.user.id),
    getPaymentLimits(),
  ]);
  const fees = computeFees(price, feeCtx!, limits.transactionFeeCents);
  const splits = await prepareChargeSplits(price, fees, feeCtx!);

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    price,
    `Live: ${liveStream.title ?? "Transmissão ao vivo"}`,
    { splits }
  );

  // Salvar como purchase especial (contentId referência ao próprio bot para rastreamento)
  // Usamos o campo pixTxid para identificar a compra na confirmação
  await db.purchase.create({
    data: {
      contentId: null, // compra de live, sem conteúdo associado
      botId,
      botUserId,
      creatorUserId: bot.user.id,
      managerUserId: fees.managerUserId,
      amount: price.toFixed(2),
      platformFee: fees.platformFee.toFixed(2),
      managerFee: fees.managerFee.toFixed(2),
      creatorNet: fees.creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
      splitApplied: charge.splitApplied ?? false,
      status: "pending",
      expiresAt: charge.expiresAt,
    },
  });

  await sendPixCharge(
    token,
    chatId,
    `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
      `💰 Valor: *${formatCurrency(price)}*\n\n` +
      `Para pagar, use o Pix Copia e Cola abaixo ou escaneie o QR Code.`,
    charge.copyPaste,
    `Assim que confirmarmos, você recebe o link da transmissão aqui mesmo.`
  );

  if (charge.qrCode && charge.qrCode.startsWith("data:image")) {
    const base64Data = charge.qrCode.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const Bot = (await import("grammy")).Bot;
    const tempBot = new Bot(token);
    await tempBot.api.sendPhoto(chatId, new Blob([buffer], { type: "image/png" }) as any, {
      caption: "QR Code Pix",
    });
  }
  } catch (e) {
    console.error("[handleLive] Erro:", e);
    const errMsg = e instanceof Error ? e.message : String(e);
    await botManager.sendMessage(
      token,
      chatId,
      `Erro na live: ${errMsg}`
    );
  }
}

// --- Callback: compra de conteúdo ---

async function handleBuyCallback(
  token: string,
  chatId: number,
  callbackQueryId: string,
  telegramUser: TelegramUser,
  contentId: string,
  botId: string,
  botUserId: string
): Promise<void> {
  // Verificar compra duplicada — re-entregar sem cobrar
  const existingPurchase = await getExistingPaidPurchase(botId, botUserId, contentId);
  if (existingPurchase && existingPurchase.contentId) {
    const isFreeRedelivery = existingPurchase.amount.toString() === "0" || parseFloat(existingPurchase.amount.toString()) === 0;
    scheduleContentDelivery({
      purchaseId: existingPurchase.id,
      contentId: existingPurchase.contentId,
      botId,
      botUserId,
      isRedelivery: true,
    });
    if (!isFreeRedelivery) {
      await botManager.sendMessage(
        token,
        chatId,
        "✅ Você já comprou este conteúdo! Estamos enviando novamente."
      );
    }
    return;
  }

  const contentItem = await db.content.findFirst({
    where: { id: contentId, botId },
    include: {
      bot: {
        include: {
          user: { select: { id: true, platformFeePercent: true } },
        },
      },
    },
  });

  if (!contentItem || !contentItem.isPublished) {
    await botManager.sendMessage(
      token,
      chatId,
      "Conteúdo não encontrado ou não disponível."
    );
    return;
  }

  const amount = parseFloat(contentItem.price.toString());

  // Conteúdo gratuito — entregar direto sem cobrança
  if (amount === 0) {
    await db.purchase.create({
      data: {
        contentId,
        botId,
        botUserId,
        creatorUserId: contentItem.bot.user.id,
        amount: "0.00",
        platformFee: "0.00",
        creatorNet: "0.00",
        pixTxid: `free_${crypto.randomUUID().replace(/-/g, "")}`,
        status: "paid",
        paidAt: new Date(),
      },
    });

    await db.content.update({
      where: { id: contentId },
      data: {
        purchaseCount: { increment: 1 },
      },
    });

    // Entregar conteúdo direto (sem depender do worker). Vídeo: envia
    // segmentos da variante leve quando há vários (corte por 10 min).
    // Sem lightKeys, manda original via stream multipart (até 50 MB).
    const baseCaption = `🎁 *${contentItem.title}*\n\nConteúdo gratuito! Aqui está:`;
    if (contentItem.type === "video" && contentItem.lightKeys.length > 0) {
      const total = contentItem.lightKeys.length;
      for (let i = 0; i < total; i++) {
        const partLabel = total > 1 ? `Parte ${i + 1}/${total}\n\n` : "";
        const caption = i === 0 ? `${partLabel}${baseCaption}` : partLabel.trim();
        await botManager.sendMediaFromKey(token, chatId, {
          type: "video",
          key: contentItem.lightKeys[i],
          caption,
        });
      }
      return;
    }
    await botManager.sendMediaFromKey(token, chatId, {
      type: contentItem.type,
      key: contentItem.originalKey,
      caption: baseCaption,
    });
    return;
  }

  const [feeCtx, limits] = await Promise.all([
    loadCreatorFeeContext(contentItem.bot.user.id),
    getPaymentLimits(),
  ]);
  const fees = computeFees(amount, feeCtx!, limits.transactionFeeCents);
  const splits = await prepareChargeSplits(amount, fees, feeCtx!);

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    amount,
    `Compra: ${contentItem.title}`,
    { splits }
  );

  await db.purchase.create({
    data: {
      contentId,
      botId,
      botUserId,
      creatorUserId: contentItem.bot.user.id,
      managerUserId: fees.managerUserId,
      amount: amount.toFixed(2),
      platformFee: fees.platformFee.toFixed(2),
      managerFee: fees.managerFee.toFixed(2),
      creatorNet: fees.creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
      splitApplied: charge.splitApplied ?? false,
      status: "pending",
      expiresAt: charge.expiresAt,
    },
  });

  const formattedAmount = formatCurrency(amount);
  const isMock = charge.txid.startsWith("mock_");

  if (isMock) {
    const message =
      `🛒 *${contentItem.title}*\n\n` +
      `💰 Valor: *${formattedAmount}*\n\n` +
      `🧪 *Modo de teste ativo.*\n` +
      `O pagamento será confirmado pelo administrador da plataforma.\n\n` +
      `⏰ Aguardando confirmação...`;

    await botManager.sendMessage(token, chatId, message, {
      parse_mode: "Markdown",
    });
  } else {
    await sendPixCharge(
      token,
      chatId,
      `🛒 *${contentItem.title}*\n\n` +
        `💰 Valor: *${formattedAmount}*\n\n` +
        `Para pagar, use o Pix Copia e Cola abaixo ou escaneie o QR Code.`,
      charge.copyPaste,
      `Assim que confirmarmos, você recebe o conteúdo automaticamente por aqui.`
    );

    if (charge.qrCode && charge.qrCode.startsWith("data:image")) {
      const base64Data = charge.qrCode.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const Bot = (await import("grammy")).Bot;
      const tempBot = new Bot(token);
      await tempBot.api.sendPhoto(chatId, new Blob([buffer], { type: "image/png" }) as any, {
        caption: "QR Code Pix",
      });
    }
  }
}

// --- Callback: assinatura de plano ---

async function handleSubscribeCallback(
  token: string,
  chatId: number,
  planId: string,
  botId: string,
  botUserId: string
): Promise<void> {
  // Verificar se já tem assinatura ativa
  const activeSub = await getActiveSubscription(botId, botUserId);
  if (activeSub) {
    const endDateStr = activeSub.endDate
      ? activeSub.endDate.toLocaleDateString("pt-BR")
      : "—";

    // Re-enviar invite link do canal (se o bot tem canal vinculado).
    // Link single-use — cria um novo a cada pedido.
    let channelBlock = "";
    const botChannel = await db.bot.findUnique({
      where: { id: botId },
      select: { channelId: true, channelTitle: true },
    });
    if (botChannel?.channelId) {
      try {
        const inviteLink = await botManager.createChannelInviteLink(
          token,
          botChannel.channelId,
          {
            memberLimit: 1,
            name: `sub_${activeSub.id.slice(0, 8)}_resend`,
          }
        );
        await db.subscription.update({
          where: { id: activeSub.id },
          data: {
            channelInviteLink: inviteLink,
            channelInviteSentAt: new Date(),
          },
        });
        channelBlock =
          `\n\n📢 *Canal exclusivo*\n` +
          `Entre no canal ${botChannel.channelTitle ? `*${botChannel.channelTitle}*` : "exclusivo"}:\n` +
          `${inviteLink}\n` +
          `_Link de uso único, expira ao entrar._`;
      } catch (err) {
        console.error(
          `[handleSubscribeCallback] Falha ao recriar invite link canal ${botChannel.channelId}:`,
          err
        );
      }
    }

    await botManager.sendMessage(
      token,
      chatId,
      `✅ Você já tem uma assinatura ativa!\n\n` +
        `📋 Plano: *${activeSub.plan.name}*\n` +
        `📅 Válido até: *${endDateStr}*` +
        channelBlock,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, botId, isActive: true },
  });
  if (!plan) {
    await botManager.sendMessage(
      token,
      chatId,
      "Plano não encontrado ou não disponível."
    );
    return;
  }

  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: { user: { select: { id: true, platformFeePercent: true } } },
  });
  if (!bot) return;

  const amount = parseFloat(plan.price.toString());
  const [feeCtx, limits] = await Promise.all([
    loadCreatorFeeContext(bot.user.id),
    getPaymentLimits(),
  ]);
  const fees = computeFees(amount, feeCtx!, limits.transactionFeeCents);
  const splits = await prepareChargeSplits(amount, fees, feeCtx!);

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    amount,
    `Assinatura: ${plan.name}`,
    { splits }
  );

  await db.subscription.create({
    data: {
      planId: plan.id,
      botId,
      botUserId,
      managerUserId: fees.managerUserId,
      amount: amount.toFixed(2),
      platformFee: fees.platformFee.toFixed(2),
      managerFee: fees.managerFee.toFixed(2),
      creatorNet: fees.creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
      splitApplied: charge.splitApplied ?? false,
      status: "active", // Será atualizado para active após confirmação do Pix
    },
  });

  // Corrigir: status inicial deve ser um estado que indica pendente
  // Como não temos 'pending' no enum SubscriptionStatus, usar 'active' temporariamente
  // e o pix webhook vai ativar de fato setando startDate/endDate
  // Alternativa melhor: o status 'active' sem endDate indica pendente

  const isMockSub = charge.txid.startsWith("mock_");

  if (isMockSub) {
    await botManager.sendMessage(
      token,
      chatId,
      `📋 *Plano ${plan.name}*\n` +
        `⏰ Período: ${formatDuration(plan.durationDays)}\n` +
        `💰 Valor: *${formatCurrency(amount)}*\n\n` +
        `🧪 *Modo de teste ativo.*\n` +
        `O pagamento será confirmado pelo administrador da plataforma.\n\n` +
        `⏰ Aguardando confirmação...`,
      { parse_mode: "Markdown" }
    );
  } else {
    await sendPixCharge(
      token,
      chatId,
      `📋 *Plano ${plan.name}*\n` +
        `⏰ Período: ${formatDuration(plan.durationDays)}\n` +
        `💰 Valor: *${formatCurrency(amount)}*\n\n` +
        `Para assinar, use o Pix Copia e Cola abaixo ou escaneie o QR Code.`,
      charge.copyPaste,
      `Assim que confirmarmos, sua assinatura é ativada automaticamente.`
    );

    if (charge.qrCode && charge.qrCode.startsWith("data:image")) {
      const base64Data = charge.qrCode.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const Bot = (await import("grammy")).Bot;
      const tempBot = new Bot(token);
      await tempBot.api.sendPhoto(chatId, new Blob([buffer], { type: "image/png" }) as any, {
        caption: "QR Code Pix",
      });
    }
  }
}

// --- my_chat_member: bot virou/deixou de ser admin de canal ---

async function handleMyChatMember(
  botId: string,
  update: TelegramChatMemberUpdated
): Promise<void> {
  const { chat, new_chat_member: newMember } = update;
  if (chat.type !== "channel") return;

  const becameAdmin =
    newMember.status === "administrator" || newMember.status === "creator";
  const isOut = newMember.status === "left" || newMember.status === "kicked";

  if (becameAdmin) {
    await setPendingChannel(botId, {
      chatId: BigInt(chat.id),
      title: chat.title ?? "Sem título",
      username: chat.username ?? null,
    });
    console.log(
      `[webhook] bot ${botId} virou admin do canal ${chat.id} (${chat.title}) — pending salvo`
    );
    return;
  }

  if (isOut) {
    // Bot foi removido do canal que estava vinculado — desvincula
    await db.bot.updateMany({
      where: { id: botId, channelId: BigInt(chat.id) },
      data: {
        channelId: null,
        channelUsername: null,
        channelTitle: null,
        channelLinkedAt: null,
      },
    });
    console.log(`[webhook] bot ${botId} saiu do canal ${chat.id} — desvinculado`);
  }
}

// --- chat_member: assinante entrou/saiu do canal vinculado ---

async function handleChatMember(
  botId: string,
  update: TelegramChatMemberUpdated
): Promise<void> {
  const { chat, new_chat_member: newMember, old_chat_member: oldMember } = update;
  if (chat.type !== "channel") return;

  // Só processar eventos no canal que está vinculado a este bot
  const bot = await db.bot.findFirst({
    where: { id: botId, channelId: BigInt(chat.id) },
    select: { id: true },
  });
  if (!bot) return;

  const joined =
    oldMember.status !== "member" &&
    oldMember.status !== "administrator" &&
    oldMember.status !== "creator" &&
    (newMember.status === "member" || newMember.status === "administrator");

  const left =
    (oldMember.status === "member" ||
      oldMember.status === "administrator" ||
      oldMember.status === "creator") &&
    (newMember.status === "left" || newMember.status === "kicked");

  const telegramUserId = BigInt(newMember.user.id);

  // Buscar BotUser correspondente. Se não existe, user entrou por invite sem
  // ter interagido com o bot antes — ignora (subscription workflow passa pelo bot DM).
  const botUser = await db.botUser.findUnique({
    where: { botId_telegramUserId: { botId, telegramUserId } },
    select: { id: true },
  });
  if (!botUser) return;

  if (joined) {
    // Procura subscription ativa com invite enviado mas ainda sem joinedAt
    await db.subscription.updateMany({
      where: {
        botId,
        botUserId: botUser.id,
        channelInviteSentAt: { not: null },
        channelJoinedAt: null,
        channelRemovedAt: null,
      },
      data: { channelJoinedAt: new Date() },
    });
    console.log(
      `[webhook] botUser ${botUser.id} entrou no canal do bot ${botId}`
    );
    return;
  }

  if (left) {
    // Marca qualquer subscription ativa com joinedAt como removida.
    // Se o bot removeu (via banChatMember), `removalReason` já foi setado pelo
    // worker de expiry antes — esse updateMany só roda se ainda não tem reason.
    await db.subscription.updateMany({
      where: {
        botId,
        botUserId: botUser.id,
        channelJoinedAt: { not: null },
        channelRemovedAt: null,
      },
      data: {
        channelRemovedAt: new Date(),
        channelRemovalReason: "left",
      },
    });
    console.log(
      `[webhook] botUser ${botUser.id} saiu do canal do bot ${botId}`
    );
  }
}

// --- Main POST handler ---

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
): Promise<NextResponse> {
  const { botId } = await params;

  try {
    const bot = await db.bot.findFirst({
      where: { id: botId },
    });

    if (!bot || !bot.isActive) {
      return NextResponse.json(
        { success: false, error: "Bot não encontrado ou inativo" },
        { status: 404 }
      );
    }

    const token = decrypt(bot.telegramToken);
    const update: TelegramUpdate = await request.json();

    if (update.my_chat_member) {
      await handleMyChatMember(botId, update.my_chat_member);
    }

    if (update.chat_member) {
      await handleChatMember(botId, update.chat_member);
    }

    // Processar mensagens de texto
    if (update.message) {
      const message = update.message;
      const from = message.from;
      if (!from) return NextResponse.json({ success: true });

      const chatId = message.chat.id;
      const text = message.text || "";

      const { id: botUserId, isFirstContact } = await upsertBotUser(botId, from);

      if (text === "/start" || text.startsWith("/start ")) {
        await handleStart(token, chatId, botId, bot.description, isFirstContact, botUserId);
      } else if (text === "/catalog" || text === "/catalogo") {
        const liveBanner = await getLiveBanner(botId);
        await sendCatalog(token, chatId, botId, liveBanner + "Aqui está o catálogo de conteúdos:");
      } else if (text === "/planos") {
        await handlePlanos(token, chatId, botId);
      } else if (text === "/live") {
        await handleLive(token, chatId, botId, botUserId);
      } else {
        await botManager.sendMessage(
          token,
          chatId,
          "O que você quer fazer?",
          { reply_markup: MENU_KEYBOARD }
        );
      }
    }

    // Processar callbacks (cliques em botões inline)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const from = callbackQuery.from;
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data || "";

      if (!chatId) return NextResponse.json({ success: true });

      const { id: botUserId } = await upsertBotUser(botId, from);

      if (data.startsWith("buy_")) {
        const contentId = data.replace("buy_", "");
        await handleBuyCallback(
          token,
          chatId,
          callbackQuery.id,
          from,
          contentId,
          botId,
          botUserId
        );
      } else if (data.startsWith("sub_")) {
        const planId = data.replace("sub_", "");
        await handleSubscribeCallback(token, chatId, planId, botId, botUserId);
      } else if (data === "cmd_planos") {
        await handlePlanos(token, chatId, botId);
      } else if (data === "cmd_catalogo" || data === "cmd_catalog") {
        const liveBanner = await getLiveBanner(botId);
        await sendCatalog(token, chatId, botId, liveBanner + "Aqui está o catálogo de conteúdos:");
      } else if (data === "cmd_live") {
        await handleLive(token, chatId, botId, botUserId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Telegram Webhook] Erro:", error);
    return NextResponse.json({ success: true });
  }
}
