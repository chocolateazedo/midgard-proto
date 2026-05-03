// Helpers de estado da régua de recuperação que rodam fora do worker.
// Worker em src/workers/recovery-flow.worker.ts tem side effect de import
// (instancia BullMQ Worker) — não importar dele em runtime web.

import { db } from "@/lib/db";

/**
 * Marca como `convertedAt` os logs de recovery dos últimos 7 dias do
 * BotUser que acabou de assinar. Atribui a conversão aos envios recentes.
 *
 * Modelo novo (sem RecoveryUserState): só atualiza RecoveryMessageLog.
 */
export async function markRecoveryConvertedForUser(
  botUserId: string,
): Promise<void> {
  await db.recoveryMessageLog.updateMany({
    where: {
      botUserId,
      sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
      convertedAt: null,
      result: "sent",
    },
    data: { convertedAt: new Date() },
  });
}
