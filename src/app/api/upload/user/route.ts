import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";
import path from "path";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload/user
 * Gera presigned URL para upload de arquivos de usuário (avatar, documentos).
 * Body: { filename, contentType, type: "avatar" | "doc-front" | "doc-back" | "doc-selfie", userId? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { filename, contentType, type, userId } = body as {
      filename: string;
      contentType: string;
      type: "avatar" | "doc-front" | "doc-back" | "doc-selfie";
      userId?: string;
    };

    if (!filename || !contentType || !type) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: filename, contentType, type" },
        { status: 400 }
      );
    }

    const validTypes = ["avatar", "doc-front", "doc-back", "doc-selfie"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Tipo inválido" },
        { status: 400 }
      );
    }

    // Admin pode fazer upload para qualquer usuário, creator só para si mesmo
    const targetUserId = (session.user.role === "owner" || session.user.role === "admin")
      ? (userId ?? session.user.id)
      : session.user.id;

    const ext = path.extname(filename) || ".jpg";
    const key = `users/${targetUserId}/${type}/${crypto.randomUUID()}${ext}`;

    const url = await generatePresignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({
      success: true,
      data: { url, key },
    });
  } catch (error) {
    console.error("[POST /api/upload/user]", error);
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}
