/**
 * Processamento inline de jobs — substitui BullMQ/Redis.
 * Todas as funções são fire-and-forget (não bloqueiam a resposta).
 */

import { db } from "@/lib/db";
import { getS3Client } from "@/lib/s3";
import { getPublicUrl } from "@/lib/s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";
import {
  generateImagePreview,
  generateVideoThumbnail,
  generateFilePlaceholder,
} from "@/lib/preview";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

// --- Content Delivery ---

export type ContentDeliveryData = {
  purchaseId: string;
  contentId: string;
  botId: string;
  botUserId: string;
};

export async function deliverContent(data: ContentDeliveryData): Promise<void> {
  const { contentId, botId, botUserId } = data;

  const contentItem = await db.content.findFirst({ where: { id: contentId } });
  if (!contentItem) throw new Error(`Content ${contentId} not found`);

  const bot = await db.bot.findFirst({ where: { id: botId } });
  if (!bot) throw new Error(`Bot ${botId} not found`);

  const botUser = await db.botUser.findFirst({ where: { id: botUserId } });
  if (!botUser) throw new Error(`Bot user ${botUserId} not found`);

  const token = decrypt(bot.telegramToken);
  const chatId = Number(botUser.telegramUserId);

  const downloadUrl = await getPublicUrl(contentItem.originalKey);

  const isFree = contentItem.price.toNumber() === 0;
  const caption = isFree
    ? `🎁 ${contentItem.title}\n\nAqui está o seu conteúdo:`
    : `✅ Pagamento confirmado!\n\n📦 ${contentItem.title}\n\nAqui está o seu conteúdo:`;

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

  await botManager.sendMessage(
    token,
    chatId,
    "⚠️ O link acima expira em 15 minutos. Faça o download agora!"
  );
}

/** Fire-and-forget: enfileira entrega sem bloquear */
export function scheduleContentDelivery(data: ContentDeliveryData): void {
  deliverContent(data).catch((e) =>
    console.error("[ContentDelivery] Erro:", e)
  );
}

// --- Preview Generation ---

export type PreviewGenerationData = {
  contentId: string;
  originalKey: string;
  type: "image" | "video" | "file" | "bundle";
  filename?: string;
};

export async function generatePreview(data: PreviewGenerationData): Promise<void> {
  const { contentId, originalKey, type, filename } = data;
  const { client, config } = await getS3Client();

  let previewBuffer: Buffer;

  if (type === "image") {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: originalKey })
    );
    const originalBuffer = Buffer.from(
      await response.Body!.transformToByteArray()
    );
    previewBuffer = await generateImagePreview(originalBuffer);
  } else if (type === "video") {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: originalKey })
    );
    const fname = filename ?? "video.mp4";
    const tmpPath = path.join(os.tmpdir(), `video_${Date.now()}_${fname}`);
    const videoBuffer = Buffer.from(
      await response.Body!.transformToByteArray()
    );
    await fs.writeFile(tmpPath, videoBuffer);

    try {
      previewBuffer = await generateVideoThumbnail(tmpPath);
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  } else {
    previewBuffer = await generateFilePlaceholder(filename ?? "arquivo");
  }

  const baseName = filename
    ? path.parse(filename).name
    : contentId;
  const previewKey = `previews/${contentId}/${baseName}_preview.jpg`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: previewKey,
      Body: previewBuffer,
      ContentType: "image/jpeg",
    })
  );

  await db.content.update({
    where: { id: contentId },
    data: { previewKey, updatedAt: new Date() },
  });
}

/** Fire-and-forget: gera preview sem bloquear */
export function schedulePreviewGeneration(data: PreviewGenerationData): void {
  generatePreview(data).catch((e) =>
    console.error("[PreviewGeneration] Erro:", e)
  );
}

// --- Notifications ---

export type SubscriptionConfirmedData = {
  subscriptionId: string;
  botId: string;
  botUserId: string;
};

