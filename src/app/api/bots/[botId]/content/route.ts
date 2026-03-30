import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { content } from "@/lib/db/schema";
import { getBotById } from "@/server/queries/bots";
import { getContentByBotId } from "@/server/queries/content";
import { createContentSchema } from "@/lib/validations";
import { previewGenerationQueue } from "@/lib/queue";

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

    if (session.user.role === "creator" && bot.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const contentList = await getContentByBotId(botId);
    return NextResponse.json({ success: true, data: contentList });
  } catch (error) {
    console.error("[GET /api/bots/[botId]/content] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    if (session.user.role === "creator" && bot.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createContentSchema.safeParse({ ...body, botId });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { title, description, type, price, originalKey, isPublished } =
      parsed.data;

    const [newContent] = await db
      .insert(content)
      .values({
        botId,
        userId: session.user.id,
        title,
        description,
        type,
        price: price.toFixed(2),
        originalKey,
        isPublished: isPublished ?? false,
      })
      .returning();

    // Enqueue preview generation as background job
    await previewGenerationQueue.add("generate-preview", {
      contentId: newContent.id,
      originalKey,
      type,
    });

    return NextResponse.json({ success: true, data: newContent }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bots/[botId]/content] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
