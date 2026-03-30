import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { getBotById } from "@/server/queries/bots";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { botId } = await params;
    const bot = await getBotById(botId);

    if (!bot) {
      return NextResponse.json(
        { success: false, error: "Bot not found" },
        { status: 404 }
      );
    }

    if (session.user.role === "creator" && bot.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const token = decrypt(bot.telegramToken);
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const webhookUrl = `${baseUrl}/api/webhooks/telegram/${botId}`;

    let newIsActive: boolean;

    if (bot.isActive) {
      // Deactivate: remove webhook
      try {
        await botManager.deleteWebhook(token);
      } catch (err) {
        console.error("[POST /api/bots/[botId]/start] Failed to delete webhook:", err);
      }
      newIsActive = false;
    } else {
      // Activate: register webhook
      try {
        await botManager.setWebhook(token, webhookUrl);
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Falha ao registrar webhook no Telegram. Verifique o token do bot.",
          },
          { status: 502 }
        );
      }
      newIsActive = true;
    }

    const [updated] = await db
      .update(bots)
      .set({
        isActive: newIsActive,
        webhookUrl: newIsActive ? webhookUrl : null,
        updatedAt: new Date(),
      })
      .where(eq(bots.id, botId))
      .returning();

    const { telegramToken: _, ...safeBot } = updated;

    return NextResponse.json({
      success: true,
      data: { ...safeBot, isActive: newIsActive },
    });
  } catch (error) {
    console.error("[POST /api/bots/[botId]/start] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
