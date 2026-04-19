"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import type { ActionResponse } from "@/types"

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

// ─── QA Tasks ───

export async function getQaTasks(): Promise<ActionResponse<any[]>> {
  try {
    await requireAdminSession()
    const tasks = await db.qaTask.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    })
    return { success: true, data: tasks }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createQaTask(data: {
  nome: string
  descricao?: string
  ordem?: number
}): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const task = await db.qaTask.create({
      data: {
        nome: data.nome,
        descricao: data.descricao || null,
        ordem: data.ordem || 0,
      },
    })
    revalidatePath("/admin/qa/configuracoes")
    return { success: true, data: task }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateQaTask(
  id: string,
  data: { nome?: string; descricao?: string; ordem?: number; ativo?: boolean }
): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const task = await db.qaTask.update({ where: { id }, data })
    revalidatePath("/admin/qa/configuracoes")
    return { success: true, data: task }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteQaTask(id: string): Promise<ActionResponse> {
  try {
    await requireAdminSession()
    await db.qaTask.delete({ where: { id } })
    revalidatePath("/admin/qa/configuracoes")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ─── QA Reports ───

export async function getQaReports(): Promise<ActionResponse<any[]>> {
  try {
    await requireAdminSession()
    const reports = await db.qaReport.findMany({
      include: {
        criadoPor: { select: { name: true } },
        items: { include: { task: { select: { nome: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })
    return { success: true, data: reports }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createQaReport(
  titulo: string
): Promise<ActionResponse<any>> {
  try {
    const session = await requireAdminSession()

    const tasks = await db.qaTask.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    })

    if (tasks.length === 0) {
      throw new Error(
        "Nenhuma task ativa cadastrada. Cadastre tasks antes de gerar um relatório."
      )
    }

    const report = await db.qaReport.create({
      data: {
        titulo,
        criadoPorId: session.user.id,
        items: {
          create: tasks.map((task) => ({
            taskId: task.id,
          })),
        },
      },
      include: {
        criadoPor: { select: { name: true } },
        items: { include: { task: { select: { nome: true } } } },
      },
    })

    revalidatePath("/admin/qa/relatorios")
    return { success: true, data: report }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function finalizeQaReport(
  id: string
): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const report = await db.qaReport.update({
      where: { id },
      data: { status: "FINALIZADO", finalizadoEm: new Date() },
    })
    revalidatePath("/admin/qa/relatorios")
    return { success: true, data: report }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function reopenQaReport(
  id: string
): Promise<ActionResponse<any>> {
  try {
    await requireAdminSession()
    const report = await db.qaReport.update({
      where: { id },
      data: { status: "EM_ANDAMENTO", finalizadoEm: null },
    })
    revalidatePath("/admin/qa/relatorios")
    return { success: true, data: report }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteQaReport(id: string): Promise<ActionResponse> {
  try {
    await requireAdminSession()
    await db.qaReport.delete({ where: { id } })
    revalidatePath("/admin/qa/relatorios")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
