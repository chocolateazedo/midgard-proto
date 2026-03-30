import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { generatePresignedDownloadUrl } from "@/lib/s3";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";

type ContentDeliveryJob = {
  purchaseId: string;
  contentId: string;
  botId: string;
  botUserId: string;
};

export const contentDeliveryWorker = createWorker<ContentDeliveryJob>(
  "content-delivery",
  async (job) => {
    const { contentId, botId, botUserId } = job.data;

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

    const downloadUrl = await generatePresignedDownloadUrl(
      contentItem.originalKey,
      900
    );

    const caption = `✅ Pagamento confirmado!\n\n📦 ${contentItem.title}\n\nAqui está o seu conteúdo:`;

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
);
