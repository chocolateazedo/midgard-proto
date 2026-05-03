"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import { deleteObject } from "@/lib/s3";
import {
  broadcastCatalogContent,
  schedulePreviewGeneration,
} from "@/lib/inline-jobs";
import {
  createContentSchema,
  publishContentSchema,
  reschedulePublishSchema,
  updateContentSchema,
} from "@/lib/validations";
import type {
  CreateContentInput,
  PublishContentInput,
  ReschedulePublishInput,
  UpdateContentInput,
} from "@/lib/validations";
import {
  getContentById,
  listContentByBotIdPaginated,
  type SerializedContentItem,
} from "@/server/queries/content";
import { getBotById } from "@/server/queries/bots";
import type { ActionResponse, Content } from "@/types";

/**
 * Lista paginada de Content por aba (subscribers/individual/scheduled).
 * Gated pelo mesmo hasBotManagePermission usado em editar/excluir.
 */
export async function listContentForBotTab(
  botId: string,
  tab: "subscribers" | "individual" | "scheduled",
  page = 1,
  pageSize = 20,
): Promise<ActionResponse<{
  items: SerializedContentItem[];
  total: number;
  page: number;
  pageSize: number;
}>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado" };

  const bot = await getBotById(botId);
  if (!bot) return { success: false, error: "Bot não encontrado" };
  if (!hasBotManagePermission(bot, session)) {
    return { success: false, error: "Sem permissão" };
  }

  const data = await listContentByBotIdPaginated(botId, {
    tab,
    page,
    pageSize,
  });
  return { success: true, data };
}

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

    const { botId, title, description, type, price, originalKey, availability } =
      parsed.data;

    // Verify the bot belongs to the current user
    const bot = await getBotById(botId);
    if (!bot) {
      return { success: false, error: "Bot não encontrado" };
    }

    if (!hasBotManagePermission(bot, session)) {
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
        availability: availability ?? "available",
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

    if (!hasBotManagePermission(existing.bot, session)) {
      return { success: false, error: "Sem permissão para editar este conteúdo" };
    }

    const updateData: Partial<{
      title: string;
      description: string | null;
      price: string;
      availability: "available" | "inactive";
      deliveryMode: "ondemand" | "catalog";
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined)
      updateData.description = parsed.data.description ?? null;
    if (parsed.data.price !== undefined)
      updateData.price = String(parsed.data.price);
    if (parsed.data.availability !== undefined)
      updateData.availability = parsed.data.availability;
    if (parsed.data.deliveryMode !== undefined)
      updateData.deliveryMode = parsed.data.deliveryMode;

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

    if (!hasBotManagePermission(existing.bot, session)) {
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

/**
 * Action unificada do fluxo "+ Publicar". Cria Content e decide entre:
 *  - Publicar agora ondemand → availability=available, aparece em /catalogo do bot pra compra.
 *  - Publicar agora catalog → posta no canal vinculado (ou DM aos assinantes se sem canal),
 *    marca sentToChannelAt pra não reenviar em bulk.
 *  - Agendar (qualquer modo) → scheduledAt futuro, worker content-schedule-enforcer
 *    dispara quando a hora chegar.
 */
export async function publishContent(
  input: PublishContentInput
): Promise<ActionResponse<{ contentId: string; broadcastCount?: number }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = publishContentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const { botId, title, description, type, originalKey, deliveryMode, price, scheduledAt } =
      parsed.data;

    const bot = await getBotById(botId);
    if (!bot) return { success: false, error: "Bot não encontrado" };

    if (!hasBotManagePermission(bot, session)) {
      return { success: false, error: "Sem permissão para publicar neste bot" };
    }

    const isScheduled = scheduledAt instanceof Date && scheduledAt.getTime() > Date.now();
    // Catalog ignora price (benefício da assinatura). Ondemand exige > 0.
    const finalPrice = deliveryMode === "catalog" ? 0 : (price ?? 0);

    // Aplica preço mínimo global (somente em conteúdo pago).
    if (finalPrice > 0) {
      const { assertMinTransactionPrice } = await import("@/lib/payment-limits");
      const check = await assertMinTransactionPrice(finalPrice);
      if (!check.ok) {
        return { success: false, error: check.message };
      }
    }

    const now = new Date();
    const content = await db.content.create({
      data: {
        botId,
        userId: session.user.id,
        title,
        description: description ?? null,
        type,
        price: String(finalPrice),
        originalKey,
        deliveryMode,
        scheduledAt: isScheduled ? scheduledAt : null,
        // Conteúdo nasce sempre available; quando inativado, fica fora dos fluxos.
        availability: "available",
        // Publicação imediata grava publishedAt; agendada fica pendente pro worker.
        publishedAt: isScheduled ? null : now,
      },
    });

    // Gerar preview sempre em background (mesmo pra catalog — útil se virar destaque).
    schedulePreviewGeneration({ contentId: content.id, originalKey, type });

    // Pra vídeos, enfileira variante leve em paralelo. Worker decide
    // se é necessário (skip quando original já está sob ~45 MB).
    if (type === "video") {
      try {
        const { getVideoLightQueue } = await import("@/lib/queue");
        await getVideoLightQueue().add(
          "generate-light",
          { contentId: content.id },
          { jobId: `light-${content.id}` }
        );
      } catch (e) {
        console.error("[publishContent] enqueue light falhou:", e);
      }
    }

    let broadcastCount: number | undefined;
    if (!isScheduled && deliveryMode === "catalog") {
      try {
        broadcastCount = await broadcastCatalogContent({
          contentId: content.id,
          botId,
        });
        // Marca como já enviado ao canal — bulk "Postar Catálogo" não reenvia.
        await db.content.update({
          where: { id: content.id },
          data: { sentToChannelAt: new Date() },
        });
      } catch (err) {
        console.error("[publishContent] broadcast falhou:", err);
      }
    }

    revalidatePath(`/dashboard/bots/${botId}`);
    revalidatePath(`/dashboard/bots/${botId}/content`);

    return { success: true, data: { contentId: content.id, broadcastCount } };
  } catch (error) {
    console.error("[publishContent]", error);
    return { success: false, error: "Erro interno ao publicar conteúdo" };
  }
}

