import { NextResponse } from "next/server";
import { Queue } from "bullmq";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { testConnection as testStorage } from "@/lib/s3";
import { getStatus as getTelegramMtprotoStatus } from "@/lib/telegram-mtproto";

export const dynamic = "force-dynamic";

type ServiceStatus = {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
};

type QueueStat = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused?: number;
  // Último job com falha (pra facilitar debug sem ir no redis direto)
  lastFailure?: {
    id: string;
    name: string;
    reason: string;
    failedAt: string | null;
  } | null;
  error?: string;
};

type AdminDiagnosticsResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
    streaming: ServiceStatus;
    telegramMtproto: ServiceStatus;
  };
  queues: QueueStat[];
  schedules: {
    content: { pending: number; overdue: number };
    live: { scheduled: number; started: number; missedLast24h: number };
  };
  provisioning: {
    pendingManual: number;
    failedLast24h: number;
    completedLast24h: number;
    recent: Array<{
      id: string;
      externalId: string;
      status: string;
      botUsername: string | null;
      createdAt: string;
      completedAt: string | null;
      lastError: string | null;
    }>;
  };
};

// Todas as filas que a aplicação usa. Se adicionar worker novo, incluir aqui.
const QUEUE_NAMES = [
  "pix-confirmation",
  "content-delivery",
  "preview-generation",
  "notifications",
  "ivs-cost-finalize",
  "live-schedule-enforcer",
  "content-schedule-enforcer",
  "subscription-expiry",
  "bot-provisioning",
] as const;

async function checkPostgres(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const [serverTime, users, bots, activeSubs] = await Promise.all([
      db.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`,
      db.user.count(),
      db.bot.count(),
      db.subscription.count({ where: { status: "active" } }),
    ]);
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        serverTime: serverTime[0]?.now,
        users,
        bots,
        activeSubscriptions: activeSubs,
      },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const client = getRedisConnection();
    const pong = await client.ping();
    const info = await client.info("memory");
    const memMatch = info.match(/used_memory_human:(.+)/);
    const usedMemory = memMatch ? memMatch[1].trim() : "—";
    return {
      status: pong === "PONG" ? "ok" : "error",
      latencyMs: Date.now() - start,
      details: { usedMemory },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkStorage(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const result = await testStorage();
    if (!result.success) {
      return {
        status: "error",
        latencyMs: Date.now() - start,
        error: result.error ?? "Storage test failed",
      };
    }
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkStreaming(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const mediamtxHlsUrl =
      process.env.NEXT_PUBLIC_HLS_URL || "http://localhost:8888";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${mediamtxHlsUrl}/`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { hlsUrl: mediamtxHlsUrl, responseStatus: res.status },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function collectQueueStats(name: string): Promise<QueueStat> {
  // Conexão compartilhada — não cria novo socket por chamada.
  const queue = new Queue(name, { connection: getRedisConnection() });
  try {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused"
    );
    // Último job com falha pra exibir stack/reason
    const [lastFailedJob] = await queue.getFailed(0, 0);
    const lastFailure = lastFailedJob
      ? {
          id: lastFailedJob.id ?? "?",
          name: lastFailedJob.name,
          reason:
            lastFailedJob.failedReason ??
            (lastFailedJob.stacktrace && lastFailedJob.stacktrace[0]) ??
            "Sem motivo registrado",
          failedAt: lastFailedJob.finishedOn
            ? new Date(lastFailedJob.finishedOn).toISOString()
            : null,
        }
      : null;
    return {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      paused: counts.paused ?? 0,
      lastFailure,
    };
  } catch (error) {
    return {
      name,
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    // Queue handle é descartável — close não fecha a conexão compartilhada.
    await queue.close().catch(() => {});
  }
}

async function checkTelegramMtproto(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const status = await getTelegramMtprotoStatus();
    if (!status.connected) {
      return {
        status: "error",
        latencyMs: Date.now() - start,
        error: "Sessão MTProto desconectada — reconecte em /admin/settings",
        details: { phone: status.phone ?? null },
      };
    }
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        phone: status.phone ?? null,
        username: status.username ?? null,
        firstName: status.firstName ?? null,
      },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function collectProvisioningSummary() {
  const last24h = new Date(Date.now() - 24 * 3600_000);
  const [pendingManual, failedLast24h, completedLast24h, recent] = await Promise.all([
    db.provisionJob.count({ where: { status: "pending_manual" } }),
    db.provisionJob.count({
      where: { status: "failed", updatedAt: { gte: last24h } },
    }),
    db.provisionJob.count({
      where: { status: "success", completedAt: { gte: last24h } },
    }),
    db.provisionJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        externalId: true,
        status: true,
        botUsername: true,
        createdAt: true,
        completedAt: true,
        lastError: true,
      },
    }),
  ]);
  return {
    pendingManual,
    failedLast24h,
    completedLast24h,
    recent: recent.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      status: r.status,
      botUsername: r.botUsername,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      lastError: r.lastError,
    })),
  };
}

async function collectScheduleSummary() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  const [
    contentPending,
    contentOverdue,
    liveScheduled,
    liveStarted,
    liveMissed,
  ] = await Promise.all([
    db.content.count({
      where: { scheduledAt: { not: null }, publishedAt: null },
    }),
    db.content.count({
      where: {
        scheduledAt: { lt: now },
        publishedAt: null,
      },
    }),
    db.liveSchedule.count({ where: { status: "scheduled" } }),
    db.liveSchedule.count({ where: { status: "started" } }),
    db.liveSchedule.count({
      where: { status: "missed", updatedAt: { gte: last24h } },
    }),
  ]);

  return {
    content: { pending: contentPending, overdue: contentOverdue },
    live: {
      scheduled: liveScheduled,
      started: liveStarted,
      missedLast24h: liveMissed,
    },
  };
}

export async function GET(): Promise<NextResponse> {
  // Admin-only. Middleware já protege /api/admin/*, mas double-check aqui
  // porque diagnóstico pode vazar info sensível (paths, error messages).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [postgres, redis, storage, streaming, telegramMtproto, queues, schedules, provisioning] =
    await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkStorage(),
      checkStreaming(),
      checkTelegramMtproto(),
      Promise.all(QUEUE_NAMES.map((n) => collectQueueStats(n))),
      collectScheduleSummary(),
      collectProvisioningSummary(),
    ]);

  const services = { postgres, redis, storage, streaming, telegramMtproto };
  const serviceStatuses = Object.values(services).map((s) => s.status);
  const queueFailures = queues.reduce((acc, q) => acc + q.failed, 0);

  const allOk =
    serviceStatuses.every((s) => s === "ok") &&
    queues.every((q) => !q.error) &&
    queueFailures === 0;
  const allError = serviceStatuses.every((s) => s === "error");

  const status: AdminDiagnosticsResponse["status"] = allOk
    ? "healthy"
    : allError
      ? "unhealthy"
      : "degraded";

  const response: AdminDiagnosticsResponse = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? "unknown",
    services,
    queues,
    schedules,
    provisioning,
  };

  return NextResponse.json(response, { status: 200 });
}
