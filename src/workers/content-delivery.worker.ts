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
    const caption = isFree
      ? `🎁 ${contentItem.title}`
      : isRedelivery
        ? `📦 ${contentItem.title}`
        : `✅ Pagamento confirmado!\n\n📦 ${contentItem.title}`;

    // Pra vídeo, prefere a variante leve (lightKey) se já gerada.
    // Comprado individualmente, o user paga e pode receber a versão
    // leve nesse worker — fluxo aceitável dado que o original tem o
    // mesmo conteúdo. Quem quiser o original em qualidade alta pode
    // baixar fora do Telegram.
    const sendKey =
      contentItem.type === "video" && contentItem.lightKey
        ? contentItem.lightKey
        : contentItem.originalKey;

    await botManager.sendMediaFromKey(token, chatId, {
      type: contentItem.type,
      key: sendKey,
      caption,
    });
  }
);
