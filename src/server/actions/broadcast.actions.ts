"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActionResponse } from "@/types";

export type BroadcastButtonAction =
  | { type: "link"; url: string }
  | { type: "channel"; url: string };

export interface BroadcastButton {
  text: string;
  action: BroadcastButtonAction;
}

export interface BroadcastContent {
  text: string;
  mediaKey?: string | null;
  mediaType?: "photo" | "video" | null;
  buttons?: BroadcastButton[];
}

export interface BroadcastSegmentation {
  // null/undefined = todos os bots da plataforma
  creatorIds?: string[] | null;
}

export type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface BroadcastCampaignSummary {
  id: string;
  title: string;
  status: BroadcastStatus;
  totalRecipients: number;
  itemsSent: number;
  itemsFailed: number;
  itemsBlocked: number;
  itemsOptedOut: number;
  itemsSkipped: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface BroadcastCampaignDetail extends BroadcastCampaignSummary {
  content: BroadcastContent;
  segmentation: BroadcastSegmentation;
  totalClicks: number;
  // Cliques por buttonIndex pra UI mostrar por botão.
  clicksByButton: Array<{ buttonIndex: number; count: number }>;
}

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Não autenticado" };
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { ok: false, error: "Apenas owner/admin" };
  }
  return { ok: true, userId: session.user.id };
}

export async function listCampaigns(): Promise<
  ActionResponse<BroadcastCampaignSummary[]>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const rows = await db.broadcastCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      totalRecipients: true,
      itemsSent: true,
      itemsFailed: true,
      itemsBlocked: true,
      itemsOptedOut: true,
      itemsSkipped: true,
      scheduledFor: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      createdAt: true,
    },
  });
  return {
    success: true,
    data: rows.map((r) => ({
      ...r,
      status: r.status as BroadcastStatus,
    })),
  };
}

export async function getCampaign(
  campaignId: string,
): Promise<ActionResponse<BroadcastCampaignDetail>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const c = await db.broadcastCampaign.findUnique({ where: { id: campaignId } });
  if (!c) return { success: false, error: "Campanha não encontrada" };

  // Cliques agregados por buttonIndex.
  const clicks = await db.$queryRaw<
    Array<{ button_index: number; count: bigint }>
  >`
    SELECT bc.button_index, COUNT(*)::bigint AS count
    FROM broadcast_clicks bc
    JOIN broadcast_recipients br ON br.id = bc.recipient_id
    WHERE br.campaign_id = ${campaignId}::uuid
    GROUP BY bc.button_index
    ORDER BY bc.button_index ASC
  `;
  const clicksByButton = clicks.map((row) => ({
    buttonIndex: row.button_index,
    count: Number(row.count),
  }));
  const totalClicks = clicksByButton.reduce((a, c) => a + c.count, 0);

  return {
    success: true,
    data: {
      id: c.id,
      title: c.title,
      status: c.status as BroadcastStatus,
      content: c.content as unknown as BroadcastContent,
      segmentation: c.segmentation as unknown as BroadcastSegmentation,
      totalRecipients: c.totalRecipients,
      itemsSent: c.itemsSent,
      itemsFailed: c.itemsFailed,
      itemsBlocked: c.itemsBlocked,
      itemsOptedOut: c.itemsOptedOut,
      itemsSkipped: c.itemsSkipped,
      scheduledFor: c.scheduledFor,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      errorMessage: c.errorMessage,
      createdAt: c.createdAt,
      totalClicks,
      clicksByButton,
    },
  };
}

