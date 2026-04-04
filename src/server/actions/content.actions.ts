"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/s3";
import { schedulePreviewGeneration } from "@/lib/inline-jobs";
import { createContentSchema, updateContentSchema } from "@/lib/validations";
import type { CreateContentInput, UpdateContentInput } from "@/lib/validations";
import { getContentById } from "@/server/queries/content";
import { getBotById } from "@/server/queries/bots";
import type { ActionResponse, Content } from "@/types";

export async function createContent(
  input: CreateContentInput
): Promise<ActionResponse<Content>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = createContentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { botId, title, description, type, price, originalKey, isPublished } =
      parsed.data;

    // Verify the bot belongs to the current user
    const bot = await getBotById(botId);
    if (!bot) {
      return { success: false, error: "Bot não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para adicionar conteúdo a este bot" };
    }

    const newContent = await db.content.create({
      data: {
        botId,
        userId: session.user.id,
        title,
        description: description ?? null,
        type,
        price: String(price),
        originalKey,
        isPublished: isPublished ?? false,
      },
    });

    // Gerar preview em background (fire-and-forget)
    schedulePreviewGeneration({
      contentId: newContent.id,
      originalKey,
      type,
    });

    revalidatePath(`/dashboard/bots/${botId}/content`);

    return { success: true, data: newContent as Content };
  } catch (error) {
    console.error("[createContent]", error);
    return { success: false, error: "Erro interno ao criar conteúdo" };
  }
}

export async function updateContent(
  contentId: string,
  input: UpdateContentInput
): Promise<ActionResponse<Content>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = updateContentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const existing = await getContentById(contentId);
    if (!existing) {
      return { success: false, error: "Conteúdo não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para editar este conteúdo" };
    }

    const updateData: Partial<{
      title: string;
      description: string | null;
      price: string;
      isPublished: boolean;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined)
      updateData.description = parsed.data.description ?? null;
    if (parsed.data.price !== undefined)
      updateData.price = String(parsed.data.price);
    if (parsed.data.isPublished !== undefined)
      updateData.isPublished = parsed.data.isPublished;

    const updated = await db.content.update({
      where: { id: contentId },
      data: updateData,
    });

    revalidatePath(`/dashboard/bots/${existing.botId}/content`);

    return { success: true, data: updated as Content };
  } catch (error) {
    console.error("[updateContent]", error);
    return { success: false, error: "Erro interno ao atualizar conteúdo" };
  }
}

export async function deleteContent(
  contentId: string
): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getContentById(contentId);
    if (!existing) {
      return { success: false, error: "Conteúdo não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.bot.userId !== session.user.id && !isOwnerRole) {
      return { success: false, error: "Sem permissão para excluir este conteúdo" };
    }

    // Delete S3 objects (original + preview if exists)
    const deletePromises: Promise<void>[] = [
      deleteObject(existing.originalKey),
    ];
    if (existing.previewKey) {
      deletePromises.push(deleteObject(existing.previewKey));
    }

    // Best-effort S3 cleanup — don't block DB deletion on storage errors
    await Promise.allSettled(deletePromises);

    await db.content.delete({ where: { id: contentId } });

    revalidatePath(`/dashboard/bots/${existing.botId}/content`);

    return { success: true };
  } catch (error) {
    console.error("[deleteContent]", error);
    return { success: false, error: "Erro interno ao excluir conteúdo" };
  }
}

export async function togglePublish(
  contentId: string
): Promise<ActionResponse<{ isPublished: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getContentById(contentId);
    if (!existing) {
      return { success: false, error: "Conteúdo não encontrado" };
    }

    const isOwnerRole =
      session.user.role === "owner" || session.user.role === "admin";
    if (existing.bot.userId !== session.user.id && !isOwnerRole) {
      return {
        success: false,
        error: "Sem permissão para alterar este conteúdo",
      };
    }

    const newPublished = !existing.isPublished;

    const updated = await db.content.update({
      where: { id: contentId },
      data: { isPublished: newPublished, updatedAt: new Date() },
      select: { isPublished: true },
    });

    revalidatePath(`/dashboard/bots/${existing.botId}/content`);

    return {
      success: true,
      data: { isPublished: updated.isPublished ?? false },
    };
  } catch (error) {
    console.error("[togglePublish]", error);
    return {
      success: false,
      error: "Erro interno ao alterar status de publicação",
    };
  }
}
