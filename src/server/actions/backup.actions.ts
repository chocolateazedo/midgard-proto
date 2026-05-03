"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import { getChannelBackupQueue, getChannelRestoreQueue } from "@/lib/queue";
import type { ActionResponse } from "@/types";

type Guard = { ok: true; userId: string } | { ok: false; error: string };

async function ensureBotOwner(botId: string): Promise<Guard> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  const bot = await db.bot.findFirst({
    where: { id: botId },
    select: { userId: true, user: { select: { managedByUserId: true } } },
  });
  if (!bot) return { ok: false, error: "Bot não encontrado" };
  if (!hasBotManagePermission(bot, session)) {
    return { ok: false, error: "Sem permissão para gerenciar este bot" };
  }
  return { ok: true, userId: session.user.id };
}

export interface BackupRunSummary {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: Date;
  finishedAt: Date | null;
  messagesScanned: number;
  itemsAdded: number;
  itemsSkipped: number;
  errorMessage: string | null;
  // Item em curso (preenchido enquanto o worker baixa). null entre itens.
  currentMessageId: number | null;
  currentMediaType: string | null;
  currentBytesDownloaded: string | null; // BigInt → string
  currentBytesTotal: string | null;
  currentItemStartedAt: Date | null;
}

export interface BackupItemSummary {
  id: string;
  mediaType: string;
  sizeBytes: string; // BigInt → string
  mimeType: string | null;
  caption: string | null;
  messageAt: Date;
  syncedAt: Date;
  telegramMessageId: number;
  // Estado de restore (re-envio pro canal)
  restoreSentAt: Date | null;
  restoreFailedAt: Date | null;
  restoreError: string | null;
}

export interface RestoreRunSummary {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: Date;
  finishedAt: Date | null;
  itemsTotal: number;
  itemsSent: number;
  itemsFailed: number;
  itemsSkipped: number;
  errorMessage: string | null;
  currentItemId: string | null;
  currentMediaType: string | null;
  currentItemStartedAt: Date | null;
}

/**
 * Inicia (ou re-inicia) o backup do canal vinculado a este bot.
 * Recusa se já há run pending/running pra evitar concorrência (mesma
 * sessão MTProto).
 */
export async function startChannelBackup(
  botId: string
): Promise<ActionResponse<{ jobRunId: string }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { channelId: true },
  });
  if (!bot?.channelId) {
    return { success: false, error: "Bot sem canal vinculado" };
  }

  const inFlight = await db.backupJobRun.findFirst({
    where: { botId, status: { in: ["pending", "running"] } },
    select: { id: true },
  });
  if (inFlight) {
    return {
      success: false,
      error: "Já existe um backup em execução pra este bot",
    };
  }

  const run = await db.backupJobRun.create({
    data: {
      botId,
      sourceChannelId: bot.channelId.toString(),
      status: "pending",
    },
  });

  try {
    await getChannelBackupQueue().add(
      "backup",
      { jobRunId: run.id, botId },
      { jobId: `backup-${run.id}` },
    );
  } catch (err) {
    await db.backupJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage:
          err instanceof Error ? err.message : "Falha ao enfileirar",
      },
    });
    return { success: false, error: "Falha ao enfileirar backup" };
  }

  revalidatePath(`/dashboard/bots/${botId}/backup`);
  revalidatePath(`/admin/bots/${botId}/backup`);
  return { success: true, data: { jobRunId: run.id } };
}

/**
 * Status atual do backup (run em andamento) + resumo da última run
 * concluída. UI faz polling pra atualizar progresso.
 */
export async function getBackupStatus(
  botId: string
): Promise<ActionResponse<{
  current: BackupRunSummary | null;
  lastFinished: BackupRunSummary | null;
  totalItems: number;
}>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const [current, lastFinished, totalItems] = await Promise.all([
    db.backupJobRun.findFirst({
      where: { botId, status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
    }),
    db.backupJobRun.findFirst({
      where: { botId, status: { in: ["succeeded", "failed", "cancelled"] } },
      orderBy: { startedAt: "desc" },
    }),
    db.channelBackupItem.count({ where: { botId } }),
  ]);

  return {
    success: true,
    data: {
      current: current ? toRunSummary(current) : null,
      lastFinished: lastFinished ? toRunSummary(lastFinished) : null,
      totalItems,
    },
  };
}

/**
 * Lista paginada dos itens já copiados, ordenado por syncedAt desc.
 */
export async function listBackupItems(
  botId: string,
  page = 1,
  pageSize = 50
): Promise<ActionResponse<{
  items: BackupItemSummary[];
  total: number;
  page: number;
  pageSize: number;
}>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    db.channelBackupItem.findMany({
      where: { botId },
      orderBy: { syncedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        mediaType: true,
        sizeBytes: true,
        mimeType: true,
        caption: true,
        messageAt: true,
        syncedAt: true,
        telegramMessageId: true,
        restoreSentAt: true,
        restoreFailedAt: true,
        restoreError: true,
      },
    }),
    db.channelBackupItem.count({ where: { botId } }),
  ]);

  return {
    success: true,
    data: {
      items: rows.map((r) => ({
        ...r,
        sizeBytes: r.sizeBytes.toString(),
      })),
      total,
      page,
      pageSize,
    },
  };
}

