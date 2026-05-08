// Upload de mídia para Recovery Messages com compressão server-side de
// fotos. Por que esse endpoint separado? Conteúdo (publish) precisa do
// arquivo original. Mensagens recorrentes precisam de fotos pequenas
// pra caber no limite de 10 MB do sendPhoto Telegram.
//
// Fluxo:
//   - Browser POST multipart (botId + file)
//   - Servidor recebe buffer, valida tipo + tamanho
//   - Se image: sharp resize ≤ 1920x1920, jpeg quality 85, mira < 5 MB
//   - Se video: pass-through (sendVideo aceita 50 MB stream)
//   - Upload pro Wasabi
//   - Retorna { key, originalSize, finalSize, mediaType }

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import { putObjectFromBuffer } from "@/lib/s3";

export const dynamic = "force-dynamic";
// Permite uploads grandes (Next.js default 4 MB body). Aceitamos até 50 MB.
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Mira bem abaixo do limite Telegram (10 MB) pra deixar margem.
const PHOTO_TARGET_MAX_BYTES = 5 * 1024 * 1024;
// Reduz drasticamente — mensagens recorrentes não precisam alta resolução
// e Telegram já comprime preview no app.
const PHOTO_MAX_DIMENSION = 700;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 },
      );
    }

    const form = await request.formData();
    const botId = form.get("botId");
    const file = form.get("file");

    if (typeof botId !== "string" || !botId) {
      return NextResponse.json(
        { success: false, error: "botId é obrigatório" },
        { status: 400 },
      );
    }
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

    // Permissão no bot.
    const bot = await db.bot.findFirst({
      where: { id: botId },
      select: { userId: true, user: { select: { managedByUserId: true } } },
    });
    if (!bot) {
      return NextResponse.json(
        { success: false, error: "Bot não encontrado" },
        { status: 404 },
      );
    }
    if (!hasBotManagePermission(bot, session)) {
      return NextResponse.json(
        { success: false, error: "Sem permissão" },
        { status: 403 },
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
      // Compressão progressiva: começa em quality 85, cai em 5 até < target ou min 50.
      const sharp = (await import("sharp")).default;
      const meta = await sharp(originalBuf).metadata();
      const longestSide = Math.max(meta.width ?? 0, meta.height ?? 0);
      const needsResize = longestSide > PHOTO_MAX_DIMENSION;

      let quality = 85;
      let attempt: Buffer = originalBuf;
      while (quality >= 50) {
        const pipeline = sharp(originalBuf).rotate(); // respeita EXIF
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
      finalBuf = originalBuf;
      finalContentType = file.type || "video/mp4";
      // Mantém ext original quando dá pra detectar; default mp4.
      const guessedExt =
        file.name.includes(".") &&
        file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
      ext = guessedExt && guessedExt.length <= 5 ? guessedExt : "mp4";
    }

    const key = `content/${botId}/${randomUUID()}.${ext}`;
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
    console.error("[POST /api/upload/recovery-media]", err);
    return NextResponse.json(
      { success: false, error: "Erro interno no upload" },
      { status: 500 },
    );
  }
}
