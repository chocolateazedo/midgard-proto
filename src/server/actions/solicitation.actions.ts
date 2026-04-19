"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generatePresignedUploadUrl } from "@/lib/s3"
import type { ActionResponse } from "@/types"
import type { SolicitationStatus } from "@prisma/client"

async function requireAdminSession() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Não autenticado")
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    throw new Error("Sem permissão de administrador")
  }
  return session
}

// ─── Solicitações ───

export async function getSolicitations(): Promise<ActionResponse<any[]>> {
  try {
    await requireAdminSession()
    const solicitations = await db.solicitation.findMany({
      include: {
        criadoPor: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return { success: true, data: solicitations }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getSolicitationById(
  id: string
): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const solicitation = await db.solicitation.findUnique({
      where: { id },
      include: {
        criadoPor: { select: { name: true } },
        comments: {
          include: {
            autor: { select: { name: true } },
            attachments: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    if (!solicitation) {
      throw new Error("Solicitação não encontrada")
    }
    return { success: true, data: solicitation }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createSolicitation(data: {
  titulo: string
  descricao: string
  prioridade?: number
}): Promise<ActionResponse<any>> {
  try {
    const session = await requireAdminSession()
    const solicitation = await db.solicitation.create({
      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        prioridade: data.prioridade || 0,
        criadoPorId: session.user.id,
      },
    })
    revalidatePath("/admin/solicitacoes")
    return { success: true, data: solicitation }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateSolicitationStatus(
  id: string,
  status: SolicitationStatus
): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const solicitation = await db.solicitation.update({
      where: { id },
      data: { status },
    })
    revalidatePath(`/admin/solicitacoes/${id}`)
    revalidatePath("/admin/solicitacoes")
    return { success: true, data: solicitation }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteSolicitation(
  id: string
): Promise<ActionResponse> {
  try {
    await requireAdminSession()
    await db.solicitation.delete({ where: { id } })
    revalidatePath("/admin/solicitacoes")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ─── Comentários ───

export async function addComment(data: {
  solicitationId: string
  texto: string
  attachments?: { fileKey: string; fileName: string; fileType: string }[]
}): Promise<ActionResponse<any>> {
  try {
    const session = await requireAdminSession()
    const comment = await db.solicitationComment.create({
      data: {
        solicitationId: data.solicitationId,
        autorId: session.user.id,
        texto: data.texto,
        attachments: data.attachments
          ? {
              create: data.attachments.map((a) => ({
                fileKey: a.fileKey,
                fileName: a.fileName,
                fileType: a.fileType,
              })),
            }
          : undefined,
      },
      include: {
        autor: { select: { name: true } },
        attachments: true,
      },
    })
    revalidatePath(`/admin/solicitacoes/${data.solicitationId}`)
    return { success: true, data: comment }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getAttachmentUploadUrl(data: {
  filename: string
  contentType: string
}): Promise<ActionResponse<{ url: string; key: string }>> {
  try {
    await requireAdminSession()
    const key = `solicitations/${crypto.randomUUID()}/${data.filename}`
    const url = await generatePresignedUploadUrl(key, data.contentType)
    return { success: true, data: { url, key } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
