"use server";

import { auth } from "@/lib/auth";
import {
  getInProgressContent,
  type ProcessingContent,
} from "@/server/queries/processing";
import type { ActionResponse } from "@/types";

/**
 * Retorna conteúdos em processamento conforme role da sessão:
 * - owner/admin → toda a plataforma
 * - manager     → creators que ele gerencia
 * - creator     → próprios
 *
 * Usado em /admin/processamento e /dashboard/processamento. Auto-refresh
 * pelo client a cada poucos segundos.
 */
export async function fetchInProgressContent(): Promise<
  ActionResponse<ProcessingContent[]>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Não autenticado" };
    }
    const role = session.user.role;
    if (
      role !== "owner" &&
      role !== "admin" &&
      role !== "manager" &&
      role !== "creator"
    ) {
      return { success: false, error: "Sem permissão" };
    }
    const rows = await getInProgressContent({
      role,
      userId: session.user.id,
      hours: 24,
    });
    return { success: true, data: rows };
  } catch (error) {
    console.error("[fetchInProgressContent]", error);
    return { success: false, error: "Erro ao listar conteúdos em processamento" };
  }
}
