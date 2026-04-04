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

export type LiveNotificationData = {
  botId: string;
  token: string;
  title: string;
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

export function scheduleLiveBroadcast(data: LiveNotificationData): void {
  getNotificationQueue()
    .add("live-notification", data)
    .catch((e) => console.error("[LiveBroadcast] Erro ao enfileirar:", e));
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
