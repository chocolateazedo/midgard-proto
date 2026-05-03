// Worker de backup do canal Telegram do bot.
//
// Lê o histórico do canal via MTProto, baixa as mídias pra disco
// temporário, sobe pro storage da plataforma e grava ChannelBackupItem.
// Idempotente: pula mensagens já no DB. Atualiza progresso na
// BackupJobRun pra UI poder fazer polling.
//
// Estratégia anti-floodwait:
// - 1500ms de delay entre cada batch de 100 messages do GetHistory
// - 500ms de delay entre downloads consecutivos
// - Se vier FLOOD_WAIT_X, espera X+1.5s e retoma
//
// Não retentamos jobs falhos automaticamente — usuário relança via UI.

import { createWriteStream } from "fs";
import { mkdir, stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createWorker } from "@/lib/queue";
import { putObjectFromFile } from "@/lib/s3";

export interface ChannelBackupJob {
  jobRunId: string;
  botId: string;
}

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1_500;
const ITEM_DELAY_MS = 500;
const FLOOD_MARGIN_MS = 1_500;
const FLOOD_MAX_WAIT_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseFloodWaitSeconds(message: string): number | null {
  const m = message.match(/FLOOD[_ ]?WAIT[_ ]?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Mapeia o mediaType do ChannelBackupItem (granular) pro ContentType
 * (4 valores: image/video/file/bundle).
 */
function mediaTypeToContentType(
  mediaType: string,
): "image" | "video" | "file" | "bundle" {
  switch (mediaType) {
    case "photo":
      return "image";
    case "video":
    case "animation":
      return "video";
    default:
      return "file";
  }
}

/**
 * Deriva título e descrição do Content a partir do caption do post.
 * Sem caption, usa "Post #{messageId} — {data}". Title tem limite 255.
 */
function deriveTitleDescription(
  caption: string | null,
  messageId: number,
  messageAt: Date,
): { title: string; description: string | null } {
  if (caption && caption.trim()) {
    const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const title = first.slice(0, 200);
    const rest = lines.slice(1).join("\n").trim();
    return {
      title,
      description: rest.length > 0 ? rest : caption.length > 200 ? caption : null,
    };
  }
  const dateLabel = messageAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    title: `Post #${messageId} — ${dateLabel}`,
    description: null,
  };
}

function toBigIntSafe(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string") {
    try {
      return BigInt(v);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Detecta tipo da mídia + extensão + tamanho total estimado. Retorna null
 * pra mensagens sem mídia ou tipos pulados (stickers).
 *
 * sizeBytes vem do document.size (preciso) ou da maior PhotoSize disponível
 * (estimado — Telegram só retorna tamanhos de chunks). Pode ser null se
 * MTProto não expôs essa info.
 */
function classifyMedia(media: unknown): {
  mediaType: string;
  ext: string;
  mimeType: string | null;
  sizeBytes: bigint | null;
} | null {
  const m = media as
    | {
        className?: string;
        photo?: {
          sizes?: Array<{ size?: unknown; sizes?: unknown }>;
        };
        document?: {
          mimeType?: string;
          size?: unknown;
          attributes?: Array<Record<string, unknown>>;
        };
      }
    | null;
  if (!m) return null;

  if (m.className === "MessageMediaPhoto" && m.photo) {
    // Photos têm múltiplas PhotoSize (thumbnails + full). Pega o maior `size`
    // ou o último elemento de `sizes` (array de bytes progressivos).
    let max: bigint | null = null;
    for (const s of m.photo.sizes ?? []) {
      const direct = toBigIntSafe(s.size);
      if (direct !== null && (max === null || direct > max)) max = direct;
      if (Array.isArray(s.sizes) && s.sizes.length > 0) {
        const last = toBigIntSafe(s.sizes[s.sizes.length - 1]);
        if (last !== null && (max === null || last > max)) max = last;
      }
    }
    return {
      mediaType: "photo",
      ext: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: max,
    };
  }

  if (m.className === "MessageMediaDocument" && m.document) {
    const doc = m.document;
    const attrs = doc.attributes ?? [];
    const mime = doc.mimeType ?? "application/octet-stream";
    const sizeBytes = toBigIntSafe(doc.size);

    if (attrs.some((a) => a.className === "DocumentAttributeSticker")) {
      return null;
    }

    const isVoice = attrs.some(
      (a) =>
        a.className === "DocumentAttributeAudio" &&
        (a as { voice?: boolean }).voice === true,
    );
    if (isVoice)
      return { mediaType: "voice", ext: "ogg", mimeType: mime, sizeBytes };

    const isAudio = attrs.some(
      (a) => a.className === "DocumentAttributeAudio",
    );
    if (isAudio) {
      const ext = mime === "audio/mpeg" ? "mp3" : "ogg";
      return { mediaType: "audio", ext, mimeType: mime, sizeBytes };
    }

    if (attrs.some((a) => a.className === "DocumentAttributeAnimated")) {
      return { mediaType: "animation", ext: "mp4", mimeType: mime, sizeBytes };
    }

    if (attrs.some((a) => a.className === "DocumentAttributeVideo")) {
      return { mediaType: "video", ext: "mp4", mimeType: mime, sizeBytes };
    }

    const filenameAttr = attrs.find(
      (a) => a.className === "DocumentAttributeFilename",
    ) as { fileName?: string } | undefined;
    let ext = "bin";
    if (filenameAttr?.fileName) {
      const dot = filenameAttr.fileName.lastIndexOf(".");
      if (dot >= 0) ext = filenameAttr.fileName.slice(dot + 1).slice(0, 6);
    }
    return { mediaType: "document", ext, mimeType: mime, sizeBytes };
  }

  return null;
}

export const channelBackupWorker = createWorker<ChannelBackupJob>(
  "channel-backup",
  async (job) => {
    const { jobRunId, botId } = job.data;

    const run = await db.backupJobRun.findUnique({ where: { id: jobRunId } });
    if (!run) {
      console.warn(`[channel-backup] BackupJobRun ${jobRunId} não encontrada`);
      return;
    }
    if (run.status !== "pending") {
      console.warn(
        `[channel-backup] BackupJobRun ${jobRunId} status ${run.status}; ignorando`,
      );
      return;
    }
    await db.backupJobRun.update({
      where: { id: jobRunId },
      data: { status: "running", startedAt: new Date() },
    });

    let scanned = 0;
    let added = 0;
    let skipped = 0;
    let lastFlush = 0;

    async function flushProgress(force = false) {
      if (!force && scanned - lastFlush < 25) return;
      lastFlush = scanned;
      await db.backupJobRun.update({
        where: { id: jobRunId },
        data: {
          messagesScanned: scanned,
          itemsAdded: added,
          itemsSkipped: skipped,
        },
      });
    }

    async function fail(error: string) {
      await db.backupJobRun.update({
        where: { id: jobRunId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: error.slice(0, 1000),
          messagesScanned: scanned,
          itemsAdded: added,
          itemsSkipped: skipped,
          currentMessageId: null,
          currentMediaType: null,
          currentBytesDownloaded: null,
          currentBytesTotal: null,
          currentItemStartedAt: null,
        },
      });
    }

    const bot = await db.bot.findUnique({
      where: { id: botId },
      select: { channelId: true, userId: true },
    });
    if (!bot?.channelId) {
      await fail("Bot sem canal vinculado");
      return;
    }
    const channelIdStr = bot.channelId.toString();
    const ownerUserId = bot.userId;

    const settings = await db.platformSetting.findMany({
      where: {
        key: { in: ["telegram_api_id", "telegram_api_hash", "telegram_session"] },
      },
    });
    const map = new Map(settings.map((s) => [s.key, s]));
    const apiIdStr = map.get("telegram_api_id")?.value;
    const apiHash = map.get("telegram_api_hash")?.value;
    const sessionRaw = map.get("telegram_session");
    const sessionStr = sessionRaw?.value
      ? sessionRaw.isEncrypted
        ? decrypt(sessionRaw.value)
        : sessionRaw.value
      : "";
    if (!apiIdStr || !apiHash || !sessionStr) {
      await fail("Conta Telegram (MTProto) não conectada");
      return;
    }

    const client = new TelegramClient(
      new StringSession(sessionStr),
      Number(apiIdStr),
      apiHash,
      { connectionRetries: 3 },
    );
    try {
      await client.connect();
    } catch (err) {
      await fail(`Falha ao conectar MTProto: ${extractErrorMessage(err)}`);
      return;
    }

    const workDir = join(tmpdir(), `bk-${jobRunId}`);
    await mkdir(workDir, { recursive: true });

    try {
      const dialogs = await client.getDialogs({ limit: 500 });
      let channelEntity: unknown = null;
      const idPositive = channelIdStr.startsWith("-100")
        ? channelIdStr.slice(4)
        : channelIdStr;
      for (const d of dialogs) {
        const e = d.entity as unknown as
          | { id?: { toString(): string } }
          | null;
        if (e?.id?.toString() === idPositive) {
          channelEntity = e;
          break;
        }
      }
      if (!channelEntity) {
        await fail(
          "Conta MTProto não é membro deste canal. Adicione em Integração ou na aba Canal antes de fazer backup.",
        );
        return;
      }

      let offsetId = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let history: { messages?: Array<Record<string, unknown>> };
        try {
          history = (await client.invoke(
            new Api.messages.GetHistory({
              peer: channelEntity as never,
              offsetId,
              offsetDate: 0,
              addOffset: 0,
              limit: BATCH_SIZE,
              maxId: 0,
              minId: 0,
              hash: BigInt(0) as never,
            }),
          )) as never;
        } catch (err) {
          const msg = extractErrorMessage(err);
          const wait = parseFloodWaitSeconds(msg);
          if (
            wait !== null &&
            wait * 1000 + FLOOD_MARGIN_MS < FLOOD_MAX_WAIT_MS
          ) {
            await sleep(wait * 1000 + FLOOD_MARGIN_MS);
            continue;
          }
          await fail(`Falha em GetHistory: ${msg}`);
          return;
        }

        const messages = history.messages ?? [];
        if (messages.length === 0) break;

        for (const message of messages) {
          scanned += 1;
          const msg = message as {
            id?: number;
            date?: number;
            message?: string;
            media?: unknown;
            className?: string;
          };
          if (msg.className !== "Message" || !msg.id) continue;

          const cls = classifyMedia(msg.media);
          if (!cls) continue;

          const existing = await db.channelBackupItem.findUnique({
            where: {
              botId_sourceChannelId_telegramMessageId: {
                botId,
                sourceChannelId: channelIdStr,
                telegramMessageId: msg.id,
              },
            },
            select: { id: true },
          });
          if (existing) {
            skipped += 1;
            await flushProgress();
            continue;
          }

          const tmpPath = join(
            workDir,
            `${msg.id}-${randomUUID().slice(0, 8)}.${cls.ext}`,
          );
          // Snapshot do item em curso pra UI mostrar progresso live.
          await db.backupJobRun.update({
            where: { id: jobRunId },
            data: {
              currentMessageId: msg.id,
              currentMediaType: cls.mediaType,
              currentBytesDownloaded: BigInt(0),
              currentBytesTotal: cls.sizeBytes ?? null,
              currentItemStartedAt: new Date(),
              messagesScanned: scanned,
              itemsAdded: added,
              itemsSkipped: skipped,
            },
          });
          lastFlush = scanned;
          try {
            const writer = createWriteStream(tmpPath);
            const iter = client.iterDownload({
              file: msg.media as never,
              requestSize: 1024 * 1024,
            });
            let downloaded = 0;
            let lastBytesFlush = Date.now();
            for await (const chunk of iter) {
              writer.write(chunk);
              downloaded += (chunk as Buffer | Uint8Array).length;
              // Throttle DB updates (~1.5s) — evita spam mas dá feedback frequente.
              const now = Date.now();
              if (now - lastBytesFlush >= 1500) {
                lastBytesFlush = now;
                await db.backupJobRun
                  .update({
                    where: { id: jobRunId },
                    data: { currentBytesDownloaded: BigInt(downloaded) },
                  })
                  .catch(() => {
                    /* progress não bloqueia download */
                  });
              }
            }
            await new Promise<void>((resolve, reject) => {
              writer.end(() => resolve());
              writer.on("error", reject);
            });

            const fileStat = await stat(tmpPath);
            const storageKey = `backup/${botId}/${channelIdStr}/${msg.id}.${cls.ext}`;
            await putObjectFromFile({
              key: storageKey,
              filePath: tmpPath,
              contentType: cls.mimeType ?? undefined,
            });

            const messageId = msg.id;
            const messageAt = new Date((msg.date ?? 0) * 1000);
            const caption = msg.message ?? null;
            const { title, description } = deriveTitleDescription(
              caption,
              messageId,
              messageAt,
            );

            // Cria Content (assinante) + ChannelBackupItem em transação.
            // publishedAt + sentToChannelAt = messageAt pra suprimir
            // re-broadcast (já está no canal).
            await db.$transaction(async (tx) => {
              const content = await tx.content.create({
                data: {
                  botId,
                  userId: ownerUserId,
                  title,
                  description,
                  type: mediaTypeToContentType(cls.mediaType),
                  price: "0",
                  originalKey: storageKey,
                  deliveryMode: "catalog",
                  availability: "available",
                  publishedAt: messageAt,
                  sentToChannelAt: messageAt,
                },
                select: { id: true },
              });
              await tx.channelBackupItem.create({
                data: {
                  botId,
                  telegramMessageId: messageId,
                  sourceChannelId: channelIdStr,
                  mediaType: cls.mediaType,
                  storageKey,
                  sizeBytes: BigInt(fileStat.size),
                  mimeType: cls.mimeType,
                  caption,
                  messageAt,
                  contentId: content.id,
                },
              });
            });
            added += 1;
          } catch (err) {
            const m = extractErrorMessage(err);
            const wait = parseFloodWaitSeconds(m);
            if (
              wait !== null &&
              wait * 1000 + FLOOD_MARGIN_MS < FLOOD_MAX_WAIT_MS
            ) {
              console.warn(
                `[channel-backup] FLOOD_WAIT ${wait}s — esperando antes de retomar`,
              );
              await sleep(wait * 1000 + FLOOD_MARGIN_MS);
            } else {
              console.error(
                `[channel-backup] msg ${msg.id} falhou: ${m.slice(0, 200)}`,
              );
            }
            skipped += 1;
          } finally {
            await unlink(tmpPath).catch(() => {});
            // Limpa snapshot do item em curso e força flush dos contadores.
            await db.backupJobRun
              .update({
                where: { id: jobRunId },
                data: {
                  currentMessageId: null,
                  currentMediaType: null,
                  currentBytesDownloaded: null,
                  currentBytesTotal: null,
                  currentItemStartedAt: null,
                  messagesScanned: scanned,
                  itemsAdded: added,
                  itemsSkipped: skipped,
                },
              })
              .catch(() => {});
            lastFlush = scanned;
          }

          await sleep(ITEM_DELAY_MS);
        }

        const last = messages[messages.length - 1] as { id?: number };
        if (!last?.id || last.id === offsetId) break;
        offsetId = last.id;

        await sleep(BATCH_DELAY_MS);
      }

      await db.backupJobRun.update({
        where: { id: jobRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          messagesScanned: scanned,
          itemsAdded: added,
          itemsSkipped: skipped,
          currentMessageId: null,
          currentMediaType: null,
          currentBytesDownloaded: null,
          currentBytesTotal: null,
          currentItemStartedAt: null,
        },
      });
    } catch (err) {
      await fail(extractErrorMessage(err));
    } finally {
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
      try {
        await client.destroy();
      } catch {
        /* ignore */
      }
    }
  },
  { concurrency: 1, lockDuration: 60 * 60 * 1000 },
);

channelBackupWorker.on("failed", (job, err) => {
  console.error(
    `[channel-backup] job ${job?.id} falhou (attempts=${job?.attemptsMade}):`,
    err.message,
  );
});
