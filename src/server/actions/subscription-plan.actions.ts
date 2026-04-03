"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import {
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from "@/lib/validations";
import type {
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
} from "@/lib/validations";
import type { ActionResponse, SubscriptionPlan } from "@/types";

async function checkBotOwnership(botId: string, userId: string, role: string) {
  const bot = await getBotById(botId);
  if (!bot) return { allowed: false as const, error: "Bot não encontrado" };

  const isOwnerRole = role === "owner" || role === "admin";
  if (bot.userId !== userId && !isOwnerRole) {
    return { allowed: false as const, error: "Sem permissão" };
  }

  return { allowed: true as const, bot };
}

export async function getSubscriptionPlans(
  botId: string
): Promise<ActionResponse<SubscriptionPlan[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const check = await checkBotOwnership(botId, session.user.id, session.user.role);
    if (!check.allowed) {
      return { success: false, error: check.error };
    }

    const plans = await db.subscriptionPlan.findMany({
      where: { botId },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true, data: plans };
  } catch (error) {
    console.error("[getSubscriptionPlans]", error);
    return { success: false, error: "Erro ao buscar planos" };
  }
}

export async function createSubscriptionPlan(
  input: CreateSubscriptionPlanInput
): Promise<ActionResponse<SubscriptionPlan>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = createSubscriptionPlanSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const check = await checkBotOwnership(
      parsed.data.botId,
      session.user.id,
      session.user.role
    );
    if (!check.allowed) {
      return { success: false, error: check.error };
    }

    const plan = await db.subscriptionPlan.create({
      data: {
        botId: parsed.data.botId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        price: parsed.data.price.toFixed(2),
        period: parsed.data.period,
        benefits: parsed.data.benefits ?? [],
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
        includesLiveAccess: parsed.data.includesLiveAccess ?? false,
      },
    });

    revalidatePath(`/dashboard/bots/${parsed.data.botId}/settings`);

    return { success: true, data: plan };
  } catch (error) {
    console.error("[createSubscriptionPlan]", error);
    return { success: false, error: "Erro ao criar plano" };
  }
}

export async function updateSubscriptionPlan(
  planId: string,
  input: UpdateSubscriptionPlanInput
): Promise<ActionResponse<SubscriptionPlan>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const parsed = updateSubscriptionPlanSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Dados inválidos",
      };
    }

    const existing = await db.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!existing) {
      return { success: false, error: "Plano não encontrado" };
    }

    const check = await checkBotOwnership(
      existing.botId,
      session.user.id,
      session.user.role
    );
    if (!check.allowed) {
      return { success: false, error: check.error };
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.price !== undefined) updateData.price = parsed.data.price.toFixed(2);
    if (parsed.data.period !== undefined) updateData.period = parsed.data.period;
    if (parsed.data.benefits !== undefined) updateData.benefits = parsed.data.benefits;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;
    if (parsed.data.includesLiveAccess !== undefined)
      updateData.includesLiveAccess = parsed.data.includesLiveAccess;

    const plan = await db.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });

    revalidatePath(`/dashboard/bots/${existing.botId}/settings`);

    return { success: true, data: plan };
  } catch (error) {
    console.error("[updateSubscriptionPlan]", error);
    return { success: false, error: "Erro ao atualizar plano" };
  }
}

export async function deleteSubscriptionPlan(
  planId: string
): Promise<ActionResponse<undefined>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await db.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!existing) {
      return { success: false, error: "Plano não encontrado" };
    }

    const check = await checkBotOwnership(
      existing.botId,
      session.user.id,
      session.user.role
    );
    if (!check.allowed) {
      return { success: false, error: check.error };
    }

    await db.subscriptionPlan.delete({ where: { id: planId } });

    revalidatePath(`/dashboard/bots/${existing.botId}/settings`);

    return { success: true };
  } catch (error) {
    console.error("[deleteSubscriptionPlan]", error);
    return { success: false, error: "Erro ao excluir plano" };
  }
}

export async function toggleSubscriptionPlan(
  planId: string
): Promise<ActionResponse<{ isActive: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }

    const existing = await db.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!existing) {
      return { success: false, error: "Plano não encontrado" };
    }

    const check = await checkBotOwnership(
      existing.botId,
      session.user.id,
      session.user.role
    );
    if (!check.allowed) {
      return { success: false, error: check.error };
    }

    const updated = await db.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: !existing.isActive },
      select: { isActive: true },
    });

    revalidatePath(`/dashboard/bots/${existing.botId}/settings`);

    return { success: true, data: { isActive: updated.isActive } };
  } catch (error) {
    console.error("[toggleSubscriptionPlan]", error);
    return { success: false, error: "Erro ao alterar status do plano" };
  }
}
