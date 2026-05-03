/**
 * Funções de enfileiramento via BullMQ.
 * Cada schedule* adiciona um job na fila correspondente.
 * O processamento real acontece nos workers (src/workers/).
 */

import {
  getContentDeliveryQueue,
  getPreviewGenerationQueue,
  getNotificationQueue,
} from "@/lib/queue";
import { db } from "@/lib/db";

// --- Content Delivery ---

export type ContentDeliveryData = {
  purchaseId: string;
  contentId: string;
  botId: string;
  botUserId: string;
  isRedelivery?: boolean;
};

export function scheduleContentDelivery(data: ContentDeliveryData): void {
  getContentDeliveryQueue()
    .add("deliver", data)
    .catch((e) => console.error("[ContentDelivery] Erro ao enfileirar:", e));
}

// Broadcast de conteúdo catálogo.
// Se bot tem canal vinculado → posta uma vez no canal, retorna 1.
// Senão → enfileira content-delivery job por assinante ativo, retorna quantidade.
// Quando há canal, assinantes já estão dentro (o worker de expiry remove
// quem venceu) — não precisa broadcast DM redundante.
export async function broadcastCatalogContent(args: {
  contentId: string;
  botId: string;
}): Promise<number> {
  const bot = await db.bot.findUnique({
    where: { id: args.botId },
    select: { channelId: true, telegramToken: true },
  });
  if (!bot) return 0;

  if (bot.channelId) {
    const posted = await postCatalogContentToChannel({
      contentId: args.contentId,
      channelId: bot.channelId,
      telegramToken: bot.telegramToken,
    });
    return posted ? 1 : 0;
  }

  // Filtra opt-out + bloqueio antes de enfileirar — broadcast subscriber
  // respeita marketing opt-out. Join com BotUser pra ter os flags.
  const activeSubs = await db.subscription.findMany({
    where: {
      botId: args.botId,
      status: "active",
      endDate: { gt: new Date() },
      botUser: {
        optedOutAt: null,
        blockedBotAt: null,
      },
    },
    select: { botUserId: true },
    distinct: ["botUserId"],
  });

  if (activeSubs.length === 0) return 0;

  const queue = getContentDeliveryQueue();
  await Promise.all(
    activeSubs.map((s) =>
      queue.add("deliver", {
        purchaseId: `catalog-${args.contentId}-${s.botUserId}`,
        contentId: args.contentId,
        botId: args.botId,
        botUserId: s.botUserId,
      } satisfies ContentDeliveryData)
    )
  );

  return activeSubs.length;
}

async function postCatalogContentToChannel(args: {
  contentId: string;
  channelId: bigint;
  telegramToken: string;
}): Promise<boolean> {
  const { decrypt } = await import("@/lib/crypto");
  const { botManager } = await import("@/lib/telegram");

  const content = await db.content.findUnique({
    where: { id: args.contentId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      originalKey: true,
      lightKeys: true,
    },
  });
  if (!content) return false;

  const token = decrypt(args.telegramToken);
  const baseCaption = [
    `*${content.title}*`,
    content.description ? "" : null,
    content.description ?? "",
  ]
    .filter((p) => p !== null)
    .join("\n");

  // Pra vídeo: itera lightKeys (segmentos em ordem). 1 segmento = post
  // único. >1 segmento = "Parte 1/N", "Parte 2/N"... Sem lightKeys (ainda
  // não processado), tenta enviar o original via stream multipart.
  // Image continua sempre no original.
  try {
    const channelId = Number(args.channelId);

    if (content.type === "video" && content.lightKeys.length > 0) {
      const total = content.lightKeys.length;
      for (let i = 0; i < total; i++) {
        const partLabel = total > 1 ? `Parte ${i + 1}/${total}\n\n` : "";
        const caption = i === 0 ? `${partLabel}${baseCaption}` : partLabel.trim();
        await botManager.sendMediaFromKey(token, channelId, {
          type: "video",
          key: content.lightKeys[i],
          caption,
        });
      }
      return true;
    }

    await botManager.sendMediaFromKey(token, channelId, {
      type: content.type,
      key: content.originalKey,
      caption: baseCaption,
      options: content.type === "image" ? { parse_mode: "Markdown" } : undefined,
    });
    return true;
  } catch (err) {
    console.error(
      `[broadcastCatalogContent] Falha postando no canal ${args.channelId}:`,
      err
    );
    return false;
  }
}

/**
 * Notifica todos os BotUsers do bot que um conteúdo unitário (deliveryMode=ondemand)
 * está disponível pra compra. Mensagem teaser com título/preço + botão de compra,
 * mesmo formato de cada item de /catalogo. Não entrega o conteúdo — só anuncia.
 *
 * Disparado quando:
 *  - publishContent (deliveryMode=ondemand, sem agendamento)
 *  - content-schedule-enforcer dispara um agendado de tipo individual
 */
