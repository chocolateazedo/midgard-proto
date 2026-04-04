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
    streaming: ServiceStatus;
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

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const Redis = (await import("ioredis")).default;
    const client = new Redis(redisUrl, {
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    const info = await client.info("memory");
    const memMatch = info.match(/used_memory_human:(.+)/);
    const usedMemory = memMatch ? memMatch[1].trim() : "—";
    await client.disconnect();
    return {
      status: pong === "PONG" ? "ok" : "error",
      latencyMs: Date.now() - start,
      details: {
        usedMemory,
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

async function checkStreaming(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    // MediaMTX expõe HLS na porta 8888 — um GET na raiz retorna 404 mas confirma que está escutando
    const mediamtxHlsUrl = process.env.NEXT_PUBLIC_HLS_URL || "http://localhost:8888";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${mediamtxHlsUrl}/`, {
      method: "GET",
      signal: controller.signal,
    }).catch((e) => {
      // Se o fetch falhar por TLS autoassinado internamente, tentar sem validação
      throw e;
    });
    clearTimeout(timeout);

    // Qualquer resposta (200, 404) significa que o servidor está rodando
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        hlsUrl: mediamtxHlsUrl,
        responseStatus: res.status,
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

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const [postgres, redis, storage, streaming] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkStorage(),
    checkStreaming(),
  ]);

  const services = { postgres, redis, storage, streaming };

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
