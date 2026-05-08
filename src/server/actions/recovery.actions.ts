"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import type { ActionResponse } from "@/types";

export type RecoveryTriggerType =
  | "time_after_first_seen"
  | "cart_abandoned"
  | "subscription_ending"
  | "winback"
  | "no_active_subscription";

export type RecoveryMessageFrequency = "once" | "recurring";

export interface RecoveryStepVariant {
  text: string;
  mediaKey?: string | null;
  mediaType?: "photo" | "video" | null;
}

export type RecoveryButtonAction =
  | { type: "link"; url: string }
  | { type: "subscribe_plan"; planId: string };

export interface RecoveryStepButton {
  text: string;
  action: RecoveryButtonAction;
}

export interface RecoveryStepContent {
  variants: RecoveryStepVariant[];
  buttons?: RecoveryStepButton[];
}

export interface RecoveryStepTriggerParams {
  delayMinutes?: number;
  daysBefore?: number;
  daysAfter?: number;
}

export interface RecoveryMessageSummary {
  id: string;
  botId: string;
  name: string;
  isActive: boolean;
  triggerType: RecoveryTriggerType;
  triggerParams: RecoveryStepTriggerParams;
  content: RecoveryStepContent;
  frequency: RecoveryMessageFrequency;
  recurringIntervalMinutes: number | null;
  sentCount: number;
  convertedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionPlanOption {
  id: string;
  name: string;
  price: number;
  durationDays: number;
}

async function ensureBotPermission(
  botId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  const bot = await db.bot.findFirst({
    where: { id: botId },
    select: { userId: true, user: { select: { managedByUserId: true } } },
  });
  if (!bot) return { ok: false, error: "Bot não encontrado" };
  if (!hasBotManagePermission(bot, session)) {
    return { ok: false, error: "Sem permissão" };
  }
  return { ok: true, userId: session.user.id };
}

export async function listRecoveryMessages(
  botId: string,
): Promise<ActionResponse<RecoveryMessageSummary[]>> {
  const guard = await ensureBotPermission(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const messages = await db.recoveryMessage.findMany({
    where: { botId },
    orderBy: { createdAt: "asc" },
  });

  // Métricas: sent + converted por message.
  const ids = messages.map((m) => m.id);
  const counts = new Map<string, { sent: number; converted: number }>();
  if (ids.length > 0) {
    const rows = await db.$queryRaw<
      Array<{ message_id: string; sent_count: bigint; converted_count: bigint }>
    >`
      SELECT message_id::text AS message_id,
             COUNT(*) FILTER (WHERE result = 'sent') AS sent_count,
             COUNT(*) FILTER (WHERE converted_at IS NOT NULL) AS converted_count
      FROM recovery_message_logs
      WHERE message_id = ANY(${ids}::uuid[])
      GROUP BY message_id
    `;
    for (const r of rows) {
      counts.set(r.message_id, {
        sent: Number(r.sent_count),
        converted: Number(r.converted_count),
      });
    }
  }

  return {
    success: true,
    data: messages.map((m) => {
      const c = counts.get(m.id);
      return {
        id: m.id,
        botId: m.botId,
        name: m.name,
        isActive: m.isActive,
        triggerType: m.triggerType as RecoveryTriggerType,
        triggerParams: m.triggerParams as unknown as RecoveryStepTriggerParams,
        content: m.content as unknown as RecoveryStepContent,
        frequency: m.frequency as RecoveryMessageFrequency,
        recurringIntervalMinutes: m.recurringIntervalMinutes,
        sentCount: c?.sent ?? 0,
        convertedCount: c?.converted ?? 0,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    }),
  };
}

/**
 * Gera presigned URL pra preview da mídia no editor. Restringe acesso
 * a keys do próprio bot (prefixo content/<botId>/) e exige
 * hasBotManagePermission.
 */
export async function getMediaPreviewUrl(
  botId: string,
  key: string,
): Promise<ActionResponse<{ url: string }>> {
  const guard = await ensureBotPermission(botId);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!key.startsWith(`content/${botId}/`)) {
    return { success: false, error: "Key fora do escopo deste bot" };
  }
  const { generatePresignedDownloadUrl } = await import("@/lib/s3");
  const url = await generatePresignedDownloadUrl(key);
  return { success: true, data: { url } };
}

/**
 * Lista planos de assinatura ativos do bot pra dropdown de botões
 * subscribe_plan no editor.
 */
export async function listSubscriptionPlansForBot(
  botId: string,
): Promise<ActionResponse<SubscriptionPlanOption[]>> {
  const guard = await ensureBotPermission(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const plans = await db.subscriptionPlan.findMany({
    where: { botId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, price: true, durationDays: true },
  });
  return {
    success: true,
    data: plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price.toNumber(),
      durationDays: p.durationDays,
    })),
  };
}

