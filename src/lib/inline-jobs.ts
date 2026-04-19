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

// Broadcast de conteúdo catálogo a todos assinantes ativos. Enfileira um
// content-delivery job por assinante, sem Purchase envolvida (entrega é
// benefício da assinatura, não venda). Retorna quantidade enfileirada.
export async function broadcastCatalogContent(args: {
  contentId: string;
  botId: string;
}): Promise<number> {
  const activeSubs = await db.subscription.findMany({
    where: {
      botId: args.botId,
      status: "active",
      endDate: { gt: new Date() },
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
 * Enfileira as 4 notificações do ciclo de uma live (T-10, T-5, T-1, T-0)
 * baseado no startAt. Só enfileira as que ainda estão no futuro.
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
    { kind: "T-0", minutesBefore: 0 },
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
