// Worker do broadcast admin. Materializa recipients respeitando
// opt-out + blocked, depois envia em loop com pacing 50ms.
//
// Pacing alvo ~20 msgs/s — Telegram permite até 30/s mas ALB/rede
// adicionam variação. Worker checa campaign.status entre items pra
// suportar pause/cancel mid-flight.
//
// Botões com URL viram link tracker /r/{recipientId}-{buttonIndex} pra
// contar cliques. URL real fica no campo `url` do BroadcastClick.

import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";
import {
  isUserMessageable,
  isBotBlockedError,
  markBotBlocked,
} from "@/lib/messageability";

type BroadcastJob =
  | { kind: "send"; campaignId: string }
  | { kind: "tick" };

const ITEM_DELAY_MS = 50; // ~20/s
const PROGRESS_FLUSH_EVERY = 25;

interface BroadcastButtonAction {
  type: "link" | "channel";
  url: string;
}

interface BroadcastButton {
  text: string;
  action: BroadcastButtonAction;
}

interface BroadcastContent {
  text: string;
  mediaKey?: string | null;
  mediaType?: "photo" | "video" | null;
  buttons?: BroadcastButton[];
}

interface BroadcastSegmentation {
  creatorIds?: string[] | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildTrackerBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function buildInlineKeyboardForRecipient(
  buttons: BroadcastButton[] | undefined,
  recipientId: string,
):
  | undefined
  | { inline_keyboard: Array<Array<{ text: string; url: string }>> } {
  if (!buttons || buttons.length === 0) return undefined;
  const base = buildTrackerBaseUrl();
  return {
    inline_keyboard: buttons.map((b, idx) => [
      {
        text: b.text,
        url: `${base}/r/${recipientId}-${idx}`,
      },
    ]),
  };
}

async function materializeRecipients(args: {
  campaignId: string;
  segmentation: BroadcastSegmentation;
}): Promise<number> {
  const { campaignId, segmentation } = args;

  // Já materializado em start anterior? Se sim, skip pra suportar resume.
  const existing = await db.broadcastRecipient.count({
    where: { campaignId },
  });
  if (existing > 0) return existing;

  // Resolve botIds elegíveis pela segmentação.
  let botIds: string[] | undefined;
  if (segmentation.creatorIds && segmentation.creatorIds.length > 0) {
    const bots = await db.bot.findMany({
      where: { userId: { in: segmentation.creatorIds }, isActive: true },
      select: { id: true },
    });
    botIds = bots.map((b) => b.id);
    if (botIds.length === 0) return 0;
  }

  const users = await db.botUser.findMany({
    where: {
      ...(botIds ? { botId: { in: botIds } } : {}),
      optedOutAt: null,
      blockedBotAt: null,
    },
    select: { id: true, botId: true },
  });
  if (users.length === 0) return 0;

  // Insert em batches pra não estourar.
  const BATCH = 1000;
  for (let i = 0; i < users.length; i += BATCH) {
    const slice = users.slice(i, i + BATCH);
    await db.broadcastRecipient.createMany({
      data: slice.map((u) => ({
        campaignId,
        botId: u.botId,
        botUserId: u.id,
        status: "pending",
      })),
      skipDuplicates: true,
    });
  }
  await db.broadcastCampaign.update({
    where: { id: campaignId },
    data: { totalRecipients: users.length },
  });
  return users.length;
}

async function runScheduledTick(): Promise<void> {
  const due = await db.broadcastCampaign.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: new Date() },
    },
    select: { id: true },
    take: 50,
  });
  if (due.length === 0) return;
  const { getBroadcastSenderQueue } = await import("@/lib/queue");
  const queue = getBroadcastSenderQueue();
  for (const c of due) {
    await db.broadcastCampaign.update({
      where: { id: c.id },
      data: { status: "running", startedAt: new Date() },
    });
    await queue.add(
      "send",
      { kind: "send", campaignId: c.id },
      { jobId: `broadcast-${c.id}` },
    );
    console.log(`[broadcast] tick disparou campanha agendada ${c.id}`);
  }
}

