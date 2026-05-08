"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { botManager } from "@/lib/telegram";
import {
  isBotBlockedError,
  markBotBlocked,
} from "@/lib/messageability";
import { markRecoveryConvertedForUser } from "@/lib/recovery-state";
import type { ActionResponse } from "@/types";

type Guard =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function ensureAdmin(): Promise<Guard> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { ok: false, error: "Apenas owner/admin" };
  }
  return { ok: true, userId: session.user.id };
}

/**
 * Cancela uma assinatura ativa imediatamente. Marca status=cancelled,
 * grava endDate=now, remove o user do canal vinculado (se aplicável)
 * e envia DM. Não estorna pagamento — operação é admin-only e usada
 * para cancelar inclusões indevidas.
 */
export async function cancelSubscription(
  subscriptionId: string,
): Promise<ActionResponse<undefined>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      bot: {
        select: {
          telegramToken: true,
          channelId: true,
          channelTitle: true,
          isActive: true,
        },
      },
      botUser: { select: { telegramUserId: true } },
      plan: { select: { name: true } },
    },
  });
  if (!sub) return { success: false, error: "Assinatura não encontrada" };
  if (sub.status === "cancelled") {
    return { success: false, error: "Assinatura já cancelada" };
  }

  const now = new Date();
  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: "cancelled",
      endDate: now,
    },
  });

  // Tenta remover do canal — falha não derruba o cancelamento.
  if (
    sub.bot.channelId &&
    sub.bot.isActive &&
    sub.channelJoinedAt &&
    !sub.channelRemovedAt
  ) {
    try {
      const token = decrypt(sub.bot.telegramToken);
      await botManager.removeFromChannel(
        token,
        sub.bot.channelId,
        BigInt(sub.botUser.telegramUserId),
      );
      await db.subscription.update({
        where: { id: subscriptionId },
        data: {
          channelRemovedAt: new Date(),
          channelRemovalReason: "cancelled_by_admin",
        },
      });
    } catch (err) {
      console.error(
        `[cancelSubscription] Falha ao remover do canal:`,
        err,
      );
    }
  }

  // DM avisando que foi cancelada — transacional, ignora opt-out.
  if (sub.bot.isActive) {
    try {
      const token = decrypt(sub.bot.telegramToken);
      const channelMsg = sub.bot.channelId
        ? "Você foi removido do canal."
        : "";
      await botManager.sendMessage(
        token,
        Number(sub.botUser.telegramUserId),
        `❌ *Assinatura cancelada*\n\nPlano: ${sub.plan.name}\n\n${channelMsg}\n\nEm caso de dúvida, entre em contato.`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      if (isBotBlockedError(err)) {
        await markBotBlocked({
          botId: sub.botId,
          telegramUserId: sub.botUser.telegramUserId,
        });
      } else {
        console.warn(`[cancelSubscription] Falha ao enviar DM:`, err);
      }
    }
  }

  revalidatePath(`/admin/bots/${sub.botId}/subscribers/${sub.botUserId}`);
  revalidatePath(`/admin/bots/${sub.botId}/subscribers`);
  return { success: true };
}

/**
 * Cria assinatura gratuita manualmente (admin-only). Sem cobrança nem
 * fees — a pretexto de inclusão sistêmica. Status=active imediato, gera
 * invite no canal vinculado, envia DM com link.
 *
 * Recusa se já existe assinatura ativa pra esse user.
 */
