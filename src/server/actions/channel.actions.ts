"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  clearPendingChannel,
  getPendingChannel,
} from "@/lib/channel";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import type { ActionResponse } from "@/types";

type Guard = { ok: true; userId: string } | { ok: false; error: string };

async function ensureBotOwner(botId: string): Promise<Guard> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  const bot = await db.bot.findFirst({
    where: { id: botId },
    select: { userId: true },
  });
  if (!bot) return { ok: false, error: "Bot não encontrado" };
  const isStaff = session.user.role === "owner" || session.user.role === "admin";
  if (bot.userId !== session.user.id && !isStaff) {
    return { ok: false, error: "Sem permissão para gerenciar este bot" };
  }
  return { ok: true, userId: session.user.id };
}

export type ChannelStatus = {
  linked: boolean;
  channelId: string | null;
  channelTitle: string | null;
  channelUsername: string | null;
  channelLinkedAt: string | null;
  pending: {
    chatId: string;
    title: string;
    username: string | null;
    detectedAt: string;
  } | null;
};

export async function getChannelStatus(
  botId: string
): Promise<ActionResponse<ChannelStatus>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: {
      channelId: true,
      channelTitle: true,
      channelUsername: true,
      channelLinkedAt: true,
    },
  });
  if (!bot) return { success: false, error: "Bot não encontrado" };

  const pending = bot.channelId ? null : await getPendingChannel(botId);

  return {
    success: true,
    data: {
      linked: Boolean(bot.channelId),
      channelId: bot.channelId?.toString() ?? null,
      channelTitle: bot.channelTitle,
      channelUsername: bot.channelUsername,
      channelLinkedAt: bot.channelLinkedAt?.toISOString() ?? null,
      pending,
    },
  };
}

export async function confirmChannelLink(
  botId: string
): Promise<ActionResponse<{ channelTitle: string }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const pending = await getPendingChannel(botId);
  if (!pending) {
    return {
      success: false,
      error:
        "Nenhum canal detectado. Adicione o bot como administrador do canal e tente novamente.",
    };
  }

  // Valida que o bot realmente tem acesso ao canal (fail fast se o webhook estiver atrasado)
  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { telegramToken: true },
  });
  if (!bot) return { success: false, error: "Bot não encontrado" };

  const token = decrypt(bot.telegramToken);
  const chatId = BigInt(pending.chatId);

  try {
    await botManager.getChat(token, chatId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Bot não consegue acessar o canal: ${message}. Verifique se ele ainda é administrador.`,
    };
  }

  await db.bot.update({
    where: { id: botId },
    data: {
      channelId: chatId,
      channelTitle: pending.title,
      channelUsername: pending.username,
      channelLinkedAt: new Date(),
    },
  });

  await clearPendingChannel(botId);
  revalidatePath(`/dashboard/bots/${botId}/settings`);

  return { success: true, data: { channelTitle: pending.title } };
}

export async function unlinkChannel(
  botId: string
): Promise<ActionResponse<undefined>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  await db.bot.update({
    where: { id: botId },
    data: {
      channelId: null,
      channelTitle: null,
      channelUsername: null,
      channelLinkedAt: null,
    },
  });
  await clearPendingChannel(botId);
  revalidatePath(`/dashboard/bots/${botId}/settings`);

  return { success: true };
}
