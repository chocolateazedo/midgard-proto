import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { verifyIntegrationBearer } from "@/lib/integration-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: { ticketId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await verifyIntegrationBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const job = await db.provisionJob.findUnique({
    where: { id: params.ticketId },
    select: {
      id: true,
      status: true,
      externalId: true,
      email: true,
      botUsername: true,
      tempPassword: true,
      tempPasswordReadAt: true,
      lastError: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
  }

  // Se tem senha disponível e nunca foi lida, devolve UMA vez e limpa.
  let tempPassword: string | null = null;
  if (job.status === "success" && job.tempPassword && !job.tempPasswordReadAt) {
    tempPassword = job.tempPassword;
    await db.provisionJob.update({
      where: { id: job.id },
      data: { tempPassword: null, tempPasswordReadAt: new Date() },
    });
  }

  return NextResponse.json({
    ticketId: job.id,
    status: job.status,
    externalId: job.externalId,
    email: job.email,
    botUsername: job.botUsername,
    tempPassword,
    error: job.lastError,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