export async function createManualSubscription(args: {
  botId: string;
  botUserId: string;
  planId: string;
}): Promise<ActionResponse<{ subscriptionId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const [bot, plan, botUser, existingActive] = await Promise.all([
    db.bot.findUnique({
      where: { id: args.botId },
      select: {
        id: true,
        telegramToken: true,
        channelId: true,
        channelTitle: true,
        isActive: true,
      },
    }),
    db.subscriptionPlan.findFirst({
      where: { id: args.planId, botId: args.botId },
      select: {
        id: true,
        name: true,
        durationDays: true,
        benefits: true,
        isActive: true,
      },
    }),
    db.botUser.findFirst({
      where: { id: args.botUserId, botId: args.botId },
      select: { id: true, telegramUserId: true },
    }),
    db.subscription.findFirst({
      where: {
        botUserId: args.botUserId,
        botId: args.botId,
        status: "active",
        endDate: { gt: new Date() },
      },
      select: { id: true },
    }),
  ]);
  if (!bot) return { success: false, error: "Bot não encontrado" };
  if (!plan) return { success: false, error: "Plano não encontrado neste bot" };
  if (!botUser) {
    return { success: false, error: "Usuário não pertence a este bot" };
  }
  if (existingActive) {
    return {
      success: false,
      error: "Usuário já tem assinatura ativa neste bot",
    };
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  // Inclusão sistêmica: tudo zerado em valores. pixTxid prefixado pra
  // evitar conflito com txids reais (que precisam ser únicos).
  const sub = await db.subscription.create({
    data: {
      planId: plan.id,
      botId: bot.id,
      botUserId: botUser.id,
      status: "active",
      amount: "0.00",
      platformFee: "0.00",
      managerFee: "0.00",
      creatorNet: "0.00",
      pixTxid: `manual-${randomUUID()}`,
      splitApplied: false,
      startDate: now,
      endDate,
      paidAt: now,
    },
    select: { id: true },
  });

  // Marca como convertido em qualquer régua de recuperação ativa pra esse user.
  try {
    await markRecoveryConvertedForUser(botUser.id);
  } catch (err) {
    console.warn("[createManualSubscription] markRecoveryConverted:", err);
  }

  // Cria invite link + DM com link e benefícios. Falhas não derrubam
  // a criação — admin pode reenviar manualmente depois.
  if (bot.isActive) {
    const token = decrypt(bot.telegramToken);
    let channelBlock = "";
    if (bot.channelId) {
      try {
        const inviteLink = await botManager.createChannelInviteLink(
          token,
          bot.channelId,
          {
            memberLimit: 1,
            name: `manual_${sub.id.slice(0, 8)}`,
          },
        );
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            channelInviteLink: inviteLink,
            channelInviteSentAt: new Date(),
          },
        });
        channelBlock =
          `\n\n📢 *Canal exclusivo*\n` +
          `Entre no canal ${bot.channelTitle ? `*${bot.channelTitle}*` : "exclusivo"}:\n` +
          `${inviteLink}\n` +
          `_Link de uso único, expira ao entrar._`;
      } catch (err) {
        console.error("[createManualSubscription] Falha invite link:", err);
      }
    }

    const benefits = (plan.benefits as string[] | null) ?? [];
    const benefitsText =
      benefits.length > 0
        ? benefits.map((b) => `  • ${b}`).join("\n")
        : "  • Acesso ao conteúdo do plano";

    const endDateStr = endDate.toLocaleDateString("pt-BR");
    const message =
      `🎁 *Assinatura ativada gratuitamente*\n\n` +
      `📋 Plano: *${plan.name}*\n` +
      `📅 Válido até: *${endDateStr}*\n\n` +
      `Benefícios:\n${benefitsText}` +
      channelBlock;

    try {
      await botManager.sendMessage(
        token,
        Number(botUser.telegramUserId),
        message,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      if (isBotBlockedError(err)) {
        await markBotBlocked({
          botId: bot.id,
          telegramUserId: botUser.telegramUserId,
        });
      } else {
        console.warn("[createManualSubscription] Falha DM:", err);
      }
    }
  }

  revalidatePath(`/admin/bots/${bot.id}/subscribers/${botUser.id}`);
  revalidatePath(`/admin/bots/${bot.id}/subscribers`);
  return { success: true, data: { subscriptionId: sub.id } };
}

/**
 * Lista planos ativos do bot pra dropdown da inclusão manual.
 * Admin-only — outros papéis usam endpoints próprios (recovery, etc).
 */
export async function listActivePlansForBotAdmin(
  botId: string,
): Promise<
  ActionResponse<
    Array<{
      id: string;
      name: string;
      price: number;
      durationDays: number;
    }>
  >
> {
  const guard = await ensureAdmin();
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