export async function notifySubscriptionConfirmed(data: SubscriptionConfirmedData): Promise<void> {
  const { subscriptionId, botId, botUserId } = data;

  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!subscription) return;

  const bot = await db.bot.findFirst({ where: { id: botId } });
  if (!bot) return;

  const botUser = await db.botUser.findFirst({ where: { id: botUserId } });
  if (!botUser) return;

  const token = decrypt(bot.telegramToken);
  const chatId = Number(botUser.telegramUserId);

  const periodLabels: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };

  const endDateStr = subscription.endDate
    ? subscription.endDate.toLocaleDateString("pt-BR")
    : "—";

  const benefits = (subscription.plan.benefits as string[]) ?? [];
  const benefitsText = benefits.length > 0
    ? benefits.map((b: string) => `  • ${b}`).join("\n")
    : "  • Acesso ao conteúdo do plano";

  const message =
    `✅ *Assinatura ativada!*\n\n` +
    `📋 Plano: *${subscription.plan.name}*\n` +
    `⏰ Período: ${periodLabels[subscription.plan.period] ?? subscription.plan.period}\n` +
    `📅 Válido até: *${endDateStr}*\n\n` +
    `Benefícios:\n${benefitsText}\n\n` +
    `Aproveite! Use /catalogo para ver os conteúdos disponíveis.`;

  await botManager.sendMessage(token, chatId, message, {
    parse_mode: "Markdown",
  });
}

export type LiveAccessGrantedData = {
  botId: string;
  botUserId: string;
};

export async function notifyLiveAccessGranted(data: LiveAccessGrantedData): Promise<void> {
  const { botId, botUserId } = data;

  const bot = await db.bot.findFirst({ where: { id: botId } });
  if (!bot) return;

  const botUser = await db.botUser.findFirst({ where: { id: botUserId } });
  if (!botUser) return;

  const liveStream = await db.liveStream.findUnique({ where: { botId } });
  if (!liveStream || !liveStream.isLive || !liveStream.streamLink) return;

  const token = decrypt(bot.telegramToken);
  const chatId = Number(botUser.telegramUserId);

  await botManager.sendMessage(
    token,
    chatId,
    `✅ *Pagamento confirmado!*\n\n` +
      `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
      `🔗 Acesse: ${liveStream.streamLink}`,
    { parse_mode: "Markdown" }
  );
}

export type LiveNotificationData = {
  botId: string;
  token: string;
  title: string;
};

export async function notifyLiveBroadcast(data: LiveNotificationData): Promise<void> {
  const { botId, token, title } = data;

  const botUsers = await db.botUser.findMany({
    where: { botId },
    select: { telegramUserId: true },
  });

  const message =
    `🔴 *AO VIVO AGORA!*\n\n` +
    `${title}\n\n` +
    `Use /live para acessar a transmissão.`;

  for (let i = 0; i < botUsers.length; i++) {
    try {
      const chatId = Number(botUsers[i].telegramUserId);
      await botManager.sendMessage(token, chatId, message, {
        parse_mode: "Markdown",
      });
      if (i < botUsers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (e) {
      console.warn("[LiveNotification] Erro ao notificar:", e);
    }
  }
}

/** Fire-and-forget wrappers */
export function scheduleSubscriptionConfirmed(data: SubscriptionConfirmedData): void {
  notifySubscriptionConfirmed(data).catch((e) =>
    console.error("[SubscriptionConfirmed] Erro:", e)
  );
}

export function scheduleLiveAccessGranted(data: LiveAccessGrantedData): void {
  notifyLiveAccessGranted(data).catch((e) =>
    console.error("[LiveAccessGranted] Erro:", e)
  );
}

export function scheduleLiveBroadcast(data: LiveNotificationData): void {
  notifyLiveBroadcast(data).catch((e) =>
    console.error("[LiveBroadcast] Erro:", e)
  );
}

// --- Subscription Expiry ---

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
