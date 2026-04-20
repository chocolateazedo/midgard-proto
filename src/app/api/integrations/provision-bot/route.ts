import { NextResponse } from "next/server";

import { verifyIntegrationBearer } from "@/lib/integration-auth";
import { db } from "@/lib/db";
import { getBotProvisioningQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Rate limit in-memory: 10 req/min por IP. Multi-replica exige Redis
// mas hoje BotFans roda com 1 réplica (topfans-workers também single-replica),
// então in-memory é suficiente.
const ipHits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;

function pickIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > RATE_LIMIT;
}

type ProvisionPayload = {
  externalId: string;
  email: string;
  displayName: string;
  platformFeePercent?: number;
  desiredUsername?: string;
};

function validatePayload(body: unknown): ProvisionPayload | string {
  if (!body || typeof body !== "object") return "Body inválido";
  const b = body as Record<string, unknown>;
  if (typeof b.externalId !== "string" || !b.externalId.trim()) {
    return "externalId obrigatório";
  }
  if (typeof b.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) {
    return "email inválido";
  }
  if (typeof b.displayName !== "string" || !b.displayName.trim()) {
    return "displayName obrigatório";
  }
  if (
    b.platformFeePercent !== undefined &&
    (typeof b.platformFeePercent !== "number" ||
      b.platformFeePercent < 0 ||
      b.platformFeePercent > 100)
  ) {
    return "platformFeePercent deve estar entre 0 e 100";
  }
  if (b.desiredUsername !== undefined && typeof b.desiredUsername !== "string") {
    return "desiredUsername deve ser string";
  }
  return {
    externalId: b.externalId.trim(),
    email: b.email.trim().toLowerCase(),
    displayName: b.displayName.trim(),
    platformFeePercent: b.platformFeePercent as number | undefined,
    desiredUsername:
      typeof b.desiredUsername === "string" ? b.desiredUsername.trim() : undefined,
  };
}

export async function POST(req: Request) {
  const auth = await verifyIntegrationBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ip = pickIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validatePayload(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  // Dedupe: se já existe job aberto nos últimos 5min pro mesmo externalId, retorna o ticket existente
  const recentDeadline = new Date(Date.now() - 5 * 60_000);
  const existing = await db.provisionJob.findFirst({
    where: {
      externalId: parsed.externalId,
      createdAt: { gte: recentDeadline },
      status: { in: ["pending", "processing", "success", "pending_manual"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json(
      { ticketId: existing.id, status: existing.status, deduplicated: true },
      { status: 202 },
    );
  }

  const job = await db.provisionJob.create({
    data: {
      externalId: parsed.externalId,
      email: parsed.email,
      displayName: parsed.displayName,
      platformFeePercent: parsed.platformFeePercent ?? null,
      status: "pending",
    },
  });

  await getBotProvisioningQueue().add(
    "provision",
    {
      ticketId: job.id,
      externalId: parsed.externalId,
      email: parsed.email,
      displayName: parsed.displayName,
      platformFeePercent: parsed.platformFeePercent,
      desiredUsername: parsed.desiredUsername,
    },
    {
      jobId: job.id,
    },
  );

  return NextResponse.json(
    { ticketId: job.id, status: "pending" },
    { status: 202 },
  );
}
