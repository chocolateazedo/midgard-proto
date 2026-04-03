import { createWorker, getNotificationQueue } from "@/lib/queue";
import { db } from "@/lib/db";

type ExpiryCheckJob = Record<string, never>;

export const subscriptionExpiryWorker = createWorker<ExpiryCheckJob>(
  "subscription-expiry",
  async () => {
    const now = new Date();

    // Buscar assinaturas ativas que já expiraram
    const expired = await db.subscription.findMany({
      where: {
        status: "active",
        endDate: { lt: now },
      },
      select: { id: true },
    });

    if (expired.length === 0) return;

    // Atualizar em lote
    await db.subscription.updateMany({
      where: {
        id: { in: expired.map((s) => s.id) },
      },
      data: { status: "expired" },
    });

    console.log(
      `[SubscriptionExpiry] ${expired.length} assinatura(s) expirada(s)`
    );
  }
);

/**
 * Agenda o job repetitivo de verificação de expiração.
 * Deve ser chamado uma vez no startup dos workers.
 */
export async function scheduleExpiryCheck() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");

  const queue = new Queue("subscription-expiry", {
    connection: getRedisConnection(),
  });

  // Remover jobs repetitivos antigos antes de adicionar novos
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Verificar a cada 1 hora
  await queue.add(
    "check-expiry",
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  console.log("  ✓ Verificação de expiração de assinaturas agendada (1h)");
}
