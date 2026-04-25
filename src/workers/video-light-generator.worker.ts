// Gera uma variante "leve" do vídeo original pra contornar o limite de
// 50 MB do Telegram Bot API. Acionado ao publicar conteúdo de vídeo.
//
// Fluxo:
// 1. Lê o Content; skip se type != video, ou já tem lightKey, ou content
//    sumiu.
// 2. HEAD do original; se <= LIGHT_THRESHOLD_BYTES, skip (stream multipart
//    sozinho resolve).
// 3. Stream do storage pra arquivo temporário no disco (não buffer em RAM).
// 4. ffmpeg comprime: H.264 baseline, 720p cap, ~500 kbps vídeo + 64 kbps
//    áudio, faststart pra streaming. Esses parâmetros mantêm vídeos curtos
//    e médios sob 50 MB.
// 5. Sobe pro storage como `<originalKey>-light.mp4` e grava em
//    Content.lightKey. Limpa temp.
//
// Tempo: ~30s a poucos minutos por vídeo grande. lockDuration de 30 min
// pra cobrir worst case.

import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, stat, unlink } from "fs/promises";
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

// Acima desse tamanho, a variante leve é gerada. Abaixo, stream multipart
// (sendMediaFromKey) já cobre o envio ao Telegram.
const LIGHT_THRESHOLD_BYTES = 45 * 1024 * 1024; // ~45 MB (folga sob 50 MB)

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
        lightKey: true,
      },
    });
    if (!content) {
      console.warn(`[video-light] Content ${contentId} não encontrado`);
      return;
    }
    if (content.type !== "video") return;
    if (content.lightKey) return; // já gerado

    const { stream, contentLength } = await getObjectStream(content.originalKey);
    if (contentLength > 0 && contentLength <= LIGHT_THRESHOLD_BYTES) {
      // Original já é pequeno o suficiente — não precisa variante.
      // Fechamos o stream pra liberar conexão.
      try {
        (stream as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
      return;
    }

    const workDir = join(tmpdir(), `video-light-${contentId}`);
    await mkdir(workDir, { recursive: true });
    const inputPath = join(workDir, "in.mp4");
    const outputPath = join(workDir, "out.mp4");

    try {
      // 1. Stream pro disco — evita carregar GBs em RAM.
      await pipeline(stream, createWriteStream(inputPath));

      // 2. ffmpeg: 720p cap + 500 kbps + 64 kbps áudio + faststart.
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
          "-c:a", "aac",
          "-b:a", "64k",
          "-ac", "2",
          "-movflags", "+faststart",
          outputPath,
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

      // 3. Verifica tamanho final + sobe pro storage.
      const outStat = await stat(outputPath);
      if (outStat.size > 50 * 1024 * 1024) {
        console.warn(
          `[video-light] Saída ainda > 50MB (${outStat.size} bytes) pro content ${contentId}; vídeo muito longo`
        );
        // Mesmo assim grava — talvez o sender ainda funcione com stream;
        // se falhar, próximo passo é cortar em segmentos.
      }

      const lightKey = buildLightKey(content.originalKey);
      await putObjectFromFile({
        key: lightKey,
        filePath: outputPath,
        contentType: "video/mp4",
      });

      await db.content.update({
        where: { id: contentId },
        data: { lightKey },
      });
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
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

function buildLightKey(originalKey: string): string {
  // content/<botId>/<uuid>.mp4 → content/<botId>/<uuid>-light.mp4
  const dot = originalKey.lastIndexOf(".");
  if (dot === -1) return `${originalKey}-light`;
  return `${originalKey.slice(0, dot)}-light.mp4`;
}
