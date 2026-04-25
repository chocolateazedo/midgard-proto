"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getWooviSubAccountBalance,
  withdrawFromWooviSubAccount,
} from "@/lib/woovi-subaccount";
import type { ActionResponse } from "@/types";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado" as const };
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { error: "Sem permissão de administrador" as const };
  }
  return { session } as { session: NonNullable<typeof session>; error?: undefined };
}

/**
 * Entrada financeira = transação paga com split aplicado em que o usuário
 * logado aparece como creator ou manager. Os valores a creditar vêm dos
 * campos creatorNet/managerFee conforme o papel naquela transação.
 */
export interface FinancialEntry {
  id: string;
  kind: "purchase" | "subscription";
  role: "creator" | "manager";
  amountCents: number; // valor que entrou na subconta do usuário
  description: string;
  occurredAt: Date;
}

export interface FinancialWithdrawal {
  id: string;
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
  errorMessage: string | null;
  requestedAt: Date;
  completedAt: Date | null;
}

export interface FinancialSummary {
  // Fonte de verdade: saldo atual na subconta Woovi (centavos).
  // Null se ainda não há subconta ou se a consulta falhou (balanceError
  // traz a mensagem).
  balanceCents: number | null;
  balanceError: string | null;
  // Total derivado de entries paid com splitApplied + sum entries −
  // withdrawals succeeded. Útil como cross-check.
  balanceDerivedCents: number;
  subAccountStatus: "none" | "pending" | "active" | "failed";
  hasPixKey: boolean;
  pixKey: string | null;
  entries: FinancialEntry[];
  withdrawals: FinancialWithdrawal[];
}

async function requireCreatorOrManager() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado" as const };
  if (session.user.role !== "creator" && session.user.role !== "manager") {
    return { error: "Acesso restrito a creator e gestor" as const };
  }
  return { session } as { session: NonNullable<typeof session>; error?: undefined };
}

function decimalToCents(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return Math.round(d * 100);
  if (typeof d === "string") {
    const n = parseFloat(d);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }
  if (typeof d === "object" && "toNumber" in (d as object)) {
    return Math.round((d as { toNumber: () => number }).toNumber() * 100);
  }
  return 0;
}

