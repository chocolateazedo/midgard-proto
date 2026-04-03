"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import { welcomeMessageSchema } from "@/lib/validations";
import type { WelcomeMessageInput } from "@/lib/validations";
import type { ActionResponse, WelcomeMessage } from "@/types";

export async function getWelcomeMessage(
  botId: string
): Promise<ActionResponse<WelcomeMessage | null>> {
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

    const welcomeMessage = await db.welcomeMessage.findUnique({
      where: { botId },
    });

    return { success: true, data: welcomeMessage };
  } catch (error) {
    console.error("[getWelcomeMessage]", error);
    return { success: false, error: "Erro ao buscar mensagem de boas-vindas" };
  }
}

export async function upsertWelcomeMessage(
  botId: string,
  input: WelcomeMessageInput
): Promise<ActionResponse<WelcomeMessage>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = welcomeMessageSchema.safeParse(input);
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

    const data = {
      text: parsed.data.text,
      mediaType: parsed.data.mediaType ?? null,
      mediaKey: parsed.data.mediaKey ?? null,
      buttons: parsed.data.buttons ?? [],
      sendOnEveryStart: parsed.data.sendOnEveryStart ?? true,
    };

    const welcomeMessage = await db.welcomeMessage.upsert({
      where: { botId },
      create: { botId, ...data },
      update: data,
    });

    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: welcomeMessage };
  } catch (error) {
    console.error("[upsertWelcomeMessage]", error);
    return { success: false, error: "Erro ao salvar mensagem de boas-vindas" };
  }
}
