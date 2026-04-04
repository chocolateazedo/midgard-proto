import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotById } from "@/server/queries/bots";
import { updateBotSchema } from "@/lib/validations";
import { botManager } from "@/lib/telegram";
import { encrypt, decrypt } from "@/lib/crypto";
import { deleteObject } from "@/lib/s3";
export const dynamic = "force-dynamic";

export async function GET(
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

    // Creators can only access their own bots
    if (
      session.user.role === "creator" &&
      bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Never expose the raw token
    const { telegramToken: _, ...safeBot } = bot;
    return NextResponse.json({ success: true, data: safeBot });
  } catch (error) {
    console.error("[GET /api/bots/[botId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
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

    if (
      session.user.role === "creator" &&
      bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateBotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { telegramToken, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date(),
    };

    if (telegramToken) {
      // Validate new token
      try {
        await botManager.getBotInfo(telegramToken);
      } catch {
        return NextResponse.json(
          { success: false, error: "Token do Telegram inválido." },
          { status: 422 }
        );
      }
      updateData.telegramToken = encrypt(telegramToken);

      // Re-register webhook with the new token
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const webhookUrl = `${baseUrl}/api/webhooks/telegram/${botId}`;
      try {
        await botManager.setWebhook(telegramToken, webhookUrl);
        updateData.webhookUrl = webhookUrl;
        updateData.isActive = true;
      } catch (webhookError) {
        console.error("[PUT /api/bots/[botId]] Webhook re-register failed:", webhookError);
      }
    }

    const updated = await db.bot.update({
      where: { id: botId },
      data: updateData as any,
    });

    const { telegramToken: __, ...safeBot } = updated;
    return NextResponse.json({ success: true, data: safeBot });
  } catch (error) {
    console.error("[PUT /api/bots/[botId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    if (
      session.user.role === "creator" &&
      bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Remove webhook from Telegram
    try {
      const token = decrypt(bot.telegramToken);
      await botManager.deleteWebhook(token);
    } catch (err) {
      console.error("[DELETE /api/bots/[botId]] Failed to delete webhook:", err);
    }

    await db.bot.delete({ where: { id: botId } });

    return NextResponse.json({ success: true, data: { id: botId } });
  } catch (error) {
    console.error("[DELETE /api/bots/[botId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
