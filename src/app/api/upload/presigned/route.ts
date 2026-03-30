import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { generatePresignedUploadUrl } from "@/lib/s3";
import { presignedUrlSchema } from "@/lib/validations";

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
    const parsed = presignedUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { filename, contentType, botId } = parsed.data;

    // Verify bot ownership
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

    const ext = filename.includes(".")
      ? filename.substring(filename.lastIndexOf("."))
      : "";
    const key = `content/${botId}/${randomUUID()}${ext}`;

    const url = await generatePresignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({ success: true, data: { url, key } });
  } catch (error) {
    console.error("[POST /api/upload/presigned] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
