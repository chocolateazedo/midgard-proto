import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { getS3Client } from "@/lib/s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  generateImagePreview,
  generateVideoThumbnail,
  generateFilePlaceholder,
} from "@/lib/preview";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

type PreviewGenerationJob = {
  contentId: string;
  originalKey: string;
  type: "image" | "video" | "file" | "bundle";
  filename?: string;
};

export const previewGenerationWorker = createWorker<PreviewGenerationJob>(
  "preview-generation",
  async (job) => {
    const { contentId, originalKey, type, filename } = job.data;

    const { client, config } = await getS3Client();

    let previewBuffer: Buffer;

    if (type === "image") {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: originalKey,
        })
      );
      const originalBuffer = Buffer.from(
        await response.Body!.transformToByteArray()
      );
      previewBuffer = await generateImagePreview(originalBuffer);
    } else if (type === "video") {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: originalKey,
        })
      );
      const fname = filename ?? "video.mp4";
      const tmpPath = path.join(os.tmpdir(), `video_${Date.now()}_${fname}`);
      const videoBuffer = Buffer.from(
        await response.Body!.transformToByteArray()
      );
      await fs.writeFile(tmpPath, videoBuffer);

      try {
        previewBuffer = await generateVideoThumbnail(tmpPath);
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
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
      })
    );

    await db.content.update({
      where: { id: contentId },
      data: { previewKey, updatedAt: new Date() },
    });
  }
);
