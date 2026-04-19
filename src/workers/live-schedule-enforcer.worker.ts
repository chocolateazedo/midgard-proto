import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { deleteBroadcastPath } from "@/lib/mediamtx";

type EnforcerJob = Record<string, never>;

const MISSED_GRACE_MINUTES = 15;

/**
 * Roda periodicamente (ver scheduleEnforcerCheck). A cada tick:
 *
 * 1. Força encerrar schedules com status=started e endAt já no passado.
 *    Chama MediaMTX DELETE no path efêmero (o ffmpeg morre junto) e
 *    marca status=ended + actualEndAt.
 *
 * 2. Marca como missed os schedules com status=scheduled cujo startAt
 *    já passou mais de MISSED_GRACE_MINUTES. Libera o slot pra outra
 *    live agendar no mesmo horário.
 */
export const liveScheduleEnforcerWorker = createWorker<EnforcerJob>(
  "live-schedule-enforcer",
  async () => {
    const now = new Date();

    // (1) Auto-end: schedules started cuja janela terminou
    const toEnd = await db.liveSchedule.findMany({
      where: {
        status: "started",
        endAt: { lte: now },
      },
      select: { id: true, mediamtxPath: true, botId: true },
    });

    for (const s of toEnd) {
      if (s.mediamtxPath) {
        try {
          await deleteBroadcastPath(s.mediamtxPath);
        } catch (err) {
          console.error(
            `[LiveScheduleEnforcer] falha ao deletar MediaMTX path ${s.mediamtxPath}:`,
            err
          );
        }
      }
    }

    if (toEnd.length > 0) {
      await db.liveSchedule.updateMany({
        where: { id: { in: toEnd.map((s) => s.id) } },
        data: { status: "ended", actualEndAt: now, mediamtxPath: null },
      });
      console.log(
        `[LiveScheduleEnforcer] ${toEnd.length} schedule(s) auto-encerrado(s)`
      );
    }

    // (2) Auto-missed: schedules que passaram startAt + grace sem iniciar
    const graceCutoff = new Date(
      now.getTime() - MISSED_GRACE_MINUTES * 60_000
    );
    const missed = await db.liveSchedule.updateMany({
      where: {
        status: "scheduled",
        startAt: { lte: graceCutoff },
      },
      data: { status: "missed" },
    });

    if (missed.count > 0) {
      console.log(
        `[LiveScheduleEnforcer] ${missed.count} schedule(s) marcado(s) missed`
      );
    }
  }
);

/**
 * Agenda o tick do enforcer a cada 2 minutos. Chamado uma vez no startup.
 */
export async function scheduleEnforcerCheck() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");

  const queue = new Queue("live-schedule-enforcer", {
    connection: getRedisConnection(),
  });

  // Limpa jobs repetitivos anteriores (garante idempotência no redeploy)
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    "enforce",
    {},
    {
      repeat: { every: 2 * 60 * 1000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  console.log("  ✓ Live schedule enforcer agendado (2min)");
}
