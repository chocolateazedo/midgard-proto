import sharp from "sharp";
import { Readable } from "stream";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export async function generateImagePreview(
  inputBuffer: Buffer
): Promise<Buffer> {
  const watermarkSvg = `
    <svg width="800" height="100">
      <text
        x="50%"
        y="50%"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, sans-serif"
        font-size="48"
        font-weight="bold"
        fill="white"
        opacity="0.8"
        stroke="black"
        stroke-width="2"
      >Compre para ver</text>
    </svg>
  `;

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const width = Math.min(metadata.width || 800, 800);
  const height = metadata.height
    ? Math.round((width / (metadata.width || 800)) * metadata.height)
    : 600;

  const watermark = Buffer.from(watermarkSvg);

  return image
    .resize(width, height, { fit: "inside" })
    .blur(18)
    .composite([
      {
        input: await sharp(watermark).resize(width, 100).png().toBuffer(),
        gravity: "center",
      },
    ])
    .jpeg({ quality: 60 })
    .toBuffer();
}

export async function generateVideoThumbnail(
  videoPath: string
): Promise<Buffer> {
  const ffmpeg = await import("fluent-ffmpeg");
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `thumb_${Date.now()}.jpg`);

  return new Promise<Buffer>((resolve, reject) => {
    ffmpeg
      .default(videoPath)
      .screenshots({
        timestamps: ["2"],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "800x?",
      })
      .on("end", async () => {
        try {
          const thumbBuffer = await fs.readFile(outputPath);
          const preview = await generateImagePreview(thumbBuffer);
          await fs.unlink(outputPath).catch(() => {});
          resolve(preview);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err: Error) => reject(err));
  });
}

/**
 * Gera thumbnail pequeno (max 150x150) para exibição no catálogo do Telegram.
 * Mantém proporção original, sem blur ou watermark.
 */
export async function generateThumbnail(
  inputBuffer: Buffer
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(150, 150, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

/**
 * Extrai um frame do vídeo e gera thumbnail pequeno (max 150x150).
 */
export async function generateVideoFrame(
  videoPath: string
): Promise<Buffer> {
  const ffmpeg = await import("fluent-ffmpeg");
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `frame_${Date.now()}.jpg`);

  const frameBuffer = await new Promise<Buffer>((resolve, reject) => {
    ffmpeg
      .default(videoPath)
      .screenshots({
        timestamps: ["2"],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "150x?",
      })
      .on("end", async () => {
        try {
          const buf = await fs.readFile(outputPath);
          await fs.unlink(outputPath).catch(() => {});
          resolve(buf);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err: Error) => reject(err));
  });

  // Garantir que nenhuma dimensão ultrapasse 150px
  return sharp(frameBuffer)
    .resize(150, 150, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

export async function generateFilePlaceholder(
  filename: string
): Promise<Buffer> {
  const ext = path.extname(filename).toUpperCase().replace(".", "");
  const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1e1b2e"/>
      <text x="50%" y="40%" text-anchor="middle" font-family="Arial" font-size="80" fill="#7c3aed">
        ${ext || "FILE"}
      </text>
      <text x="50%" y="60%" text-anchor="middle" font-family="Arial" font-size="28" fill="#a78bfa">
        ${filename.length > 30 ? filename.substring(0, 27) + "..." : filename}
      </text>
      <text x="50%" y="75%" text-anchor="middle" font-family="Arial" font-size="36" fill="white" opacity="0.7">
        Compre para ver
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}
