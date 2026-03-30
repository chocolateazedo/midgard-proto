import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBotsByUserId } from "@/server/queries/bots";
import { createBotSchema } from "@/lib/validations";
import { botManager } from "@/lib/telegram";
import { encrypt } from "@/lib/crypto";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userBots = await getBotsByUserId(session.user.id);
    return NextResponse.json({ success: true, data: userBots });
  } catch (error) {
    console.error("[GET /api/bots] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createBotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { name, telegramToken, description } = parsed.data;

    // Validate token with Telegram API and retrieve bot info
    let botInfo: { username: string } | null = null;
    try {
      botInfo = await botManager.getBotInfo(telegramToken);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Token do Telegram inválido. Verifique o token fornecido pelo BotFather.",
        },
        { status: 422 }
      );
    }

    const encryptedToken = encrypt(telegramToken);
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const newBot = await db.bot.create({
      data: {
        userId: session.user.id,
        name,
        username: botInfo.username,
        telegramToken: encryptedToken,
        description: description ?? null,
        isActive: false,
        webhookUrl: null,
      },
    });

    const webhookUrl = `${baseUrl}/api/webhooks/telegram/${newBot.id}`;

    // Register webhook with Telegram
    try {
      await botManager.setWebhook(telegramToken, webhookUrl);
      await db.bot.update({
        where: { id: newBot.id },
        data: { isActive: true, webhookUrl },
      });
      (newBot as any).isActive = true;
      (newBot as any).webhookUrl = webhookUrl;
    } catch (webhookError) {
      console.error("[POST /api/bots] Failed to set webhook:", webhookError);
      // Bot is created but webhook registration failed; isActive stays false
    }

    return NextResponse.json({ success: true, data: newBot }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bots] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
