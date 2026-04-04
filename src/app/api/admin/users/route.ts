import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllUsers } from "@/server/queries/users";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "owner" && session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10))
    );

    const search = searchParams.get("search") ?? undefined;
    const role = searchParams.get("role") ?? undefined;
    const isActiveParam = searchParams.get("isActive");

    let isActive: boolean | undefined;
    if (isActiveParam === "true") isActive = true;
    else if (isActiveParam === "false") isActive = false;

    const result = await getAllUsers(page, pageSize, {
      search,
      role,
      isActive,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[GET /api/admin/users] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
