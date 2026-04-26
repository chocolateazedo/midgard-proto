import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMtprotoMemberOfChannel } from "@/lib/telegram-mtproto";

export const dynamic = "force-dynamic";

/**
 * Retorna o status do canal vinculado ao bot:
 * - hasChannel: bot tem channelId no banco
 * - mtprotoMember: a conta MTProto da plataforma (brand: "Telegram BotFans")
 *   é membro do canal vinculado. null = sem sessão MTProto ativa, sem
 *   channelId, ou erro temporário.
 *
 * Endpoint separado de /api/bots/[botId] pra não pagar o custo de
 * round-trip MTProto em todo GET de bot. Chamado sob demanda nas
 * páginas de detalhe.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { botId } = await params;
    const bot = await db.bot.findFirst({
      where: { id: botId },
      select: { id: true, userId: true, channelId: true, channelTitle: true },
    });
    if (!bot) {
      return NextResponse.json(
        { success: false, error: "Bot not found" },
        { status: 404 },
      );
    }

    // Creator só vê os próprios bots.
    if (
      session.user.role === "creator" &&
      bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (!bot.channelId) {
      return NextResponse.json({
        success: true,
        data: {
          hasChannel: false,
          channelTitle: null,
          mtprotoMember: null,
        },
      });
    }

    const channelIdStr = bot.channelId.toString();
    const mtprotoMember = await isMtprotoMemberOfChannel(channelIdStr);

    return NextResponse.json({
      success: true,
      data: {
        hasChannel: true,
        channelTitle: bot.channelTitle,
        mtprotoMember,
      },
    });
  } catch (error) {
    console.error("[GET /api/bots/[botId]/channel-status] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
