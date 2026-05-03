import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import {
  broadcastCatalogContent,
  notifyIndividualContentToBotUsers,
} from "@/lib/inline-jobs";

type EnforcerJob = Record<string, never>;

/**
 * Tick periódico (a cada 1min). Pega Content com scheduledAt <= now,
 * availability=available e publishedAt null, e dispara o fluxo certo:
 *  - catalog (assinante): posta no canal vinculado (ou DM aos assinantes
 *    ativos se sem canal). Marca sentToChannelAt pra bulk não reenviar.
 *  - ondemand (individual): notifica todos BotUsers do bot com teaser
 *    + botão de compra. O conteúdo passa a aparecer também em /catalogo.
 *
 * Sempre grava publishedAt antes do dispatch — evita duplicação caso
 * ticks se sobreponham.
 */
export const contentScheduleEnforcerWorker = createWorker<EnforcerJob>(
  "content-schedule-enforcer",
  async () => {
    const now = new Date();

    const due = await db.content.findMany({
      where: {
        scheduledAt: { lte: now },
        publishedAt: null,
        availability: "available",
      },
      select: { id: true, botId: true, deliveryMode: true },
      take: 50,
    });

    if (due.length === 0) return;

    for (const c of due) {
      try {
        await db.content.update({
          where: { id: c.id },
          data: { publishedAt: now },
        });

        if (c.deliveryMode === "catalog") {
          const count = await broadcastCatalogContent({
            contentId: c.id,
            botId: c.botId,
          });
          await db.content.update({
            where: { id: c.id },
            data: { sentToChannelAt: now },
          });
          console.log(
            `[ContentScheduleEnforcer] catalog broadcast ${c.id} → ${count} destino(s)`
          );
        } else {
          const count = await notifyIndividualContentToBotUsers({
            contentId: c.id,
            botId: c.botId,
          });
          console.log(
            `[ContentScheduleEnforcer] individual notify ${c.id} → ${count} BotUser(s)`
          );
        }
      } catch (err) {
        console.error(
          `[ContentScheduleEnforcer] falha ao publicar ${c.id}:`,
          err
        );
      }
    }
  }
);

export async function scheduleContentEnforcerCheck() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");

  const queue = new Queue("content-schedule-enforcer", {
    connection: getRedisConnection(),
  });

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    "enforce",
    {},
    {
      repeat: { every: 60_000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  console.log("  ✓ Content schedule enforcer agendado (1min)");
}