/**
 * Reagendar um Content pendente (scheduledAt futuro, ainda não publicado).
 */
export async function reschedulePublish(
  contentId: string,
  input: ReschedulePublishInput
): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Não autenticado" };

    const parsed = reschedulePublishSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Horário inválido",
      };
    }

    const existing = await getContentById(contentId);
    if (!existing) return { success: false, error: "Conteúdo não encontrado" };

    if (!hasBotManagePermission(existing.bot, session)) {
      return { success: false, error: "Sem permissão" };
    }

    if (existing.publishedAt) {
      return {
        success: false,
        error: "Este conteúdo já foi publicado e não pode ser reagendado",
      };
    }

    await db.content.update({
      where: { id: contentId },
      data: { scheduledAt: parsed.data.scheduledAt, updatedAt: new Date() },
    });

    revalidatePath(`/dashboard/bots/${existing.botId}`);
    return { success: true };
  } catch (error) {
    console.error("[reschedulePublish]", error);
    return { success: false, error: "Erro interno ao reagendar" };
  }
}

/**
 * Cancelar um agendamento pendente. Remove o Content (e o arquivo no storage).
 */
export async function cancelScheduledPublish(
  contentId: string
): Promise<ActionResponse<undefined>> {
  const existing = await getContentById(contentId);
  if (!existing) return { success: false, error: "Conteúdo não encontrado" };

  if (existing.publishedAt) {
    return {
      success: false,
      error: "Este conteúdo já foi publicado — use excluir",
    };
  }

  return deleteContent(contentId);
}

/**
 * Alterna a disponibilidade do conteúdo (available ↔ inactive).
 * Inativo é oculto: não aparece em /catalogo, não é incluído em bulk
 * "Postar Catálogo", não vai pra novos fluxos. Mantém o histórico.
 */
export async function setContentAvailability(
  contentId: string,
  availability: "available" | "inactive"
): Promise<ActionResponse<{ availability: "available" | "inactive" }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await getContentById(contentId);
    if (!existing) {
      return { success: false, error: "Conteúdo não encontrado" };
    }

    if (!hasBotManagePermission(existing.bot, session)) {
      return {
        success: false,
        error: "Sem permissão para alterar este conteúdo",
      };
    }

    await db.content.update({
      where: { id: contentId },
      data: { availability, updatedAt: new Date() },
    });

    revalidatePath(`/dashboard/bots/${existing.botId}/content`);

    return { success: true, data: { availability } };
  } catch (error) {
    console.error("[setContentAvailability]", error);
    return {
      success: false,
      error: "Erro interno ao alterar disponibilidade",
    };
  }
}