/**
 * Inicia restore: enfileira job que re-posta items do backup no canal
 * vinculado do bot. Recusa se já há run pending/running pra esse bot.
 */
export async function startChannelRestore(
  botId: string,
): Promise<ActionResponse<{ jobRunId: string; itemsToSend: number }>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const bot = await db.bot.findUnique({
    where: { id: botId },
    select: { channelId: true, isActive: true },
  });
  if (!bot?.channelId) {
    return { success: false, error: "Bot sem canal vinculado" };
  }
  if (!bot.isActive) {
    return { success: false, error: "Bot está inativo — ative antes de restaurar" };
  }

  const inFlight = await db.restoreJobRun.findFirst({
    where: { botId, status: { in: ["pending", "running"] } },
    select: { id: true },
  });
  if (inFlight) {
    return {
      success: false,
      error: "Já existe um restore em execução pra este bot",
    };
  }

  const itemsToSend = await db.channelBackupItem.count({
    where: { botId, restoreSentAt: null },
  });
  if (itemsToSend === 0) {
    return {
      success: false,
      error: "Não há items pra restaurar (todos já enviados ou backup vazio)",
    };
  }

  const run = await db.restoreJobRun.create({
    data: {
      botId,
      targetChannelId: bot.channelId.toString(),
      status: "pending",
      itemsTotal: itemsToSend,
    },
  });

  try {
    await getChannelRestoreQueue().add(
      "restore",
      { jobRunId: run.id, botId },
      { jobId: `restore-${run.id}` },
    );
  } catch (err) {
    await db.restoreJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage:
          err instanceof Error ? err.message : "Falha ao enfileirar",
      },
    });
    return { success: false, error: "Falha ao enfileirar restore" };
  }

  revalidatePath(`/dashboard/bots/${botId}/backup`);
  revalidatePath(`/admin/bots/${botId}/backup`);
  return { success: true, data: { jobRunId: run.id, itemsToSend } };
}

/**
 * Status do restore: run em andamento + última run concluída.
 */
export async function getRestoreStatus(
  botId: string,
): Promise<ActionResponse<{
  current: RestoreRunSummary | null;
  lastFinished: RestoreRunSummary | null;
}>> {
  const guard = await ensureBotOwner(botId);
  if (!guard.ok) return { success: false, error: guard.error };

  const [current, lastFinished] = await Promise.all([
    db.restoreJobRun.findFirst({
      where: { botId, status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
    }),
    db.restoreJobRun.findFirst({
      where: { botId, status: { in: ["succeeded", "failed", "cancelled"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return {
    success: true,
    data: {
      current: current ? toRestoreRunSummary(current) : null,
      lastFinished: lastFinished ? toRestoreRunSummary(lastFinished) : null,
    },
  };
}

function toRestoreRunSummary(r: {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: Date;
  finishedAt: Date | null;
  itemsTotal: number;
  itemsSent: number;
  itemsFailed: number;
  itemsSkipped: number;
  errorMessage: string | null;
  currentItemId: string | null;
  currentMediaType: string | null;
  currentItemStartedAt: Date | null;
}): RestoreRunSummary {
  return {
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    itemsTotal: r.itemsTotal,
    itemsSent: r.itemsSent,
    itemsFailed: r.itemsFailed,
    itemsSkipped: r.itemsSkipped,
    errorMessage: r.errorMessage,
    currentItemId: r.currentItemId,
    currentMediaType: r.currentMediaType,
    currentItemStartedAt: r.currentItemStartedAt,
  };
}

function toRunSummary(r: {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: Date;
  finishedAt: Date | null;
  messagesScanned: number;
  itemsAdded: number;
  itemsSkipped: number;
  errorMessage: string | null;
  currentMessageId: number | null;
  currentMediaType: string | null;
  currentBytesDownloaded: bigint | null;
  currentBytesTotal: bigint | null;
  currentItemStartedAt: Date | null;
}): BackupRunSummary {
  return {
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    messagesScanned: r.messagesScanned,
    itemsAdded: r.itemsAdded,
    itemsSkipped: r.itemsSkipped,
    errorMessage: r.errorMessage,
    currentMessageId: r.currentMessageId,
    currentMediaType: r.currentMediaType,
    currentBytesDownloaded:
      r.currentBytesDownloaded !== null
        ? r.currentBytesDownloaded.toString()
        : null,
    currentBytesTotal:
      r.currentBytesTotal !== null ? r.currentBytesTotal.toString() : null,
    currentItemStartedAt: r.currentItemStartedAt,
  };
}
