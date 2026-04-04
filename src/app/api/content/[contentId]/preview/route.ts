import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePresignedDownloadUrl } from "@/lib/s3";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      );
    }

    const { contentId } = await params;
    const content = await db.content.findUnique({
      where: { id: contentId },
      select: { previewKey: true, bot: { select: { userId: true } } },
    });

    if (!content || !content.previewKey) {
      return NextResponse.json(
        { success: false, error: "Preview não encontrado" },
        { status: 404 }
      );
    }

    if (
      session.user.role === "creator" &&
      content.bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Acesso negado" },
        { status: 403 }
      );
    }

    const url = await generatePresignedDownloadUrl(content.previewKey);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[GET /api/content/[contentId]/preview]", error);
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}
