import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { broadcastCatalogContent } from "@/lib/inline-jobs";

type EnforcerJob = Record<string, never>;

/**
 * Tick periódico (a cada 1min). Pega Content com scheduledAt <= now e
 * publishedAt ainda null, e efetiva a publicação:
 *  - ondemand: marca isPublished=true → aparece no catálogo do bot pra compra
 *  - catalog: enfileira entrega a todos assinantes ativos
 * Em ambos casos grava publishedAt pra evitar re-processamento.
 */
export const contentScheduleEnforcerWorker = createWorker<EnforcerJob>(
  "content-schedule-enforcer",
  async () => {
    const now = new Date();

    const due = await db.content.findMany({
      where: {
        scheduledAt: { lte: now },
        publishedAt: null,
      },
      select: { id: true, botId: true, deliveryMode: true },
      take: 50,
    });

    if (due.length === 0) return;

    for (const c of due) {
      try {
        // Marca publicado antes de enfileirar broadcast — evita duplicação
        // caso o worker sobreponha ticks. Broadcast é idempotente o suficiente
        // (cada assinante recebe uma vez por tick, pior caso é re-envio raro).
        await db.content.update({
          where: { id: c.id },
          data: { isPublished: true, publishedAt: now },
        });

        if (c.deliveryMode === "catalog") {
          const count = await broadcastCatalogContent({
            contentId: c.id,
            botId: c.botId,
          });
          console.log(
            `[ContentScheduleEnforcer] catalog broadcast ${c.id} → ${count} assinante(s)`
          );
        } else {
          console.log(`[ContentScheduleEnforcer] ondemand publicado ${c.id}`);
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