export async function upsertCampaign(input: {
  campaignId?: string;
  title: string;
  content: BroadcastContent;
  segmentation: BroadcastSegmentation;
  scheduledFor: Date | null;
}): Promise<ActionResponse<{ campaignId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  if (!input.title.trim()) {
    return { success: false, error: "Título é obrigatório" };
  }
  if (!input.content.text?.trim() && !input.content.mediaKey) {
    return {
      success: false,
      error: "Adicione pelo menos texto ou mídia",
    };
  }
  for (const b of input.content.buttons ?? []) {
    if (!b.text?.trim()) {
      return { success: false, error: "Todo botão precisa de texto" };
    }
    if (!/^https?:\/\/|^tg:\/\/|^t\.me\//.test(b.action.url)) {
      return {
        success: false,
        error: "URL de botão inválida (use http/https ou t.me)",
      };
    }
  }
  if (input.scheduledFor && input.scheduledFor.getTime() <= Date.now()) {
    return { success: false, error: "Agendamento precisa ser no futuro" };
  }

  const status: BroadcastStatus = input.scheduledFor ? "scheduled" : "draft";

  if (input.campaignId) {
    const existing = await db.broadcastCampaign.findUnique({
      where: { id: input.campaignId },
      select: { status: true },
    });
    if (!existing) return { success: false, error: "Campanha não encontrada" };
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return {
        success: false,
        error: "Só é possível editar campanhas em rascunho ou agendadas",
      };
    }
    await db.broadcastCampaign.update({
      where: { id: input.campaignId },
      data: {
        title: input.title.trim().slice(0, 255),
        content: input.content as unknown as Prisma.InputJsonValue,
        segmentation: input.segmentation as unknown as Prisma.InputJsonValue,
        scheduledFor: input.scheduledFor,
        status,
        updatedAt: new Date(),
      },
    });
    revalidatePath("/admin/marketing");
    revalidatePath(`/admin/marketing/${input.campaignId}`);
    return { success: true, data: { campaignId: input.campaignId } };
  }

  const created = await db.broadcastCampaign.create({
    data: {
      createdById: guard.userId,
      title: input.title.trim().slice(0, 255),
      content: input.content as unknown as Prisma.InputJsonValue,
      segmentation: input.segmentation as unknown as Prisma.InputJsonValue,
      scheduledFor: input.scheduledFor,
      status,
    },
    select: { id: true },
  });
  revalidatePath("/admin/marketing");
  return { success: true, data: { campaignId: created.id } };
}

export async function deleteCampaign(
  campaignId: string,
): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const existing = await db.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!existing) return { success: false, error: "Campanha não encontrada" };
  if (existing.status === "running") {
    return {
      success: false,
      error: "Cancele o envio antes de excluir uma campanha em execução",
    };
  }
  await db.broadcastCampaign.delete({ where: { id: campaignId } });
  revalidatePath("/admin/marketing");
  return { success: true };
}

/**
 * Inicia o envio: muda pra running e enfileira job. Materialização dos
 * recipients acontece dentro do worker (transacional + filter opt-out/blocked).
 */
export async function startCampaign(
  campaignId: string,
): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const existing = await db.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!existing) return { success: false, error: "Campanha não encontrada" };
  if (existing.status !== "draft" && existing.status !== "scheduled" && existing.status !== "paused") {
    return {
      success: false,
      error: `Estado atual (${existing.status}) não permite iniciar`,
    };
  }

  await db.broadcastCampaign.update({
    where: { id: campaignId },
    data: { status: "running", startedAt: existing.status === "paused" ? undefined : new Date() },
  });

  const { getBroadcastSenderQueue } = await import("@/lib/queue");
  await getBroadcastSenderQueue().add(
    "send",
    { kind: "send", campaignId },
    { jobId: `broadcast-${campaignId}` },
  );

  revalidatePath("/admin/marketing");
  revalidatePath(`/admin/marketing/${campaignId}`);
  return { success: true };
}

export async function pauseCampaign(
  campaignId: string,
): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const existing = await db.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!existing) return { success: false, error: "Campanha não encontrada" };
  if (existing.status !== "running") {
    return { success: false, error: "Só é possível pausar campanhas em execução" };
  }
  await db.broadcastCampaign.update({
    where: { id: campaignId },
    data: { status: "paused" },
  });
  revalidatePath(`/admin/marketing/${campaignId}`);
  return { success: true };
}

export async function cancelCampaign(
  campaignId: string,
): Promise<ActionResponse<undefined>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const existing = await db.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!existing) return { success: false, error: "Campanha não encontrada" };
  await db.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
    },
  });
  revalidatePath(`/admin/marketing/${campaignId}`);
  revalidatePath("/admin/marketing");
  return { success: true };
}

/**
 * Presigned URL pra preview de broadcast media (broadcast/<uuid>.ext).
 * Admin-only. Usado no composer pra mostrar foto/vídeo recém upado.
 */
export async function getBroadcastMediaPreviewUrl(
  key: string,
): Promise<ActionResponse<{ url: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  if (!key.startsWith("broadcast/")) {
    return { success: false, error: "Key fora do escopo broadcast" };
  }
  const { generatePresignedDownloadUrl } = await import("@/lib/s3");
  const url = await generatePresignedDownloadUrl(key);
  return { success: true, data: { url } };
}

/**
 * Lista creators ativos (com bots) pra dropdown de segmentação.
 */
export async function listCreatorsForSegmentation(): Promise<
  ActionResponse<Array<{ id: string; name: string; email: string; botCount: number }>>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const creators = await db.user.findMany({
    where: { role: "creator", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      _count: { select: { bots: true } },
    },
    orderBy: { name: "asc" },
  });
  return {
    success: true,
    data: creators.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      botCount: c._count.bots,
    })),
  };
}