export async function upsertRecoveryMessage(
  botId: string,
  data: {
    messageId?: string;
    name: string;
    triggerType: RecoveryTriggerType;
    triggerParams: RecoveryStepTriggerParams;
    content: RecoveryStepContent;
    frequency: RecoveryMessageFrequency;
    recurringIntervalMinutes?: number | null;
  },
): Promise<ActionResponse<{ messageId: string }>> {
  const guard = await ensureBotPermission(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  if (!data.name?.trim()) return { success: false, error: "Nome é obrigatório" };
  if (!Array.isArray(data.content.variants) || data.content.variants.length === 0) {
    return { success: false, error: "Adicione pelo menos uma variante de mensagem" };
  }
  for (const v of data.content.variants) {
    if (!v.text?.trim()) {
      return { success: false, error: "Toda variante precisa de texto" };
    }
  }
  if (data.frequency === "recurring") {
    const m = data.recurringIntervalMinutes;
    if (typeof m !== "number" || m < 5) {
      return {
        success: false,
        error: "Intervalo recorrente deve ser >= 5 minutos",
      };
    }
  }
  if (data.frequency === "once" && data.content.variants.length > 1) {
    return {
      success: false,
      error: "Frequência única só permite 1 variante",
    };
  }
  // Valida buttons
  if (data.content.buttons) {
    for (const b of data.content.buttons) {
      if (!b.text?.trim()) {
        return { success: false, error: "Todo botão precisa de texto" };
      }
      if (b.action.type === "link") {
        if (!/^https?:\/\//.test(b.action.url ?? "")) {
          return {
            success: false,
            error: "Botão de link precisa de URL http(s)",
          };
        }
      } else if (b.action.type === "subscribe_plan") {
        if (!b.action.planId) {
          return { success: false, error: "Selecione um plano para o botão" };
        }
      }
    }
  }

  const interval =
    data.frequency === "recurring"
      ? data.recurringIntervalMinutes ?? null
      : null;

  if (data.messageId) {
    const existing = await db.recoveryMessage.findFirst({
      where: { id: data.messageId, botId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: "Mensagem não encontrada" };
    }
    await db.recoveryMessage.update({
      where: { id: data.messageId },
      data: {
        name: data.name.trim().slice(0, 100),
        triggerType: data.triggerType,
        triggerParams: data.triggerParams as unknown as Prisma.InputJsonValue,
        content: data.content as unknown as Prisma.InputJsonValue,
        frequency: data.frequency,
        recurringIntervalMinutes: interval,
        updatedAt: new Date(),
      },
    });
    revalidatePath(`/dashboard/bots/${botId}/recovery`);
    revalidatePath(`/admin/bots/${botId}/recovery`);
    return { success: true, data: { messageId: data.messageId } };
  }

  const created = await db.recoveryMessage.create({
    data: {
      botId,
      name: data.name.trim().slice(0, 100),
      triggerType: data.triggerType,
      triggerParams: data.triggerParams as unknown as Prisma.InputJsonValue,
      content: data.content as unknown as Prisma.InputJsonValue,
      frequency: data.frequency,
      recurringIntervalMinutes: interval,
    },
    select: { id: true },
  });
  revalidatePath(`/dashboard/bots/${botId}/recovery`);
  revalidatePath(`/admin/bots/${botId}/recovery`);
  return { success: true, data: { messageId: created.id } };
}

export async function setRecoveryMessageActive(
  messageId: string,
  isActive: boolean,
): Promise<ActionResponse<undefined>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado" };

  const message = await db.recoveryMessage.findFirst({
    where: { id: messageId },
    include: {
      bot: {
        select: { userId: true, user: { select: { managedByUserId: true } } },
      },
    },
  });
  if (!message) return { success: false, error: "Mensagem não encontrada" };
  if (!hasBotManagePermission(message.bot, session)) {
    return { success: false, error: "Sem permissão" };
  }

  await db.recoveryMessage.update({
    where: { id: messageId },
    data: { isActive, updatedAt: new Date() },
  });
  revalidatePath(`/dashboard/bots/${message.botId}/recovery`);
  revalidatePath(`/admin/bots/${message.botId}/recovery`);
  return { success: true };
}

export async function deleteRecoveryMessage(
  messageId: string,
): Promise<ActionResponse<undefined>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado" };

  const message = await db.recoveryMessage.findFirst({
    where: { id: messageId },
    include: {
      bot: {
        select: { userId: true, user: { select: { managedByUserId: true } } },
      },
    },
  });
  if (!message) return { success: false, error: "Mensagem não encontrada" };
  if (!hasBotManagePermission(message.bot, session)) {
    return { success: false, error: "Sem permissão" };
  }

  await db.recoveryMessage.delete({ where: { id: messageId } });
  revalidatePath(`/dashboard/bots/${message.botId}/recovery`);
  revalidatePath(`/admin/bots/${message.botId}/recovery`);
  return { success: true };
}
