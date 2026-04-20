import { Queue } from "bullmq";

import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createWorker, getRedisConnection } from "@/lib/queue";
import { botManager } from "@/lib/telegram";

type ReconcileJob = Record<string, never>;

// Defensive sweep: achar subscriptions que expiraram OU foram canceladas,
// onde o usuário estava no canal vinculado mas nunca foi removido de fato
// (worker de expiry falhou, erro de rede, bot perdeu permissões, etc).
// Idempotente: marca channelRemovedAt após remover, então não re-processa.
export const channelMembershipReconcilerWorker = createWorker<ReconcileJob>(
  "channel-membership-reconciler",
  async () => {
    const stale = await db.subscription.findMany({
      where: {
        status: { in: ["expired", "cancelled"] },
        channelJoinedAt: { not: null },
        channelRemovedAt: null,
        bot: { channelId: { not: null } },
      },
      include: {
        bot: { select: { telegramToken: true, channelId: true } },
        botUser: { select: { telegramUserId: true } },
      },
      take: 50, // cap por tick pra não flood @BotFather
    });

    if (stale.length === 0) return;

    console.log(
      `[ChannelReconciler] ${stale.length} assinante(s) defasados no canal — removendo`
    );

    let success = 0;
    let failed = 0;
    for (const sub of stale) {
      if (!sub.bot.channelId) continue;
      try {
        const token = decrypt(sub.bot.telegramToken);
        await botManager.removeFromChannel(
          token,
          sub.bot.channelId,
          BigInt(sub.botUser.telegramUserId)
        );
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            channelRemovedAt: new Date(),
            channelRemovalReason: sub.status === "cancelled" ? "cancelled" : "expired",
          },
        });
        success++;
      } catch (err) {
        failed++;
        console.error(
          `[ChannelReconciler] Falha removendo sub ${sub.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(
      `[ChannelReconciler] ${success} removidos, ${failed} falhas`
    );
  }
);

export async function scheduleChannelReconciler(): Promise<void> {
  const queue = new Queue("channel-membership-reconciler", {
    connection: getRedisConnection(),
  });

  const repeatables = await queue.getRepeatableJobs();
  for (const job of repeatables) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    "reconcile",
    {},
    {
      repeat: { every: 30 * 60 * 1000 }, // 30 min
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  console.log("  ✓ Channel membership reconciler agendado (30min)");
}
