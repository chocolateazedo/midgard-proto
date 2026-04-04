import { NextRequest, NextResponse } from "next/server";
import { checkSubscriptionExpiry } from "@/lib/inline-jobs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/subscription-expiry
 * Verifica e expira assinaturas vencidas.
 * Deve ser chamado periodicamente (ex: a cada 1 hora via cron externo).
 * Protegido por token opcional via CRON_SECRET.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const queryToken = request.nextUrl.searchParams.get("token");
    const provided = authHeader?.replace("Bearer ", "") ?? queryToken;

    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const expiredCount = await checkSubscriptionExpiry();
    return NextResponse.json({
      success: true,
      expired: expiredCount,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron SubscriptionExpiry] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao verificar assinaturas" },
      { status: 500 }
    );
  }
}
