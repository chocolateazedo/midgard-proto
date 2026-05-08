// Upload de mídia para broadcast admin: foto comprimida + vídeo curto
// (≤60s). Schema parecido com /api/upload/recovery-media mas:
// - Owner/admin only
// - Aceita vídeo se duração ≤60s (usa ffprobe pra validar)

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { auth } from "@/lib/auth";
import { putObjectFromBuffer } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PHOTO_TARGET_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1280;
const VIDEO_MAX_DURATION_SECONDS = 60;

async function probeVideoDurationSeconds(filePath: string): Promise<number | null> {
  const ffmpeg = await import("fluent-ffmpeg");
  return new Promise((resolve) => {
    ffmpeg.default.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve(null);
        return;
      }
      const dur = data?.format?.duration;
      resolve(typeof dur === "number" ? dur : null);
    });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 },
      );
    }
    if (session.user.role !== "owner" && session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Apenas owner/admin" },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "file é obrigatório" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Arquivo > 50 MB não suportado" },
        { status: 413 },
      );
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { success: false, error: "Apenas imagem ou vídeo" },
        { status: 415 },
      );
    }

    const originalBuf = Buffer.from(await file.arrayBuffer());

    let finalBuf: Buffer;
    let finalContentType: string;
    let ext: string;
    let mediaType: "photo" | "video";

    if (isImage) {
      mediaType = "photo";
      const sharp = (await import("sharp")).default;
      const meta = await sharp(originalBuf).metadata();
      const longestSide = Math.max(meta.width ?? 0, meta.height ?? 0);
      const needsResize = longestSide > PHOTO_MAX_DIMENSION;

      let quality = 85;
      let attempt: Buffer = originalBuf;
      while (quality >= 50) {
        const pipeline = sharp(originalBuf).rotate();
        if (needsResize) {
          pipeline.resize({
            width: PHOTO_MAX_DIMENSION,
            height: PHOTO_MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          });
        }
        attempt = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
        if (attempt.length <= PHOTO_TARGET_MAX_BYTES) break;
        quality -= 10;
      }
      finalBuf = attempt;
      finalContentType = "image/jpeg";
      ext = "jpg";
    } else {
      mediaType = "video";
      // Valida duração via ffprobe — escreve tmp file primeiro.
      const tmpPath = join(tmpdir(), `bc-${randomUUID()}.tmp`);
      await writeFile(tmpPath, originalBuf);
      try {
        const dur = await probeVideoDurationSeconds(tmpPath);
        if (dur === null) {
          return NextResponse.json(
            { success: false, error: "Não foi possível ler a duração do vídeo" },
            { status: 415 },
          );
        }
        if (dur > VIDEO_MAX_DURATION_SECONDS) {
          return NextResponse.json(
            {
              success: false,
              error: `Vídeo muito longo (${dur.toFixed(1)}s). Máximo: ${VIDEO_MAX_DURATION_SECONDS}s.`,
            },
            { status: 415 },
          );
        }
      } finally {
        await unlink(tmpPath).catch(() => {});
      }

      finalBuf = originalBuf;
      finalContentType = file.type || "video/mp4";
      const guessedExt =
        file.name.includes(".") &&
        file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
      ext = guessedExt && guessedExt.length <= 5 ? guessedExt : "mp4";
    }

    const key = `broadcast/${randomUUID()}.${ext}`;
    await putObjectFromBuffer({
      key,
      buffer: finalBuf,
      contentType: finalContentType,
    });

    return NextResponse.json({
      success: true,
      data: {
        key,
        mediaType,
        originalSize: originalBuf.length,
        finalSize: finalBuf.length,
      },
    });
  } catch (err) {
    console.error("[POST /api/upload/broadcast-media]", err);
    return NextResponse.json(
      { success: false, error: "Erro interno no upload" },
      { status: 500 },
    );
  }
}
