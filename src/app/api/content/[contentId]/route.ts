import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getContentById } from "@/server/queries/content";
import { updateContentSchema } from "@/lib/validations";
import { deleteObject } from "@/lib/s3";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { contentId } = await params;
    const item = await getContentById(contentId);

    if (!item) {
      return NextResponse.json(
        { success: false, error: "Content not found" },
        { status: 404 }
      );
    }

    if (
      session.user.role === "creator" &&
      item.bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[GET /api/content/[contentId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { contentId } = await params;
    const item = await getContentById(contentId);

    if (!item) {
      return NextResponse.json(
        { success: false, error: "Content not found" },
        { status: 404 }
      );
    }

    if (
      session.user.role === "creator" &&
      item.bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", data: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.price !== undefined) updateData.price = parsed.data.price.toFixed(2);
    if (parsed.data.isPublished !== undefined) updateData.isPublished = parsed.data.isPublished;

    const updated = await db.content.update({
      where: { id: contentId },
      data: updateData as any,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PUT /api/content/[contentId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { contentId } = await params;
    const item = await getContentById(contentId);

    if (!item) {
      return NextResponse.json(
        { success: false, error: "Content not found" },
        { status: 404 }
      );
    }

    if (
      session.user.role === "creator" &&
      item.bot.userId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Delete S3 objects
    const deletePromises: Promise<void>[] = [deleteObject(item.originalKey)];
    if (item.previewKey) {
      deletePromises.push(deleteObject(item.previewKey));
    }

    await Promise.allSettled(deletePromises);

    await db.content.delete({ where: { id: contentId } });

    return NextResponse.json({ success: true, data: { id: contentId } });
  } catch (error) {
    console.error("[DELETE /api/content/[contentId]] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
