"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getWooviSubAccountBalance,
  withdrawFromWooviSubAccount,
  transferBetweenWooviSubAccounts,
  listWooviCompanyPixKeys,
  inferWooviPixKeyType,
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

/**
 * Auto-detecta a chave Pix da conta principal Woovi via API e devolve
 * a chave default + tipo. Admin-only.
 */
export async function detectWooviMainPixKey(): Promise<
  ActionResponse<{ key: string; type: string; isDefault: boolean }[]>
> {
  const guard = await requireAdmin();
  if (guard.error) return { success: false, error: guard.error };

  const list = await listWooviCompanyPixKeys();
  if (!list.ok) {
    return { success: false, error: list.message };
  }
  return {
    success: true,
    data: list.data.map((k) => ({
      key: k.key,
      type: k.type,
      isDefault: k.isDefault,
    })),
  };
}

/**
 * Versão admin do resumo financeiro pra inspecionar carteira de qualquer
 * creator/manager. Saldo é via DB local (entries − withdrawals); não bate
 * na API Woovi (mais rápido + sem dependência runtime). Owner/admin only.
 */
export async function getFinancialSummaryForUserAsAdmin(
  userId: string,
): Promise<
  ActionResponse<
    Omit<FinancialSummary, "balanceCents" | "balanceError"> & {
      userName: string;
      userEmail: string;
      userRole: string;
    }
  >
> {
  try {
    const guard = await requireAdmin();
    if (guard.error) return { success: false, error: guard.error };

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        role: true,
        pixKey: true,
        wooviSubAccountStatus: true,
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };

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

    return {
      success: true,
      data: {
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        balanceDerivedCents,
        subAccountStatus: user.wooviSubAccountStatus,
        hasPixKey: !!user.pixKey,
        pixKey: user.pixKey,
        entries,
        withdrawals,
      },
    };
  } catch (error) {
    console.error("[getFinancialSummaryForUserAsAdmin]", error);
    return { success: false, error: "Erro ao buscar resumo financeiro" };
  }
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
        pixKeyType: true,
        wooviSubAccountStatus: true,
      },
    });
    if (!user) return { success: false, error: "Usuário não encontrado" };
    if (!user.pixKey || !user.pixKeyType) {
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

    // Settings de fee escalonada. Se main pix key não configurada, fee = 0.
    const feeSettings = await db.platformSetting.findMany({
      where: {
        key: {
          in: [
            "withdraw_fee_threshold_cents",
            "withdraw_fee_below_threshold_cents",
            "woovi_main_pix_key",
            "woovi_main_pix_key_type",
          ],
        },
      },
    });
    const feeMap = new Map(feeSettings.map((s) => [s.key, s.value]));
    const thresholdCents = parseInt(
      feeMap.get("withdraw_fee_threshold_cents") ?? "50000",
      10,
    );
    const feeBelowCents = parseInt(
      feeMap.get("withdraw_fee_below_threshold_cents") ?? "100",
      10,
    );
    let mainPixKey = feeMap.get("woovi_main_pix_key") ?? "";
    let mainPixKeyType = feeMap.get("woovi_main_pix_key_type") ?? "";

    // Auto-detecta da Woovi se config vazia. Cacheia em platform_settings
    // pra próxima chamada não bater na API toda vez.
    if (!mainPixKey) {
      const list = await listWooviCompanyPixKeys();
      if (list.ok && list.data.length > 0) {
        const def = list.data.find((k) => k.isDefault) ?? list.data[0];
        mainPixKey = def.key;
        mainPixKeyType = def.type.toUpperCase();
        await Promise.all([
          db.platformSetting.upsert({
            where: { key: "woovi_main_pix_key" },
            update: { value: mainPixKey },
            create: { key: "woovi_main_pix_key", value: mainPixKey, isEncrypted: false },
          }),
          db.platformSetting.upsert({
            where: { key: "woovi_main_pix_key_type" },
            update: { value: mainPixKeyType },
            create: { key: "woovi_main_pix_key_type", value: mainPixKeyType, isEncrypted: false },
          }),
        ]);
      }
    }

    // Se admin digitou só a chave e não o tipo (ou o tipo está stale),
    // infere do formato. Sobrescreve o cached type se necessário.
    if (mainPixKey && !mainPixKeyType) {
      const inferred = inferWooviPixKeyType(mainPixKey);
      if (inferred) mainPixKeyType = inferred;
    }

    let feeChargedCents = 0;
    let feeCorrelationID: string | null = null;
    const snapshotCents = bal.data.balanceCents;
    const shouldChargeFee =
      snapshotCents < thresholdCents &&
      feeBelowCents > 0 &&
      snapshotCents > feeBelowCents &&
      mainPixKey.length > 0 &&
      mainPixKeyType.length > 0;

    if (shouldChargeFee) {
      feeCorrelationID = `wd-fee-${randomUUID()}`;
      const t = await transferBetweenWooviSubAccounts({
        fromPixKey: user.pixKey,
        fromPixKeyType: user.pixKeyType.toUpperCase(),
        toPixKey: mainPixKey,
        toPixKeyType: mainPixKeyType.toUpperCase(),
        valueCents: feeBelowCents,
        correlationID: feeCorrelationID,
      });
      if (!t.ok) {
        return {
          success: false,
          error: `Falha ao cobrar taxa de saque (R$ ${(feeBelowCents / 100).toFixed(2).replace(".", ",")}): ${t.message}`,
        };
      }
      feeChargedCents = feeBelowCents;
    }

    const correlationID = `wd-${randomUUID()}`;
    const expectedNetCents = snapshotCents - feeChargedCents;

    // Pré-grava como pending pra registrar a intenção antes da chamada HTTP.
    const log = await db.withdrawLog.create({
      data: {
        userId,
        pixKey: user.pixKey,
        amountCents: expectedNetCents,
        correlationId: correlationID,
        feeChargedCents,
        feeCorrelationId: feeCorrelationID,
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
