import { db } from "@/lib/db";

export type ProcessingStage =
  | "queued"
  | "preview"
  | "compressing"
  | "uploading"
  | "done";

export interface ProcessingContent {
  id: string;
  title: string;
  type: "image" | "video" | "file" | "bundle";
  createdAt: Date;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  botId: string;
  botName: string;
  creatorId: string;
  creatorName: string;
  stage: ProcessingStage;
  percent: number;
  stageLabel: string;
}

/**
 * Calcula a etapa atual e a barra de progresso (%) com base no estado
 * do Content. As etapas são derivadas de previewKey + lightKeys + tipo.
 */
function computeStage(args: {
  type: string;
  previewKey: string | null;
  lightKeysLen: number;
}): { stage: ProcessingStage; percent: number; label: string } {
  const { type, previewKey, lightKeysLen } = args;

  if (type !== "video") {
    if (!previewKey) return { stage: "preview", percent: 50, label: "Gerando preview" };
    return { stage: "done", percent: 100, label: "Concluído" };
  }

  // Vídeo passa por: preview → light segments → done.
  if (!previewKey && lightKeysLen === 0) {
    return { stage: "queued", percent: 10, label: "Aguardando processamento" };
  }
  if (!previewKey && lightKeysLen > 0) {
    return { stage: "preview", percent: 75, label: "Gerando preview" };
  }
  if (previewKey && lightKeysLen === 0) {
    return { stage: "compressing", percent: 50, label: "Comprimindo vídeo" };
  }
  return { stage: "done", percent: 100, label: "Concluído" };
}

/**
 * Lista contents recentes que ainda estão em processamento (preview ou
 * variante leve pendente). Filtros por escopo:
 * - admin: tudo
 * - manager: contents de creators que ele gerencia (User.managedByUserId)
 * - creator: só os próprios
 *
 * Janela de 24h pra evitar varrer tabela inteira; ajustável via param.
 */
export async function getInProgressContent(scope: {
  role: "owner" | "admin" | "manager" | "creator";
  userId: string;
  hours?: number;
}): Promise<ProcessingContent[]> {
  const since = new Date(Date.now() - (scope.hours ?? 24) * 60 * 60 * 1000);

  // Filtro de "em andamento" no SQL pra reduzir resultado: previewKey null
  // OU (type=video AND lightKeys vazio). Nem todo content "em andamento"
  // bate exatamente com isso (ex.: vídeo com light pronto mas preview
  // pendente), por isso filtramos de novo no JS depois de computeStage.
  const whereInProgress = {
    OR: [
      { previewKey: null },
      { type: "video" as const, lightKeys: { isEmpty: true } },
    ],
  };

  let userScope: object;
  if (scope.role === "owner" || scope.role === "admin") {
    userScope = {};
  } else if (scope.role === "manager") {
    // Conteúdos de creators gerenciados por este user.
    userScope = { user: { managedByUserId: scope.userId } };
  } else {
    // Creator vê só os próprios.
    userScope = { userId: scope.userId };
  }

  const rows = await db.content.findMany({
    where: {
      createdAt: { gte: since },
      ...whereInProgress,
      ...userScope,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      type: true,
      createdAt: true,
      publishedAt: true,
      scheduledAt: true,
      previewKey: true,
      lightKeys: true,
      botId: true,
      bot: { select: { name: true } },
      userId: true,
      user: { select: { name: true } },
    },
  });

  return rows
    .map((r) => {
      const { stage, percent, label } = computeStage({
        type: r.type,
        previewKey: r.previewKey,
        lightKeysLen: r.lightKeys.length,
      });
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        createdAt: r.createdAt,
        publishedAt: r.publishedAt,
        scheduledAt: r.scheduledAt,
        botId: r.botId,
        botName: r.bot.name,
        creatorId: r.userId,
        creatorName: r.user.name,
        stage,
        percent,
        stageLabel: label,
      };
    })
    .filter((c) => c.stage !== "done");
}
