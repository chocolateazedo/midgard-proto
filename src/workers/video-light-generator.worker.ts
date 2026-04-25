// Gera variante "leve" do vídeo dividida em segmentos pra contornar o
// limite de 50 MB do Telegram Bot API.
//
// Fluxo:
// 1. Lê o Content; skip se type != video, lightKeys já preenchido, ou
//    content sumiu.
// 2. HEAD do original; se <= LIGHT_THRESHOLD_BYTES, marca lightKeys com
//    a própria key original (segmento único) e retorna — stream multipart
//    sozinho resolve.
// 3. Stream do storage pra arquivo temporário.
// 4. ffmpeg comprime e segmenta em chunks de SEGMENT_SECONDS (default 600s
//    = 10 min). H.264 baseline, 720p cap, 500 kbps + 64 kbps áudio,
//    faststart. Cada segmento sai em ~30 MB com folga abaixo de 50 MB.
// 5. Sobe cada segmento pro storage como `<originalKey>-light-NNN.mp4`
//    e grava o array em Content.lightKeys.
//
// Tempo: ~30s a alguns minutos por vídeo. lockDuration de 30 min cobre
// worst case.

import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, readdir, stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import {
  getObjectStream,
  putObjectFromFile,
} from "@/lib/s3";

export interface VideoLightJob {
  contentId: string;
}

// Acima desse tamanho, geramos variante leve segmentada. Abaixo, basta
// stream multipart no envio (sendMediaFromKey).
const LIGHT_THRESHOLD_BYTES = 45 * 1024 * 1024; // ~45 MB
// Duração de cada segmento em segundos. 600s × 500 kbps + 64 kbps áudio
// ≈ 42 MB — abaixo do limite Telegram (50 MB) com folga.
const SEGMENT_SECONDS = 600;

export const videoLightGeneratorWorker = createWorker<VideoLightJob>(
  "video-light-version",
  async (job) => {
    const { contentId } = job.data;

    const content = await db.content.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        type: true,
        originalKey: true,
        lightKeys: true,
      },
    });
    if (!content) {
      console.warn(`[video-light] Content ${contentId} não encontrado`);
      return;
    }
    if (content.type !== "video") return;
    if (content.lightKeys.length > 0) return; // já gerado

    const { stream, contentLength } = await getObjectStream(content.originalKey);

    // Original cabe direto em multipart? Marca o próprio key como segmento
    // único pra senders nem precisarem checar tamanho.
    if (contentLength > 0 && contentLength <= LIGHT_THRESHOLD_BYTES) {
      try {
        (stream as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
      await db.content.update({
        where: { id: contentId },
        data: { lightKeys: [content.originalKey] },
      });
      return;
    }

    const workDir = join(tmpdir(), `video-light-${contentId}`);
    await mkdir(workDir, { recursive: true });
    const inputPath = join(workDir, "in.mp4");
    const outputPattern = join(workDir, "out_%03d.mp4");

    const uploadedKeys: string[] = [];

    try {
      // 1. Stream pro disco — evita carregar GBs em RAM.
      await pipeline(stream, createWriteStream(inputPath));

      // 2. ffmpeg recodifica + segmenta.
      // -reset_timestamps 1 faz cada segmento começar em t=0 (player
      // não embaralha). -segment_time aproxima — corte real ocorre no
      // próximo keyframe; mantemos GOP curto (-g 60) pra não passar do
      // alvo de 10 min em mais de poucos segundos.
      await new Promise<void>((resolve, reject) => {
        const args = [
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-profile:v", "baseline",
          "-level", "3.1",
          "-preset", "medium",
          "-vf", "scale='min(1280,iw)':-2",
          "-b:v", "500k",
          "-maxrate", "600k",
          "-bufsize", "1M",
          "-g", "60",
          "-c:a", "aac",
          "-b:a", "64k",
          "-ac", "2",
          "-movflags", "+faststart",
          "-f", "segment",
          "-segment_time", String(SEGMENT_SECONDS),
          "-reset_timestamps", "1",
          outputPattern,
        ];
        const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        ff.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          if (stderr.length > 8000) stderr = stderr.slice(-4000);
        });
        ff.on("error", reject);
        ff.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
        });
      });

      // 3. Lista segmentos gerados, em ordem.
      const files = (await readdir(workDir))
        .filter((f) => f.startsWith("out_") && f.endsWith(".mp4"))
        .sort();
      if (files.length === 0) {
        throw new Error("ffmpeg não gerou nenhum segmento");
      }

      // 4. Sobe cada segmento. Se algum estiver acima de 50 MB,
      // loga warning mas segue (Telegram pode aceitar até ~52 com folga
      // de protocolo; se rejeitar, próximo passo é diminuir SEGMENT_SECONDS).
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = join(workDir, file);
        const fileStat = await stat(filePath);
        if (fileStat.size > 50 * 1024 * 1024) {
          console.warn(
            `[video-light] Segmento ${i + 1}/${files.length} > 50MB (${fileStat.size}b) pro content ${contentId}`
          );
        }
        const lightKey = buildLightSegmentKey(content.originalKey, i);
        await putObjectFromFile({
          key: lightKey,
          filePath,
          contentType: "video/mp4",
        });
        uploadedKeys.push(lightKey);
      }

      await db.content.update({
        where: { id: contentId },
        data: { lightKeys: uploadedKeys },
      });
    } finally {
      // Limpa input + segmentos do tmp.
      await unlink(inputPath).catch(() => {});
      try {
        const remaining = await readdir(workDir);
        await Promise.all(
          remaining.map((f) => unlink(join(workDir, f)).catch(() => {}))
        );
      } catch {
        /* ignore */
      }
    }
  },
  { concurrency: 1, lockDuration: 30 * 60 * 1000 }
);

videoLightGeneratorWorker.on("failed", (job, err) => {
  console.error(
    `[video-light] job ${job?.id} falhou (attempts=${job?.attemptsMade}):`,
    err.message
  );
});

function buildLightSegmentKey(originalKey: string, index: number): string {
  // content/<botId>/<uuid>.mp4 → content/<botId>/<uuid>-light-001.mp4
  const padded = String(index).padStart(3, "0");
  const dot = originalKey.lastIndexOf(".");
  if (dot === -1) return `${originalKey}-light-${padded}`;
  return `${originalKey.slice(0, dot)}-light-${padded}.mp4`;
}
