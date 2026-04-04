"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import { decrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import { scheduleLiveBroadcast } from "@/lib/inline-jobs";
import { liveStreamSchema } from "@/lib/validations";
import type { LiveStreamInput } from "@/lib/validations";
import type { ActionResponse, LiveStream } from "@/types";

export async function getLiveStream(
  botId: string
): Promise<ActionResponse<LiveStream | null>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const bot = await getBotById(botId);
    if (!bot) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão" };
    }

    const liveStream = await db.liveStream.findUnique({
      where: { botId },
    });

    return { success: true, data: liveStream };
  } catch (error) {
    console.error("[getLiveStream]", error);
    return { success: false, error: "Erro ao buscar configuração de live" };
  }
}

export async function upsertLiveStream(
  botId: string,
  input: LiveStreamInput
): Promise<ActionResponse<LiveStream>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = liveStreamSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const bot = await getBotById(botId);
    if (!bot) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão" };
    }

    // Verificar se está ativando a live para decidir se notifica
    const existingLive = await db.liveStream.findUnique({ where: { botId } });
    const wasLive = existingLive?.isLive ?? false;
    const isGoingLive = parsed.data.isLive && !wasLive;

    const data = {
      isLive: parsed.data.isLive,
      title: parsed.data.title ?? null,
      description: parsed.data.description ?? null,
      price: (parsed.data.price ?? 0).toFixed(2),
      streamLink: parsed.data.streamLink || null,
      notifySubscribers: parsed.data.notifySubscribers ?? false,
    };

    const liveStream = await db.liveStream.upsert({
      where: { botId },
      create: { botId, ...data },
      update: data,
    });

    // Notificar assinantes se está indo ao vivo e notificação habilitada
    if (isGoingLive && parsed.data.notifySubscribers) {
      try {
        const token = decrypt(bot.telegramToken);
        scheduleLiveBroadcast({
          botId,
          token,
          title: parsed.data.title ?? "Transmissão ao vivo",
        });
      } catch (e) {
        console.error("[upsertLiveStream] Erro ao enfileirar notificação:", e);
      }
    }

    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: liveStream };
  } catch (error) {
    console.error("[upsertLiveStream]", error);
    return { success: false, error: "Erro ao salvar configuração de live" };
  }
}

export async function toggleLive(
  botId: string
): Promise<ActionResponse<{ isLive: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const bot = await getBotById(botId);
    if (!bot) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão" };
    }

    const existing = await db.liveStream.findUnique({ where: { botId } });
    if (!existing) {
      return { success: false, error: "Configure a live antes de ativá-la" };
    }

    const newIsLive = !existing.isLive;

    const updated = await db.liveStream.update({
      where: { botId },
      data: { isLive: newIsLive },
      select: { isLive: true, notifySubscribers: true, title: true },
    });

    // Notificar se está indo ao vivo
    if (newIsLive && updated.notifySubscribers) {
      try {
        const token = decrypt(bot.telegramToken);
        scheduleLiveBroadcast({
          botId,
          token,
          title: updated.title ?? "Transmissão ao vivo",
        });
      } catch (e) {
        console.error("[toggleLive] Erro ao enfileirar notificação:", e);
      }
    }

    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: { isLive: updated.isLive } };
  } catch (error) {
    console.error("[toggleLive]", error);
    return { success: false, error: "Erro ao alterar status da live" };
  }
}
