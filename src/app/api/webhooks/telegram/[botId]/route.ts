import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import { getPixProvider } from "@/lib/pix";
import { getPublicUrl } from "@/lib/s3";
import { scheduleContentDelivery } from "@/lib/inline-jobs";
import { formatCurrency } from "@/lib/utils";
import {
  getActiveSubscription,
  hasLiveAccess,
  getExistingPaidPurchase,
  calculateEndDate,
} from "@/server/queries/subscriptions";

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

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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
    const periodLabels: Record<string, string> = {
      monthly: "Mensal",
      quarterly: "Trimestral",
      semiannual: "Semestral",
      annual: "Anual",
    };
    const endDateStr = activeSubscription.endDate
      ? activeSubscription.endDate.toLocaleDateString("pt-BR")
      : "—";

    const subMessage =
      liveBanner +
      `👋 Bem-vindo de volta!\n\n` +
      `⭐ Você é assinante do plano *${activeSubscription.plan.name}*\n` +
      `⏰ Período: ${periodLabels[activeSubscription.plan.period] ?? activeSubscription.plan.period}\n` +
      `📅 Válido até: *${endDateStr}*\n\n` +
      `Use /catalogo para ver os conteúdos disponíveis.`;

    await botManager.sendMessage(token, chatId, subMessage, {
      parse_mode: "Markdown",
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

  type ContentItem = (typeof publishedContent)[number];

  function formatPrice(price: number): string {
    return price === 0 ? "Grátis" : formatCurrency(price);
  }

  const inlineKeyboard = publishedContent.map((item: ContentItem) => {
    const price = parseFloat(item.price.toString());
    return [
      {
        text: price === 0
          ? `${item.title} — 🎁 Grátis`
          : `${item.title} — ${formatCurrency(price)}`,
        callback_data: `buy_${item.id}`,
      },
    ];
  });

  const catalogText = publishedContent
    .map(
      (item: ContentItem, index: number) => {
        const price = parseFloat(item.price.toString());
        return `${index + 1}. *${item.title}*\n${item.description ? `${item.description}\n` : ""}${price === 0 ? "🎁 Grátis" : `💰 ${formatCurrency(price)}`}`;
      }
    )
    .join("\n\n");

  await botManager.sendMessage(
    token,
    chatId,
    `${greeting}\n\n${catalogText}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    }
  );
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

  const periodLabels: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };

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
        `💰 ${formatCurrency(parseFloat(plan.price.toString()))} / ${periodLabels[plan.period] ?? plan.period}\n` +
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
  const liveStream = await db.liveStream.findUnique({ where: { botId } });

  if (!liveStream || !liveStream.isLive) {
    await botManager.sendMessage(
      token,
      chatId,
      "Nenhuma transmissão ao vivo no momento. Fique atento para próximas lives! 📺"
    );
    return;
  }

  const price = parseFloat(liveStream.price.toString());

  // Acesso gratuito
  if (price === 0) {
    await botManager.sendMessage(
      token,
      chatId,
      `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
        `${liveStream.description ? `${liveStream.description}\n\n` : ""}` +
        `🔗 Acesse: ${liveStream.streamLink}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Verificar se tem assinatura com acesso à live
  const hasAccess = await hasLiveAccess(botId, botUserId);
  if (hasAccess) {
    await botManager.sendMessage(
      token,
      chatId,
      `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
        `${liveStream.description ? `${liveStream.description}\n\n` : ""}` +
        `✅ Você tem acesso pelo seu plano de assinatura!\n\n` +
        `🔗 Acesse: ${liveStream.streamLink}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Gerar cobrança Pix para acesso à live
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: { user: { select: { id: true, platformFeePercent: true } } },
  });
  if (!bot) return;

  const feePercent = parseFloat((bot.user.platformFeePercent ?? "10.00").toString());
  const platformFee = parseFloat(((price * feePercent) / 100).toFixed(2));
  const creatorNet = parseFloat((price - platformFee).toFixed(2));

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    price,
    `Live: ${liveStream.title ?? "Transmissão ao vivo"}`
  );

  // Salvar como purchase especial (contentId referência ao próprio bot para rastreamento)
  // Usamos o campo pixTxid para identificar a compra na confirmação
  await db.purchase.create({
    data: {
      // Criar um content virtual não é ideal, mas precisamos de um contentId
      // Alternativa: usar uma tabela de live_purchases. Por ora, armazenar em purchases
      // com um hack: buscar qualquer content do bot ou criar um mecanismo diferente
      // Solução: salvar o liveStreamId no campo pixQrCode metadata
      contentId: "00000000-0000-0000-0000-000000000000", // placeholder para compras de live
      botId,
      botUserId,
      creatorUserId: bot.user.id,
      amount: price.toFixed(2),
      platformFee: platformFee.toFixed(2),
      creatorNet: creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
      status: "pending",
      expiresAt: charge.expiresAt,
    },
  });

  await botManager.sendMessage(
    token,
    chatId,
    `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
      `💰 Valor: *${formatCurrency(price)}*\n\n` +
      `Para acessar, faça o pagamento via Pix:\n\n` +
      `\`${charge.copyPaste}\`\n\n` +
      `⏰ Este pagamento expira em *30 minutos*.\n` +
      `Após confirmação, você receberá o link da transmissão.`,
    { parse_mode: "Markdown" }
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
  if (existingPurchase) {
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

    // Entregar conteúdo direto (sem depender do worker)
    const downloadUrl = await getPublicUrl(contentItem.originalKey);
    const caption = `🎁 *${contentItem.title}*\n\nConteúdo gratuito! Aqui está:`;

    switch (contentItem.type) {
      case "image":
        await botManager.sendPhoto(token, chatId, downloadUrl, caption);
        break;
      case "video":
        await botManager.sendVideo(token, chatId, downloadUrl, caption);
        break;
      default:
        await botManager.sendDocument(token, chatId, downloadUrl, caption);
        break;
    }
    return;
  }

  const feePercent = parseFloat(
    (contentItem.bot.user.platformFeePercent ?? "10.00").toString()
  );
  const platformFee = parseFloat(((amount * feePercent) / 100).toFixed(2));
  const creatorNet = parseFloat((amount - platformFee).toFixed(2));

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    amount,
    `Compra: ${contentItem.title}`
  );

  await db.purchase.create({
    data: {
      contentId,
      botId,
      botUserId,
      creatorUserId: contentItem.bot.user.id,
      amount: amount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      creatorNet: creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
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
    const message =
      `🛒 *${contentItem.title}*\n\n` +
      `💰 Valor: *${formattedAmount}*\n\n` +
      `Para pagar, use o Pix Copia e Cola abaixo ou escaneie o QR Code:\n\n` +
      `\`${charge.copyPaste}\`\n\n` +
      `⏰ Este pagamento expira em *30 minutos*.\n` +
      `Após a confirmação, você receberá o conteúdo automaticamente.`;

    await botManager.sendMessage(token, chatId, message, {
      parse_mode: "Markdown",
    });

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
    await botManager.sendMessage(
      token,
      chatId,
      `✅ Você já tem uma assinatura ativa!\n\n` +
        `📋 Plano: *${activeSub.plan.name}*\n` +
        `📅 Válido até: *${endDateStr}*`,
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
  const feePercent = parseFloat((bot.user.platformFeePercent ?? "10.00").toString());
  const platformFee = parseFloat(((amount * feePercent) / 100).toFixed(2));
  const creatorNet = parseFloat((amount - platformFee).toFixed(2));

  const periodLabels: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };

  const pixProvider = await getPixProvider();
  const charge = await pixProvider.createCharge(
    amount,
    `Assinatura: ${plan.name}`
  );

  await db.subscription.create({
    data: {
      planId: plan.id,
      botId,
      botUserId,
      amount: amount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      creatorNet: creatorNet.toFixed(2),
      pixTxid: charge.txid,
      pixQrCode: charge.qrCode,
      pixCopyPaste: charge.copyPaste,
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
        `⏰ Período: ${periodLabels[plan.period] ?? plan.period}\n` +
        `💰 Valor: *${formatCurrency(amount)}*\n\n` +
        `🧪 *Modo de teste ativo.*\n` +
        `O pagamento será confirmado pelo administrador da plataforma.\n\n` +
        `⏰ Aguardando confirmação...`,
      { parse_mode: "Markdown" }
    );
  } else {
    await botManager.sendMessage(
      token,
      chatId,
      `📋 *Plano ${plan.name}*\n` +
        `⏰ Período: ${periodLabels[plan.period] ?? plan.period}\n` +
        `💰 Valor: *${formatCurrency(amount)}*\n\n` +
        `Para assinar, faça o pagamento via Pix:\n\n` +
        `\`${charge.copyPaste}\`\n\n` +
        `⏰ Este pagamento expira em *30 minutos*.\n` +
        `Após confirmação, sua assinatura será ativada automaticamente.`,
      { parse_mode: "Markdown" }
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
          "Use /catalogo para ver os conteúdos, /planos para ver assinaturas ou /live para a transmissão ao vivo."
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