export const broadcastSenderWorker = createWorker<BroadcastJob>(
  "broadcast-sender",
  async (job) => {
    if (job.data.kind === "tick") {
      await runScheduledTick();
      return;
    }
    const { campaignId } = job.data;

    const campaign = await db.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      console.warn(`[broadcast] campaign ${campaignId} não encontrada`);
      return;
    }
    if (campaign.status !== "running") {
      console.warn(
        `[broadcast] campaign ${campaignId} status ${campaign.status}; ignorando`,
      );
      return;
    }

    const content = campaign.content as unknown as BroadcastContent;
    const segmentation = campaign.segmentation as unknown as BroadcastSegmentation;

    // Materialize lista de destinatários (idempotente).
    try {
      await materializeRecipients({ campaignId, segmentation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.broadcastCampaign.update({
        where: { id: campaignId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: `Falha ao materializar recipients: ${msg}`.slice(0, 1000),
        },
      });
      return;
    }

    // Cache de tokens por bot pra evitar query+decrypt repetido.
    const tokenCache = new Map<string, string>();
    async function getToken(botId: string): Promise<string | null> {
      const cached = tokenCache.get(botId);
      if (cached !== undefined) return cached;
      const bot = await db.bot.findUnique({
        where: { id: botId },
        select: { telegramToken: true, isActive: true },
      });
      if (!bot?.isActive) {
        tokenCache.set(botId, "");
        return null;
      }
      const t = decrypt(bot.telegramToken);
      tokenCache.set(botId, t);
      return t;
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let blocked = 0;
    let optedOut = 0;
    let skipped = 0;

    // Loop: pega lotes de recipients pendentes e processa um a um.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Re-check status pra suportar pause/cancel.
      const fresh = await db.broadcastCampaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "running") {
        console.log(
          `[broadcast] ${campaignId} status ${fresh?.status ?? "missing"} — parando loop`,
        );
        return;
      }

      const batch = await db.broadcastRecipient.findMany({
        where: { campaignId, status: "pending" },
        take: 100,
        select: {
          id: true,
          botId: true,
          botUserId: true,
          botUser: { select: { telegramUserId: true, telegramFirstName: true } },
        },
      });
      if (batch.length === 0) break;

      for (const r of batch) {
        await db.broadcastCampaign.update({
          where: { id: campaignId },
          data: { currentRecipientId: r.id },
        });

        // Re-checa messageability na hora (concorrência).
        const gate = await isUserMessageable({
          botId: r.botId,
          telegramUserId: r.botUser.telegramUserId,
        });
        if (!gate.ok) {
          const status =
            gate.reason === "opted_out"
              ? "opted_out"
              : gate.reason === "blocked"
                ? "blocked"
                : "skipped";
          await db.broadcastRecipient.update({
            where: { id: r.id },
            data: { status, errorMessage: gate.reason },
          });
          if (status === "opted_out") optedOut += 1;
          else if (status === "blocked") blocked += 1;
          else skipped += 1;
          processed += 1;
          continue;
        }

        const token = await getToken(r.botId);
        if (!token) {
          await db.broadcastRecipient.update({
            where: { id: r.id },
            data: { status: "skipped", errorMessage: "Bot inativo" },
          });
          skipped += 1;
          processed += 1;
          continue;
        }

        const replyMarkup = buildInlineKeyboardForRecipient(content.buttons, r.id);
        const chatId = Number(r.botUser.telegramUserId);

        try {
          if (content.mediaKey && content.mediaType) {
            const tgType = content.mediaType === "video" ? "video" : "image";
            await botManager.sendMediaFromKey(token, chatId, {
              type: tgType,
              key: content.mediaKey,
              caption: content.text,
              options: {
                parse_mode: "Markdown",
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
              },
            });
          } else {
            await botManager.sendMessage(token, chatId, content.text, {
              parse_mode: "Markdown",
              ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            });
          }
          await db.broadcastRecipient.update({
            where: { id: r.id },
            data: { status: "sent", sentAt: new Date() },
          });
          sent += 1;
        } catch (err) {
          if (isBotBlockedError(err)) {
            await markBotBlocked({
              botId: r.botId,
              telegramUserId: r.botUser.telegramUserId,
            });
            await db.broadcastRecipient.update({
              where: { id: r.id },
              data: { status: "blocked", errorMessage: "Bot bloqueado pelo usuário" },
            });
            blocked += 1;
          } else {
            const msg = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
            await db.broadcastRecipient.update({
              where: { id: r.id },
              data: { status: "failed", errorMessage: msg },
            });
            failed += 1;
          }
        }
        processed += 1;

        // Flush periódico das contagens.
        if (processed % PROGRESS_FLUSH_EVERY === 0) {
          await db.broadcastCampaign.update({
            where: { id: campaignId },
            data: {
              itemsSent: sent,
              itemsFailed: failed,
              itemsBlocked: blocked,
              itemsOptedOut: optedOut,
              itemsSkipped: skipped,
            },
          });
        }

        await sleep(ITEM_DELAY_MS);
      }
    }

    // Final flush + status.
    await db.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        itemsSent: sent,
        itemsFailed: failed,
        itemsBlocked: blocked,
        itemsOptedOut: optedOut,
        itemsSkipped: skipped,
        currentRecipientId: null,
      },
    });
    console.log(
      `[broadcast] ${campaignId} concluído — sent=${sent} failed=${failed} blocked=${blocked} optedOut=${optedOut} skipped=${skipped}`,
    );
  },
  { concurrency: 1, lockDuration: 60 * 60 * 1000 },
);

broadcastSenderWorker.on("failed", (job, err) => {
  console.error(
    `[broadcast] job ${job?.id} falhou (attempts=${job?.attemptsMade}):`,
    err.message,
  );
});

export async function scheduleBroadcastTick() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");
  const queue = new Queue("broadcast-sender", {
    connection: getRedisConnection(),
  });
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "tick") await queue.removeRepeatableByKey(job.key);
  }
  await queue.add(
    "tick",
    { kind: "tick" },
    {
      repeat: { every: 60_000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  console.log("  ✓ Broadcast scheduled tick agendado (1min)");
}
