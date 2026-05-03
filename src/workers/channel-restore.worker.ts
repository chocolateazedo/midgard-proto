// Worker de restore: re-envia ChannelBackupItem pro canal vinculado do bot
// via Bot API (não via MTProto). Itera items com restoreSentAt=null,
// posta cada um, marca restoreSentAt ou restoreFailedAt.
//
// Pacing:
// - 1500ms entre items pra evitar 429 da Bot API
// - 429 com retry_after → sleep + retry 1x
//
// Limite: arquivos > BOT_API_MAX_BYTES (~50MB) são marcados como failed
// — Bot API rejeita multipart maior. Segmentação ffmpeg fica pra futuro.

import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { Bot, InputFile } from "grammy";

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { createWorker } from "@/lib/queue";
import { getObjectStream } from "@/lib/s3";

export interface ChannelRestoreJob {
  jobRunId: string;
  botId: string;
}

const ITEM_DELAY_MS = 1_500;
const BOT_API_MAX_BYTES = 50 * 1024 * 1024;
const RETRY_AFTER_MAX_MS = 120_000;
const PAGE_SIZE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function parseRetryAfter(err: unknown): number | null {
  // grammy GrammyError tem properties; também olhamos parameters.retry_after.
  const e = err as {
    error_code?: number;
    parameters?: { retry_after?: number };
    description?: string;
  };
  if (e?.error_code === 429 && e?.parameters?.retry_after) {
    return e.parameters.retry_after;
  }
  if (typeof e?.description === "string") {
    const m = e.description.match(/retry after (\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

async function sendItemToChannel(args: {
  bot: Bot;
  channelId: number;
  mediaType: string;
  inputFile: InputFile;
  caption: string | null;
}): Promise<void> {
  const { bot, channelId, mediaType, inputFile, caption } = args;
  const opts: { caption?: string } = {};
  if (caption) opts.caption = caption;

  switch (mediaType) {
    case "photo":
      await bot.api.sendPhoto(channelId, inputFile, opts);
      return;
    case "video":
      await bot.api.sendVideo(channelId, inputFile, opts);
      return;
    case "voice":
      await bot.api.sendVoice(channelId, inputFile, opts);
      return;
    case "audio":
      await bot.api.sendAudio(channelId, inputFile, opts);
      return;
    case "animation":
      await bot.api.sendAnimation(channelId, inputFile, opts);
      return;
    default:
      await bot.api.sendDocument(channelId, inputFile, opts);
      return;
  }
}

export const channelRestoreWorker = createWorker<ChannelRestoreJob>(
  "channel-restore",
  async (job) => {
    const { jobRunId, botId } = job.data;

    const run = await db.restoreJobRun.findUnique({ where: { id: jobRunId } });
    if (!run) {
      console.warn(`[channel-restore] RestoreJobRun ${jobRunId} não encontrada`);
      return;
    }
    if (run.status !== "pending") {
      console.warn(
        `[channel-restore] RestoreJobRun ${jobRunId} status ${run.status}; ignorando`,
      );
      return;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    async function fail(error: string) {
      await db.restoreJobRun.update({
        where: { id: jobRunId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: error.slice(0, 1000),
          itemsSent: sent,
          itemsFailed: failed,
          itemsSkipped: skipped,
          currentItemId: null,
          currentMediaType: null,
          currentItemStartedAt: null,
        },
      });
    }

    const bot = await db.bot.findUnique({
      where: { id: botId },
      select: { channelId: true, telegramToken: true, isActive: true },
    });
    if (!bot?.channelId || !bot.isActive) {
      await fail("Bot sem canal vinculado ou inativo");
      return;
    }
    const channelIdNum = Number(bot.channelId);
    const token = decrypt(bot.telegramToken);
    const grammyBot = new Bot(token);

    const total = await db.channelBackupItem.count({
      where: { botId, restoreSentAt: null },
    });

    await db.restoreJobRun.update({
      where: { id: jobRunId },
      data: {
        status: "running",
        startedAt: new Date(),
        itemsTotal: total,
      },
    });

    if (total === 0) {
      await db.restoreJobRun.update({
        where: { id: jobRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsSent: 0,
          itemsFailed: 0,
          itemsSkipped: 0,
        },
      });
      return;
    }

    try {
      // Pagina 50 a 50, por messageAt asc — mantém ordem cronológica
      // do canal original.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await db.channelBackupItem.findMany({
          where: { botId, restoreSentAt: null },
          orderBy: { messageAt: "asc" },
          take: PAGE_SIZE,
        });
        if (batch.length === 0) break;

        for (const item of batch) {
          const sizeBytes = Number(item.sizeBytes);
          // Marca current* pra UI live.
          await db.restoreJobRun.update({
            where: { id: jobRunId },
            data: {
              currentItemId: item.id,
              currentMediaType: item.mediaType,
              currentItemStartedAt: new Date(),
            },
          });

          if (sizeBytes > BOT_API_MAX_BYTES) {
            failed += 1;
            await db.channelBackupItem.update({
              where: { id: item.id },
              data: {
                restoreFailedAt: new Date(),
                restoreError: `Arquivo > 50 MB (${(sizeBytes / 1024 / 1024).toFixed(0)}MB) — Bot API rejeita multipart`,
              },
            });
            await db.restoreJobRun.update({
              where: { id: jobRunId },
              data: { itemsFailed: failed },
            });
            continue;
          }

          const filename = item.storageKey.split("/").pop() ?? `item-${item.id}`;
          const tmpPath = join(
            tmpdir(),
            `restore-${randomUUID().slice(0, 8)}-${filename}`.replace(
              /[^A-Za-z0-9._-]/g,
              "_",
            ),
          );

          let attempt = 0;
          let lastErr: unknown = null;
          let ok = false;
          while (attempt < 2 && !ok) {
            attempt += 1;
            try {
              const { stream } = await getObjectStream(item.storageKey);
              await pipeline(stream, createWriteStream(tmpPath));
              const inputFile = new InputFile(
                createReadStream(tmpPath),
                filename,
              );
              await sendItemToChannel({
                bot: grammyBot,
                channelId: channelIdNum,
                mediaType: item.mediaType,
                inputFile,
                caption: item.caption,
              });
              ok = true;
            } catch (err) {
              lastErr = err;
              const retryAfter = parseRetryAfter(err);
              if (
                retryAfter !== null &&
                retryAfter * 1000 < RETRY_AFTER_MAX_MS &&
                attempt < 2
              ) {
                console.warn(
                  `[channel-restore] 429 retry_after=${retryAfter}s — esperando`,
                );
                await sleep(retryAfter * 1000 + 500);
                continue;
              }
              break;
            } finally {
              await unlink(tmpPath).catch(() => {});
            }
          }

          if (ok) {
            sent += 1;
            await db.channelBackupItem.update({
              where: { id: item.id },
              data: {
                restoreSentAt: new Date(),
                restoreFailedAt: null,
                restoreError: null,
              },
            });
            await db.restoreJobRun.update({
              where: { id: jobRunId },
              data: { itemsSent: sent },
            });
          } else {
            failed += 1;
            const errMsg = extractErrorMessage(lastErr).slice(0, 500);
            await db.channelBackupItem.update({
              where: { id: item.id },
              data: {
                restoreFailedAt: new Date(),
                restoreError: errMsg,
              },
            });
            await db.restoreJobRun.update({
              where: { id: jobRunId },
              data: { itemsFailed: failed },
            });
            console.error(
              `[channel-restore] item ${item.id} falhou: ${errMsg}`,
            );
          }

          await sleep(ITEM_DELAY_MS);
        }
      }

      await db.restoreJobRun.update({
        where: { id: jobRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsSent: sent,
          itemsFailed: failed,
          itemsSkipped: skipped,
          currentItemId: null,
          currentMediaType: null,
          currentItemStartedAt: null,
        },
      });
    } catch (err) {
      await fail(extractErrorMessage(err));
    }
  },
  { concurrency: 1, lockDuration: 60 * 60 * 1000 },
);

channelRestoreWorker.on("failed", (job, err) => {
  console.error(
    `[channel-restore] job ${job?.id} falhou (attempts=${job?.attemptsMade}):`,
    err.message,
  );
});
