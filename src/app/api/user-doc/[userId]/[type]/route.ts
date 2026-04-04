import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePresignedDownloadUrl } from "@/lib/s3";
export const dynamic = "force-dynamic";

/**
 * GET /api/user-doc/[userId]/[type]
 * Retorna redirect para presigned URL do documento do usuário.
 * type: "frente" | "verso" | "selfie"
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string; type: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    // Apenas admin/owner ou o próprio usuário
    const isAdmin = session.user.role === "owner" || session.user.role === "admin";
    const { userId, type } = await params;

    if (!isAdmin && session.user.id !== userId) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { docFrontKey: true, docBackKey: true, docSelfieKey: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    const keyMap: Record<string, string | null> = {
      frente: user.docFrontKey,
      verso: user.docBackKey,
      selfie: user.docSelfieKey,
    };

    const key = keyMap[type];
    if (!key) {
      return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });
    }

    const url = await generatePresignedDownloadUrl(key);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[GET /api/user-doc]", error);
    return NextResponse.json({ success: false, error: "Erro interno" }, { status: 500 });
  }
}
