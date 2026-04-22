"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import { ensureManagerOwnsCreator } from "@/server/queries/managers";
import type { ActionResponse } from "@/types";

async function requireManagerSession() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado" as const };
  if (session.user.role !== "manager") {
    return { error: "Sem permissão de gestor" as const };
  }
  return { session };
}

function buildWebhookUrl(botId: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/api/webhooks/telegram/${botId}`;
}

/**
 * Manager cria um creator sob sua gestão (+ o primeiro bot).
 */
export async function createCreatorWithBot(input: {
  name: string;
  email: string;
  password: string;
  botName: string;
  botToken: string;
  botDescription?: string;
  managerFeePercent: number;
}): Promise<ActionResponse<{ userId: string; botId: string }>> {
  try {
    const { session, error } = await requireManagerSession();
    if (error || !session) return { success: false, error: error ?? "Não autenticado" };

    if (!input.name || input.name.length < 2) {
      return { success: false, error: "Nome deve ter pelo menos 2 caracteres" };
    }
    if (!input.email || !input.email.includes("@")) {
      return { success: false, error: "Email inválido" };
    }
    if (!input.password || input.password.length < 6) {
      return { success: false, error: "Senha deve ter pelo menos 6 caracteres" };
    }
    if (input.managerFeePercent < 0 || input.managerFeePercent > 100) {
      return { success: false, error: "Taxa do gestor deve estar entre 0 e 100" };
    }

    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) return { success: false, error: "Email já cadastrado" };

    let botInfo;
    try {
      botInfo = await botManager.getBotInfo(input.botToken);
    } catch {
      return { success: false, error: "Token do bot inválido (verifique no BotFather)" };
    }

    const passwordHash = await hash(input.password, 12);
    const encryptedToken = encrypt(input.botToken);

    const newUser = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "creator",
        isActive: false,
        docStatus: "none",
        mustChangePassword: true,
        managedByUserId: session.user.id,
        managerFeePercent: String(input.managerFeePercent),
      },
    });

    const newBot = await db.bot.create({
      data: {
        userId: newUser.id,
        name: input.botName,
        username: botInfo.username,
        telegramToken: encryptedToken,
        description: input.botDescription ?? null,
        isActive: false,
      },
    });

    const webhookUrl = buildWebhookUrl(newBot.id);
    try {
      await botManager.setWebhook(input.botToken, webhookUrl);
      await db.bot.update({
        where: { id: newBot.id },
        data: { webhookUrl, isActive: true, updatedAt: new Date() },
      });
    } catch (webhookError) {
      console.error("[createCreatorWithBot] webhook error", webhookError);
    }

    revalidatePath("/manager/creators");
    revalidatePath("/manager/bots");
    return { success: true, data: { userId: newUser.id, botId: newBot.id } };
  } catch (error) {
    console.error("[createCreatorWithBot]", error);
    return { success: false, error: "Erro interno ao criar creator" };
  }
}

/**
 * Manager cria um bot adicional pra um creator seu.
 */
export async function createBotForManagedCreator(input: {
  creatorUserId: string;
  botName: string;
  botToken: string;
  botDescription?: string;
}): Promise<ActionResponse<{ botId: string }>> {
  try {
    const { session, error } = await requireManagerSession();
    if (error || !session) return { success: false, error: error ?? "Não autenticado" };

    const owns = await ensureManagerOwnsCreator(session.user.id, input.creatorUserId);
    if (!owns) return { success: false, error: "Creator não pertence a este gestor" };

    let botInfo;
    try {
      botInfo = await botManager.getBotInfo(input.botToken);
    } catch {
      return { success: false, error: "Token do bot inválido" };
    }

    const encryptedToken = encrypt(input.botToken);
    const newBot = await db.bot.create({
      data: {
        userId: input.creatorUserId,
        name: input.botName,
        username: botInfo.username,
        telegramToken: encryptedToken,
        description: input.botDescription ?? null,
        isActive: false,
      },
    });

    const webhookUrl = buildWebhookUrl(newBot.id);
    try {
      await botManager.setWebhook(input.botToken, webhookUrl);
      await db.bot.update({
        where: { id: newBot.id },
        data: { webhookUrl, isActive: true, updatedAt: new Date() },
      });
    } catch (webhookError) {
      console.error("[createBotForManagedCreator] webhook error", webhookError);
    }

    revalidatePath("/manager/bots");
    return { success: true, data: { botId: newBot.id } };
  } catch (error) {
    console.error("[createBotForManagedCreator]", error);
    return { success: false, error: "Erro interno ao criar bot" };
  }
}

/**
 * Manager ajusta a taxa que ele cobra do creator ou o isActive do creator.
 */
export async function updateManagedCreator(
  creatorId: string,
  input: { managerFeePercent?: number; isActive?: boolean }
): Promise<ActionResponse<undefined>> {
  try {
    const { session, error } = await requireManagerSession();
    if (error || !session) return { success: false, error: error ?? "Não autenticado" };

    const owns = await ensureManagerOwnsCreator(session.user.id, creatorId);
    if (!owns) return { success: false, error: "Creator não pertence a este gestor" };

    const data: {
      managerFeePercent?: string;
      isActive?: boolean;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.managerFeePercent !== undefined) {
      if (input.managerFeePercent < 0 || input.managerFeePercent > 100) {
        return { success: false, error: "Taxa deve estar entre 0 e 100" };
      }
      data.managerFeePercent = String(input.managerFeePercent);
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await db.user.update({ where: { id: creatorId }, data });
    revalidatePath("/manager/creators");
    revalidatePath(`/manager/creators/${creatorId}`);
    return { success: true };
  } catch (error) {
    console.error("[updateManagedCreator]", error);
    return { success: false, error: "Erro interno" };
  }
}
