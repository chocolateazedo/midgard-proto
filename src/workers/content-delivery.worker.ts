import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";

type ContentDeliveryJob = {
  purchaseId: string;
  contentId: string;
  botId: string;
  botUserId: string;
  isRedelivery?: boolean;
};

export const contentDeliveryWorker = createWorker<ContentDeliveryJob>(
  "content-delivery",
  async (job) => {
    const { contentId, botId, botUserId, isRedelivery } = job.data;

    const contentItem = await db.content.findFirst({
      where: { id: contentId },
    });
    if (!contentItem) throw new Error(`Content ${contentId} not found`);

    const bot = await db.bot.findFirst({
      where: { id: botId },
    });
    if (!bot) throw new Error(`Bot ${botId} not found`);

    const botUser = await db.botUser.findFirst({
      where: { id: botUserId },
    });
    if (!botUser) throw new Error(`Bot user ${botUserId} not found`);

    const token = decrypt(bot.telegramToken);
    const chatId = Number(botUser.telegramUserId);

    const isFree = contentItem.price.toNumber() === 0;
    const baseCaption = isFree
      ? `🎁 ${contentItem.title}`
      : isRedelivery
        ? `📦 ${contentItem.title}`
        : `✅ Pagamento confirmado!\n\n📦 ${contentItem.title}`;

    // Vídeo: envia segmentos da variante leve em sequência. Se ainda não
    // foi processado, manda o original (stream multipart até 50 MB).
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
  }
);
