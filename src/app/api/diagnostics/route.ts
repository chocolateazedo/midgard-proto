import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testConnection as testStorage } from "@/lib/s3";

export const dynamic = "force-dynamic";

type ServiceStatus = {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
};

type DiagnosticsResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
  };
};

async function checkPostgres(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const result = await db.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
    const userCount = await db.user.count();
    const botCount = await db.bot.count();
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        serverTime: result[0]?.now,
        users: userCount,
        bots: botCount,
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
    const { getRedisConnection } = await import("@/lib/queue");
    const redis = getRedisConnection();
    await redis.ping();
    const info = await redis.info("memory");
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        memoryUsage: usedMemory ?? "unknown",
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
    return {
      status: "ok",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Optional token-based access control
  const diagnosticsToken = process.env.DIAGNOSTICS_TOKEN;
  if (diagnosticsToken) {
    const authHeader = request.headers.get("authorization");
    const queryToken = request.nextUrl.searchParams.get("token");
    const provided = authHeader?.replace("Bearer ", "") ?? queryToken;

    if (provided !== diagnosticsToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  const [postgres, redis, storage] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkStorage(),
  ]);

  const services = { postgres, redis, storage };

  const allOk = Object.values(services).every((s) => s.status === "ok");
  const allError = Object.values(services).every((s) => s.status === "error");

  const overallStatus: DiagnosticsResponse["status"] = allOk
    ? "healthy"
    : allError
      ? "unhealthy"
      : "degraded";

  const response: DiagnosticsResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? "1.0.0",
    environment: process.env.NODE_ENV ?? "unknown",
    services,
  };

  const httpStatus = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 207 : 503;

  return NextResponse.json(response, { status: httpStatus });
}
