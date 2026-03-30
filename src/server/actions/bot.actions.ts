"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import { createBotSchema, updateBotSchema } from "@/lib/validations";
import type { CreateBotInput, UpdateBotInput } from "@/lib/validations";
import { getBotById } from "@/server/queries/bots";
import type { ActionResponse, Bot } from "@/types";

function buildWebhookUrl(botId: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/api/webhooks/telegram/${botId}`;
}

export async function createBot(
  input: CreateBotInput
): Promise<ActionResponse<Bot>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = createBotSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { name, telegramToken, description } = parsed.data;

    // Validate token with Telegram API and get bot info
    let botInfo;
    try {
      botInfo = await botManager.getBotInfo(telegramToken);
    } catch {
      return { success: false, error: "Token do Telegram inválido" };
    }

    // Encrypt token before saving
    const encryptedToken = encrypt(telegramToken);

    const [newBot] = await db
      .insert(bots)
      .values({
        userId: session.user.id,
        name,
        username: botInfo.username,
        telegramToken: encryptedToken,
        description: description ?? null,
        isActive: false,
      })
      .returning();

    const webhookUrl = buildWebhookUrl(newBot.id);

    // Set webhook and activate
    try {
      await botManager.setWebhook(telegramToken, webhookUrl);

      const [updatedBot] = await db
        .update(bots)
        .set({ webhookUrl, isActive: true, updatedAt: new Date() })
        .where(eq(bots.id, newBot.id))
        .returning();

      revalidatePath("/dashboard/bots");
      return { success: true, data: updatedBot };
    } catch (webhookError) {
      console.error("[createBot] webhook error", webhookError);
      // Return bot even if webhook fails; can reactivate later
      revalidatePath("/dashboard/bots");
      return { success: true, data: newBot };
    }
  } catch (error) {
    console.error("[createBot]", error);
    return { success: false, error: "Erro interno ao criar bot" };
  }
}

export async function updateBot(
  botId: string,
  input: UpdateBotInput
): Promise<ActionResponse<Bot>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = updateBotSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const existing = await getBotById(botId);
    if (!existing) {
      return { success: false, error: "Bot não encontrado" };
    }

    // Only owner of the bot or admin/owner role can update
    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para editar este bot" };
    }

    const updateData: Partial<{
      name: string;
      description: string | null;
      telegramToken: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined)
      updateData.description = parsed.data.description ?? null;

    // If a new token is provided, validate and re-encrypt
    if (parsed.data.telegramToken) {
      try {
        const botInfo = await botManager.getBotInfo(parsed.data.telegramToken);
        updateData.telegramToken = encrypt(parsed.data.telegramToken);

        // Re-set webhook with new token
        const webhookUrl = buildWebhookUrl(botId);
        await botManager.setWebhook(parsed.data.telegramToken, webhookUrl);

        // Update username in case it changed
        await db
          .update(bots)
          .set({ username: botInfo.username })
          .where(eq(bots.id, botId));
      } catch {
        return { success: false, error: "Novo token do Telegram inválido" };
      }
    }

    const [updated] = await db
      .update(bots)
      .set(updateData)
      .where(eq(bots.id, botId))
      .returning();

    revalidatePath(`/dashboard/bots/${botId}`);
    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateBot]", error);
    return { success: false, error: "Erro interno ao atualizar bot" };
  }
}

export async function deleteBot(
  botId: string
): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getBotById(botId);
    if (!existing) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para excluir este bot" };
    }

    // Delete webhook from Telegram before removing from DB
    try {
      const plainToken = decrypt(existing.telegramToken);
      await botManager.deleteWebhook(plainToken);
      await botManager.stopBot(botId);
    } catch (webhookError) {
      console.error("[deleteBot] webhook cleanup error", webhookError);
      // Continue with deletion even if webhook cleanup fails
    }

    await db.delete(bots).where(eq(bots.id, botId));

    revalidatePath("/dashboard/bots");

    return { success: true };
  } catch (error) {
    console.error("[deleteBot]", error);
    return { success: false, error: "Erro interno ao excluir bot" };
  }
}

export async function toggleBot(
  botId: string
): Promise<ActionResponse<{ isActive: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getBotById(botId);
    if (!existing) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para alterar este bot" };
    }

    const newActive = !existing.isActive;
    const plainToken = decrypt(existing.telegramToken);
    const webhookUrl = buildWebhookUrl(botId);

    try {
      if (newActive) {
        await botManager.startBot(botId, plainToken, webhookUrl);
      } else {
        await botManager.stopBot(botId);
      }
    } catch (telegramError) {
      console.error("[toggleBot] telegram error", telegramError);
      return {
        success: false,
        error: "Erro ao comunicar com o Telegram. Verifique o token.",
      };
    }

    const [updated] = await db
      .update(bots)
      .set({
        isActive: newActive,
        webhookUrl: newActive ? webhookUrl : null,
        updatedAt: new Date(),
      })
      .where(eq(bots.id, botId))
      .returning({ isActive: bots.isActive });

    revalidatePath(`/dashboard/bots`);
    revalidatePath(`/dashboard/bots/${botId}`);

    return { success: true, data: { isActive: updated.isActive ?? false } };
  } catch (error) {
    console.error("[toggleBot]", error);
    return { success: false, error: "Erro interno ao alterar status do bot" };
  }
}

export async function reactivateWebhook(
  botId: string
): Promise<ActionResponse<{ webhookUrl: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getBotById(botId);
    if (!existing) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.userId !== session.user.id && !isOwnerRole) {
      return {
        success: false,
        error: "Sem permissão para reativar webhook deste bot",
      };
    }

    const plainToken = decrypt(existing.telegramToken);
    const webhookUrl = buildWebhookUrl(botId);

    await botManager.setWebhook(plainToken, webhookUrl);

    await db
      .update(bots)
      .set({ webhookUrl, isActive: true, updatedAt: new Date() })
      .where(eq(bots.id, botId));

    revalidatePath(`/dashboard/bots/${botId}`);
    revalidatePath(`/dashboard/bots/${botId}/settings`);

    return { success: true, data: { webhookUrl } };
  } catch (error) {
    console.error("[reactivateWebhook]", error);
    return { success: false, error: "Erro interno ao reativar webhook" };
  }
}
