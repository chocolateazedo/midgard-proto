import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import {
  getLiveDeliveredMinutes,
  getPeakConcurrentViewers,
} from "@/lib/cloudwatch";

/**
 * Worker de finalização de custo de sessão IVS.
 *
 * Fluxo:
 *   1. Webhook IVS recebe "Stream End" via EventBridge.
 *   2. Handler marca a LiveStreamSession com endedAt + durationSeconds.
 *   3. Handler enfileira este job com delay ~5 min (CloudWatch precisa consolidar).
 *   4. Este worker consulta LiveDeliveredTime + ConcurrentViews, calcula custo
 *      estimado e grava na session (status=ended).
 *
 * Tabela de tarifas IVS (STANDARD, low-latency) — CONFIRMAR na calculadora AWS:
 *   - Input: US$ 0,20 / hora de ingest
 *   - Output HD (≤1080p): US$ 0,15 / hora de entrega por viewer
 *   - Output SD (≤480p):  US$ 0,075 / hora de entrega por viewer
 *
 * IMPORTANTE: os valores computados são ESTIMATIVAS (tarifa de lista), não o
 * valor real faturado. Pra conciliação exata, usar o Cost & Usage Report no
 * fechamento do mês.
 */

interface IvsCostFinalizeJob {
  sessionId: string;
}

// Tarifas em USD (atualizar se AWS mudar)
const RATE_INPUT_USD_PER_HOUR = 0.2;
const RATE_OUTPUT_HD_USD_PER_HOUR = 0.15;
const RATE_OUTPUT_SD_USD_PER_HOUR = 0.075;

export const ivsCostFinalizeWorker = createWorker<IvsCostFinalizeJob>(
  "ivs-cost-finalize",
  async (job) => {
    const { sessionId } = job.data;

    const session = await db.liveStreamSession.findUnique({
      where: { id: sessionId },
      include: { liveStream: true },
    });

    if (!session) {
      console.warn(`[ivs-cost-finalize] Sessão ${sessionId} não encontrada`);
      return;
    }

    if (session.status === "ended") {
      console.log(`[ivs-cost-finalize] Sessão ${sessionId} já finalizada`);
      return;
    }

    if (!session.endedAt || !session.startedAt) {
      console.warn(
        `[ivs-cost-finalize] Sessão ${sessionId} sem startedAt/endedAt — abortando`
      );
      return;
    }

    const channelName = session.liveStream.ivsChannelName;
    if (!channelName) {
      console.warn(
        `[ivs-cost-finalize] LiveStream ${session.liveStreamId} sem ivsChannelName`
      );
      return;
    }

    // Janela com 1 min de folga no fim pra garantir que todos os datapoints
    // de CloudWatch já estejam disponíveis
    const windowEnd = new Date(session.endedAt.getTime() + 60 * 1000);

    const [deliveredMinutes, peakViewers] = await Promise.all([
      getLiveDeliveredMinutes(channelName, session.startedAt, windowEnd),
      getPeakConcurrentViewers(channelName, session.startedAt, windowEnd),
    ]);

    // Input cost: baseado na duração do stream
    const durationHours =
      (session.durationSeconds ?? 0) / 3600;
    const inputCostUsd = durationHours * RATE_INPUT_USD_PER_HOUR;

    // Output cost: baseado nos delivered minutes (já somados entre viewers)
    const outputRate =
      session.qualityTier === "HD"
        ? RATE_OUTPUT_HD_USD_PER_HOUR
        : RATE_OUTPUT_SD_USD_PER_HOUR;
    const outputCostUsd = (deliveredMinutes / 60) * outputRate;

    const totalCostUsd = inputCostUsd + outputCostUsd;

    await db.liveStreamSession.update({
      where: { id: sessionId },
      data: {
        totalDeliveredMinutes: deliveredMinutes.toFixed(4),
        peakConcurrentViewers: peakViewers,
        inputCostUsd: inputCostUsd.toFixed(6),
        outputCostUsd: outputCostUsd.toFixed(6),
        totalCostUsd: totalCostUsd.toFixed(6),
        status: "ended",
      },
    });

    console.log(
      `[ivs-cost-finalize] Sessão ${sessionId} finalizada: ` +
        `${durationHours.toFixed(2)}h input, ${deliveredMinutes.toFixed(1)}min delivered, ` +
        `${peakViewers} peak viewers, US$ ${totalCostUsd.toFixed(4)}`
    );
  }
);

ivsCostFinalizeWorker.on("failed", (job, err) => {
  console.error(
    `[ivs-cost-finalize] Job ${job?.id} falhou:`,
    err.message
  );
});