export async function getFinancialSummary(): Promise<ActionResponse<FinancialSummary>> {
  try {
    const guard = await requireCreatorOrManager();
    if (guard.error) return { success: false, error: guard.error };
    const userId = guard.session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        pixKey: true,
        wooviSubAccountStatus: true,
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };

    // Entradas como creator: purchases pagos com split.
    const creatorPurchases = await db.purchase.findMany({
      where: {
        creatorUserId: userId,
        status: "paid",
        splitApplied: true,
      },
      select: {
        id: true,
        creatorNet: true,
        paidAt: true,
        createdAt: true,
        content: { select: { title: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    });
    const creatorSubs = await db.subscription.findMany({
      where: {
        bot: { userId },
        paidAt: { not: null },
        splitApplied: true,
      },
      select: {
        id: true,
        creatorNet: true,
        paidAt: true,
        plan: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    });

    // Entradas como manager (só casos de outro creator gerenciado).
    const managerPurchases = await db.purchase.findMany({
      where: {
        managerUserId: userId,
        status: "paid",
        splitApplied: true,
      },
      select: {
        id: true,
        managerFee: true,
        paidAt: true,
        content: { select: { title: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    });
    const managerSubs = await db.subscription.findMany({
      where: {
        managerUserId: userId,
        paidAt: { not: null },
        splitApplied: true,
      },
      select: {
        id: true,
        managerFee: true,
        paidAt: true,
        plan: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    });

    const entries: FinancialEntry[] = [
      ...creatorPurchases.map((p) => ({
        id: `cp-${p.id}`,
        kind: "purchase" as const,
        role: "creator" as const,
        amountCents: decimalToCents(p.creatorNet),
        description: p.content?.title
          ? `Venda: ${p.content.title}`
          : "Venda de live",
        occurredAt: p.paidAt ?? p.createdAt,
      })),
      ...creatorSubs.map((s) => ({
        id: `cs-${s.id}`,
        kind: "subscription" as const,
        role: "creator" as const,
        amountCents: decimalToCents(s.creatorNet),
        description: `Assinatura: ${s.plan.name}`,
        occurredAt: s.paidAt!,
      })),
      ...managerPurchases.map((p) => ({
        id: `mp-${p.id}`,
        kind: "purchase" as const,
        role: "manager" as const,
        amountCents: decimalToCents(p.managerFee),
        description: p.content?.title
          ? `Gestão: ${p.content.title}`
          : "Gestão: live",
        occurredAt: p.paidAt!,
      })),
      ...managerSubs.map((s) => ({
        id: `ms-${s.id}`,
        kind: "subscription" as const,
        role: "manager" as const,
        amountCents: decimalToCents(s.managerFee),
        description: `Gestão: assinatura ${s.plan.name}`,
        occurredAt: s.paidAt!,
      })),
    ]
      .filter((e) => e.amountCents > 0)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // Saídas.
    const withdrawLogs = await db.withdrawLog.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 200,
    });
    const withdrawals: FinancialWithdrawal[] = withdrawLogs.map((w) => ({
      id: w.id,
      amountCents: w.amountCents,
      status: w.status,
      errorMessage: w.errorMessage,
      requestedAt: w.requestedAt,
      completedAt: w.completedAt,
    }));

    const totalIn = entries.reduce((a, e) => a + e.amountCents, 0);
    const totalOut = withdrawals
      .filter((w) => w.status !== "failed")
      .reduce((a, w) => a + w.amountCents, 0);
    const balanceDerivedCents = totalIn - totalOut;

    // Saldo "oficial": consulta Woovi se tem subconta active.
    let balanceCents: number | null = null;
    let balanceError: string | null = null;
    if (user.wooviSubAccountStatus === "active" && user.pixKey) {
      const bal = await getWooviSubAccountBalance(user.pixKey);
      if (bal.ok) balanceCents = bal.data.balanceCents;
      else balanceError = bal.message;
    }

    return {
      success: true,
      data: {
        balanceCents,
        balanceError,
        balanceDerivedCents,
        subAccountStatus: user.wooviSubAccountStatus,
        hasPixKey: !!user.pixKey,
        pixKey: user.pixKey,
        entries,
        withdrawals,
      },
    };
  } catch (error) {
    console.error("[getFinancialSummary]", error);
    return { success: false, error: "Erro ao buscar resumo financeiro" };
  }
}

export async function requestWithdrawAll(): Promise<
  ActionResponse<{ withdrawLogId: string; amountCents: number }>
> {
  try {
    const guard = await requireCreatorOrManager();
    if (guard.error) return { success: false, error: guard.error };
    const userId = guard.session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        pixKey: true,
        wooviSubAccountStatus: true,
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };
    if (!user.pixKey) {
      return { success: false, error: "Cadastre uma chave Pix antes de sacar" };
    }
    if (user.wooviSubAccountStatus !== "active") {
      return {
        success: false,
        error: "Subconta ainda não está ativa — aguarde o provisionamento",
      };
    }

    // Bloqueia se há saque pendente pro mesmo usuário — evita chamadas duplas.
    const inFlight = await db.withdrawLog.findFirst({
      where: { userId, status: "pending" },
    });
    if (inFlight) {
      return {
        success: false,
        error: "Já existe um saque em processamento. Aguarde o encerramento.",
      };
    }

    // Consulta saldo no momento — evita chamar Woovi com saldo zero
    // (que ainda cobraria taxa por movimento vazio em alguns cenários).
    const bal = await getWooviSubAccountBalance(user.pixKey);
    if (!bal.ok) {
      return {
        success: false,
        error: `Não foi possível consultar o saldo agora: ${bal.message}`,
      };
    }
    if (bal.data.balanceCents <= 0) {
      return { success: false, error: "Sem saldo disponível para saque" };
    }

    const correlationID = `wd-${randomUUID()}`;
    const snapshotCents = bal.data.balanceCents;

    // Pré-grava como pending pra registrar a intenção antes da chamada HTTP.
    const log = await db.withdrawLog.create({
      data: {
        userId,
        pixKey: user.pixKey,
        amountCents: snapshotCents,
        correlationId: correlationID,
        status: "pending",
      },
    });

    const result = await withdrawFromWooviSubAccount({
      pixKey: user.pixKey,
      correlationID,
    });

    if (!result.ok) {
      await db.withdrawLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          errorCode: result.errorCode,
          errorMessage: result.message.slice(0, 1000),
          completedAt: new Date(),
        },
      });
      return {
        success: false,
        error: `Saque recusado: ${result.message}`,
      };
    }

    // Woovi costuma responder com status tipo "CREATED" — a confirmação real
    // chega via webhook. Mantemos como pending até lá. O status "COMPLETED"
    // sync só ocorre em cenários raros mas é tratado.
    const finalStatus =
      result.data.status.toUpperCase() === "COMPLETED" ? "succeeded" : "pending";
    const completedAt = finalStatus === "succeeded" ? new Date() : null;
    await db.withdrawLog.update({
      where: { id: log.id },
      data: { status: finalStatus, completedAt },
    });

    revalidatePath("/dashboard/financeiro");
    return {
      success: true,
      data: { withdrawLogId: log.id, amountCents: snapshotCents },
    };
  } catch (error) {
    console.error("[requestWithdrawAll]", error);
    return { success: false, error: "Erro ao solicitar saque" };
  }
}

/**
 * Admin reencaminha um saque que falhou: consulta saldo atual da
 * subconta e, se houver, dispara nova tentativa gravando um novo
 * WithdrawLog. O log original permanece como `failed` pra histórico.
 * Só owner/admin pode chamar.
 */
export async function retryWithdrawal(
  originalLogId: string
): Promise<ActionResponse<{ newLogId: string; amountCents: number }>> {
  try {
    const guard = await requireAdmin();
    if (guard.error) return { success: false, error: guard.error };

    const original = await db.withdrawLog.findUnique({
      where: { id: originalLogId },
      include: {
        user: {
          select: {
            id: true,
            pixKey: true,
            wooviSubAccountStatus: true,
          },
        },
      },
    });
    if (!original) {
      return { success: false, error: "Saque não encontrado" };
    }
    if (original.status !== "failed") {
      return {
        success: false,
        error: "Só é possível reprocessar saques com status Falhou",
      };
    }
    if (!original.user.pixKey) {
      return {
        success: false,
        error: "Usuário não tem mais chave Pix cadastrada",
      };
    }
    if (original.user.wooviSubAccountStatus !== "active") {
      return {
        success: false,
        error: "Subconta do usuário não está ativa",
      };
    }

    // Evita duplicar com saque pending do mesmo user.
    const inFlight = await db.withdrawLog.findFirst({
      where: { userId: original.userId, status: "pending" },
    });
    if (inFlight) {
      return {
        success: false,
        error: "Já existe um saque em processamento para este usuário",
      };
    }

    const bal = await getWooviSubAccountBalance(original.user.pixKey);
    if (!bal.ok) {
      return {
        success: false,
        error: `Não foi possível consultar o saldo: ${bal.message}`,
      };
    }
    if (bal.data.balanceCents <= 0) {
      return { success: false, error: "Sem saldo disponível na subconta" };
    }

    const correlationID = `wd-${randomUUID()}`;
    const snapshotCents = bal.data.balanceCents;

    const newLog = await db.withdrawLog.create({
      data: {
        userId: original.userId,
        pixKey: original.user.pixKey,
        amountCents: snapshotCents,
        correlationId: correlationID,
        status: "pending",
      },
    });

    const result = await withdrawFromWooviSubAccount({
      pixKey: original.user.pixKey,
      correlationID,
    });

    if (!result.ok) {
      await db.withdrawLog.update({
        where: { id: newLog.id },
        data: {
          status: "failed",
          errorCode: result.errorCode,
          errorMessage: result.message.slice(0, 1000),
          completedAt: new Date(),
        },
      });
      return {
        success: false,
        error: `Saque recusado: ${result.message}`,
      };
    }

    const finalStatus =
      result.data.status.toUpperCase() === "COMPLETED" ? "succeeded" : "pending";
    const completedAt = finalStatus === "succeeded" ? new Date() : null;
    await db.withdrawLog.update({
      where: { id: newLog.id },
      data: { status: finalStatus, completedAt },
    });

    revalidatePath("/admin/financeiro");
    return {
      success: true,
      data: { newLogId: newLog.id, amountCents: snapshotCents },
    };
  } catch (error) {
    console.error("[retryWithdrawal]", error);
    return { success: false, error: "Erro ao reprocessar saque" };
  }
}
