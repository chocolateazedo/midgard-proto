"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  clearPendingChannel,
  getPendingChannel,
} from "@/lib/channel";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  broadcastCatalogContent,
  scheduleSubscriptionConfirmed,
} from "@/lib/inline-jobs";
import { botManager } from "@/lib/telegram";
import {
  isMtprotoMemberOfChannel,
  joinSingleBotChannel,
} from "@/lib/telegram-mtproto";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import type { ActionResponse } from "@/types";

type Guard = { ok: true; userId: string } | { ok: false; error: string };

async function ensureBotOwner(botId: string): Promise<Guard> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  const bot = await db.bot.findFirst({
    where: { id: botId },
    select: { userId: true, user: { select: { managedByUserId: true } } },
  });
  if (!bot) return { ok: false, error: "Bot não encontrado" };
  if (!hasBotManagePermission(bot, session)) {
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

/**
 * Status da conta "Telegram BotFans" (MTProto da plataforma) em
 * relação ao canal vinculado a este bot. Usado pra mostrar status +
 * decidir se o botão "Adicionar" aparece.
 */
export async function getMtprotoChannelStatus(
  botId: string
): Promise<ActionResponse<{
  hasChannel: boolean;
  isMember: boolean | null;
}>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { channelId: true },
  });
  if (!bot) return { success: false, error: "Bot não encontrado" };

  if (!bot.channelId) {
    return { success: true, data: { hasChannel: false, isMember: null } };
  }
  const member = await isMtprotoMemberOfChannel(bot.channelId.toString());
  return {
    success: true,
    data: { hasChannel: true, isMember: member },
  };
}

/**
 * Adiciona a conta "Telegram BotFans" (MTProto) como membro do canal
 * vinculado a este bot. Idempotente — já membro retorna sucesso.
 */
export async function addMtprotoToBotChannel(
  botId: string
): Promise<ActionResponse<{ status: "joined" | "already" }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const result = await joinSingleBotChannel(botId);
  if (result.status === "failed") {
    return { success: false, error: result.error ?? "Falha ao adicionar" };
  }
  revalidatePath(`/dashboard/bots/${botId}/settings`);
  revalidatePath(`/admin/bots/${botId}/settings`);
  return { success: true, data: { status: result.status } };
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

/**
 * Reenfileira `subscription-confirmed` pra toda assinatura ativa no bot.
 * O worker cria um novo invite link single-use + manda DM ao membro.
 * Útil quando a modelo pede pra reenviar o link do canal pra todo mundo.
 */
export async function resendChannelInvites(
  botId: string
): Promise<ActionResponse<{ count: number }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { channelId: true },
  });
  if (!bot?.channelId) {
    return {
      success: false,
      error: "Este bot não tem canal vinculado.",
    };
  }

  const activeSubs = await db.subscription.findMany({
    where: {
      botId,
      status: "active",
      paidAt: { not: null },
      endDate: { gt: new Date() },
    },
    select: { id: true, botUserId: true },
  });

  for (const sub of activeSubs) {
    scheduleSubscriptionConfirmed({
      subscriptionId: sub.id,
      botId,
      botUserId: sub.botUserId,
    });
  }

  return { success: true, data: { count: activeSubs.length } };
}

/**
 * Posta todo o catálogo (Content publicado em deliveryMode=catalog) no canal
 * vinculado, em ordem crescente de createdAt. Reutiliza broadcastCatalogContent
 * — quando há canal, ele posta 1x no canal em vez de DM por assinante.
 */
export async function postCatalogToChannel(
  botId: string
): Promise<ActionResponse<{ posted: number }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { channelId: true },
  });
  if (!bot?.channelId) {
    return { success: false, error: "Este bot não tem canal vinculado." };
  }

  const catalogContent = await db.content.findMany({
    where: {
      botId,
      deliveryMode: "catalog",
      isPublished: true,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (catalogContent.length === 0) {
    return { success: true, data: { posted: 0 } };
  }

  let posted = 0;
  for (const c of catalogContent) {
    try {
      const count = await broadcastCatalogContent({
        contentId: c.id,
        botId,
      });
      posted += count;
    } catch (err) {
      console.error(`[postCatalogToChannel] ${c.id}:`, err);
    }
  }

  return { success: true, data: { posted } };
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
