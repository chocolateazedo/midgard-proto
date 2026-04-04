import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPlatformEarnings,
  getDailyEarnings,
  getTopCreators,
  getTopBots,
} from "@/server/queries/earnings";
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

    // Date range — defaults to last 30 days
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date range" },
        { status: 422 }
      );
    }

    const topLimit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("topLimit") ?? "5", 10))
    );

    const [allPurchases, dailyBreakdown, topCreators, topBots] =
      await Promise.all([
        getPlatformEarnings(startDate, endDate),
        getDailyEarnings(null, startDate, endDate),
        getTopCreators(topLimit),
        getTopBots(topLimit),
      ]);

    const totalGross = allPurchases.reduce(
      (sum, p) => sum + p.amount,
      0
    );
    const totalFees = allPurchases.reduce(
      (sum, p) => sum + p.platformFee,
      0
    );
    const totalCreatorNet = allPurchases.reduce(
      (sum, p) => sum + p.creatorNet,
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalGross: totalGross.toFixed(2),
          totalFees: totalFees.toFixed(2),
          totalCreatorNet: totalCreatorNet.toFixed(2),
          totalTransactions: allPurchases.length,
        },
        purchases: allPurchases,
        dailyBreakdown,
        topCreators,
        topBots,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/earnings] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