export async function notifyIndividualContentToBotUsers(args: {
  contentId: string;
  botId: string;
}): Promise<number> {
  const { decrypt } = await import("@/lib/crypto");
  const { botManager } = await import("@/lib/telegram");
  const { getPublicUrl } = await import("@/lib/s3");
  const { formatCurrency } = await import("@/lib/utils");

  const [bot, content] = await Promise.all([
    db.bot.findUnique({
      where: { id: args.botId },
      select: { telegramToken: true, isActive: true },
    }),
    db.content.findUnique({
      where: { id: args.contentId },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        thumbnailKey: true,
      },
    }),
  ]);
  if (!bot?.isActive || !content) return 0;

  const token = decrypt(bot.telegramToken);
  const price = content.price.toNumber();
  const priceLabel = price === 0 ? "🎁 Grátis" : `💰 ${formatCurrency(price)}`;
  const caption = `*${content.title}*\n${
    content.description ? `${content.description}\n` : ""
  }${priceLabel}`;
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text:
            price === 0
              ? "🎁 Obter Grátis"
              : `Comprar — ${formatCurrency(price)}`,
          callback_data: `buy_${content.id}`,
        },
      ],
    ],
  };

  let thumbUrl: string | null = null;
  if (content.thumbnailKey) {
    try {
      thumbUrl = await getPublicUrl(content.thumbnailKey);
    } catch (e) {
      console.warn("[notifyIndividualContent] thumbnail falhou:", e);
    }
  }

  const users = await db.botUser.findMany({
    where: {
      botId: args.botId,
      optedOutAt: null,
      blockedBotAt: null,
    },
    select: { telegramUserId: true },
  });
  if (users.length === 0) return 0;

  const { sendWithMessageabilityGate } = await import("@/lib/messageability");
  let sent = 0;
  for (const u of users) {
    const chatId = Number(u.telegramUserId);
    try {
      const r = await sendWithMessageabilityGate(
        { botId: args.botId, telegramUserId: u.telegramUserId },
        async () => {
          if (thumbUrl) {
            await botManager.sendPhoto(token, chatId, thumbUrl, caption, {
              parse_mode: "Markdown",
              reply_markup: replyMarkup,
            });
          } else {
            await botManager.sendMessage(token, chatId, caption, {
              parse_mode: "Markdown",
              reply_markup: replyMarkup,
            });
          }
        },
      );
      if (r.ok) sent += 1;
    } catch (err) {
      console.warn(
        `[notifyIndividualContent] falha enviando pra ${chatId}:`,
        err,
      );
    }
  }

  return sent;
}

// --- Preview Generation ---

export type PreviewGenerationData = {
  contentId: string;
  originalKey: string;
  type: "image" | "video" | "file" | "bundle";
  filename?: string;
};

export function schedulePreviewGeneration(data: PreviewGenerationData): void {
  getPreviewGenerationQueue()
    .add("generate", data)
    .catch((e) => console.error("[PreviewGeneration] Erro ao enfileirar:", e));
}

// --- Notifications ---

export type SubscriptionConfirmedData = {
  subscriptionId: string;
  botId: string;
  botUserId: string;
};

export type LiveAccessGrantedData = {
  botId: string;
  botUserId: string;
};

export type LiveNotificationKind = "T-10" | "T-5" | "T-1" | "T-0";

export type LiveNotificationData = {
  botId: string;
  token: string;
  title: string;
  // Se definido, worker checa status do schedule antes de enviar —
  // permite cancelamento de notificações agendadas.
  scheduleId?: string;
  kind?: LiveNotificationKind;
};

export function scheduleSubscriptionConfirmed(data: SubscriptionConfirmedData): void {
  getNotificationQueue()
    .add("subscription-confirmed", data)
    .catch((e) => console.error("[SubscriptionConfirmed] Erro ao enfileirar:", e));
}

export function scheduleLiveAccessGranted(data: LiveAccessGrantedData): void {
  getNotificationQueue()
    .add("live-access-granted", data)
    .catch((e) => console.error("[LiveAccessGranted] Erro ao enfileirar:", e));
}

export function scheduleLiveBroadcast(
  data: LiveNotificationData,
  delayMs?: number
): void {
  getNotificationQueue()
    .add("live-notification", data, delayMs ? { delay: delayMs } : undefined)
    .catch((e) => console.error("[LiveBroadcast] Erro ao enfileirar:", e));
}

/**
 * Enfileira as notificações pré-live (T-10, T-5, T-1). A notificação T-0
 * ("AO VIVO") é disparada separadamente pelo beginBrowserBroadcast com o
 * link real da transmissão — assim o assinante recebe o link quando a
 * modelo efetivamente inicia, não só porque chegou o horário.
 */
export function scheduleLiveCountdownNotifications(args: {
  botId: string;
  token: string;
  title: string;
  scheduleId: string;
  startAt: Date;
}): number {
  const { botId, token, title, scheduleId, startAt } = args;
  const now = Date.now();
  const thresholds: { kind: LiveNotificationKind; minutesBefore: number }[] = [
    { kind: "T-10", minutesBefore: 10 },
    { kind: "T-5", minutesBefore: 5 },
    { kind: "T-1", minutesBefore: 1 },
  ];
  let scheduled = 0;
  for (const t of thresholds) {
    const fireAt = startAt.getTime() - t.minutesBefore * 60_000;
    const delay = fireAt - now;
    // Tolerância de 15s: se já passou do momento, pula.
    if (delay < -15_000) continue;
    scheduleLiveBroadcast(
      { botId, token, title, scheduleId, kind: t.kind },
      Math.max(0, delay)
    );
    scheduled++;
  }
  return scheduled;
}

// --- Subscription Expiry ---

/**
 * Verificação direta de expiração de assinaturas.
 * Mantida como função direta para o endpoint /api/cron/subscription-expiry.
 * Também processada pelo worker subscription-expiry via job repetitivo.
 */
export async function checkSubscriptionExpiry(): Promise<number> {
  const now = new Date();
  const expired = await db.subscription.findMany({
    where: { status: "active", endDate: { lt: now } },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  await db.subscription.updateMany({
    where: { id: { in: expired.map((s) => s.id) } },
    data: { status: "expired" },
  });

  return expired.length;
}
