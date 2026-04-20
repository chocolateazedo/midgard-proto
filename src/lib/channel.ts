import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";

// Helpers pra gestão de canal vinculado ao bot.
// Pending channel: quando a modelo adiciona o bot como admin de um canal,
// o webhook `my_chat_member` captura o chat_id e guarda em Redis TTL curto.
// O dashboard lê esse valor pra confirmar a vinculação.

const PENDING_TTL_SECONDS = 600; // 10 min pra modelo clicar "vincular"

type PendingChannel = {
  chatId: string; // BigInt como string (JSON safe)
  title: string;
  username: string | null;
  detectedAt: string; // ISO
};

function pendingKey(botId: string): string {
  return `botfans:bot:${botId}:pending_channel`;
}

export async function setPendingChannel(
  botId: string,
  data: { chatId: bigint; title: string; username: string | null }
): Promise<void> {
  const redis = getRedisConnection();
  const value: PendingChannel = {
    chatId: data.chatId.toString(),
    title: data.title,
    username: data.username,
    detectedAt: new Date().toISOString(),
  };
  await redis.set(pendingKey(botId), JSON.stringify(value), "EX", PENDING_TTL_SECONDS);
}

export async function getPendingChannel(
  botId: string
): Promise<PendingChannel | null> {
  const redis = getRedisConnection();
  const raw = await redis.get(pendingKey(botId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingChannel;
  } catch {
    return null;
  }
}

export async function clearPendingChannel(botId: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.del(pendingKey(botId));
}

/**
 * Retorna bot com canal vinculado ou null. Inclui dados do user pra fee.
 */
export async function getBotWithChannel(botId: string) {
  return db.bot.findFirst({
    where: { id: botId },
    select: {
      id: true,
      telegramToken: true,
      channelId: true,
      channelTitle: true,
      channelUsername: true,
    },
  });
}
