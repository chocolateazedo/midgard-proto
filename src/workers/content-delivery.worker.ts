import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { content, bots, botUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    const contentItem = await db.query.content.findFirst({
      where: eq(content.id, contentId),
    });
    if (!contentItem) throw new Error(`Content ${contentId} not found`);

    const bot = await db.query.bots.findFirst({
      where: eq(bots.id, botId),
    });
    if (!bot) throw new Error(`Bot ${botId} not found`);

    const botUser = await db.query.botUsers.findFirst({
      where: eq(botUsers.id, botUserId),
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
