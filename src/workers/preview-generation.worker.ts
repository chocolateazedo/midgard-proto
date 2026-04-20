import { createWriteStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { db } from "@/lib/db";
import {
  generateFilePlaceholder,
  generateImagePreview,
  generateThumbnail,
  generateVideoFrame,
  generateVideoThumbnail,
} from "@/lib/preview";
import { createWorker } from "@/lib/queue";
import { getS3Client } from "@/lib/s3";

type PreviewGenerationJob = {
  contentId: string;
  originalKey: string;
  type: "image" | "video" | "file" | "bundle";
  filename?: string;
};

// Baixa objeto do S3 via stream direto pra disco, sem carregar o arquivo
// em memória. Essencial pra vídeos de 100MB+ que antes estouravam o pod.
async function streamS3ToDisk(
  s3Response: { Body?: unknown },
  destPath: string,
): Promise<void> {
  const body = s3Response.Body;
  if (!body) throw new Error("S3 response sem Body");
  if (!(body instanceof Readable)) {
    throw new Error("S3 response.Body não é Readable — Node runtime necessário");
  }
  await pipeline(body, createWriteStream(destPath));
}

export const previewGenerationWorker = createWorker<PreviewGenerationJob>(
  "preview-generation",
  async (job) => {
    const { contentId, originalKey, type, filename } = job.data;
    const { client, config } = await getS3Client();

    let previewBuffer: Buffer;
    let thumbnailBuffer: Buffer | null = null;
    const cleanup: string[] = [];

    try {
      if (type === "image") {
        const ext = filename ? path.extname(filename) : ".jpg";
        const tmpPath = path.join(os.tmpdir(), `img_${contentId}_${Date.now()}${ext}`);
        cleanup.push(tmpPath);
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: originalKey }),
        );
        await streamS3ToDisk(response, tmpPath);
        // Sharp aceita path diretamente; consome o arquivo em blocos sem
        // segurar o imagem inteira em um Buffer único.
        previewBuffer = await generateImagePreview(tmpPath);
        thumbnailBuffer = await generateThumbnail(tmpPath);
      } else if (type === "video") {
        const fname = filename ?? "video.mp4";
        const tmpPath = path.join(
          os.tmpdir(),
          `video_${contentId}_${Date.now()}_${path.basename(fname)}`,
        );
        cleanup.push(tmpPath);
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: originalKey }),
        );
        await streamS3ToDisk(response, tmpPath);
        previewBuffer = await generateVideoThumbnail(tmpPath);
        thumbnailBuffer = await generateVideoFrame(tmpPath);
      } else {
        previewBuffer = await generateFilePlaceholder(filename ?? "arquivo");
      }

      const baseName = filename ? path.parse(filename).name : contentId;
      const previewKey = `previews/${contentId}/${baseName}_preview.jpg`;

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: previewKey,
          Body: previewBuffer,
          ContentType: "image/jpeg",
        }),
      );

      let thumbnailKey: string | undefined;
      if (thumbnailBuffer) {
        thumbnailKey = `thumbnails/${contentId}/${baseName}_thumb.jpg`;
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: thumbnailKey,
            Body: thumbnailBuffer,
            ContentType: "image/jpeg",
          }),
        );
      }

      await db.content.update({
        where: { id: contentId },
        data: {
          previewKey,
          ...(thumbnailKey ? { thumbnailKey } : {}),
          updatedAt: new Date(),
        },
      });
    } finally {
      for (const p of cleanup) {
        await fs.unlink(p).catch(() => {});
      }
    }
  },
  {
    // Vídeos grandes levam minutos no ffmpeg; o default de 30s do BullMQ
    // marcava o job como stalled antes de terminar.
    lockDuration: 600_000,
    // Pod do worker tem 2Gi; rodar 5 vídeos em paralelo ainda estouraria.
    // 2 dá folga operacional mantendo throughput aceitável.
    concurrency: 2,
  },
);
