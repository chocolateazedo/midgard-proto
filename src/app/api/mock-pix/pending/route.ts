import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

/**
 * GET /api/mock-pix/pending
 * Lista pagamentos pendentes (mock) para simulação.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      );
    }

    const providerSetting = await db.platformSetting.findUnique({
      where: { key: "pix_provider" },
    });

    if (providerSetting?.value !== "mock") {
      return NextResponse.json(
        { success: false, error: "Disponível apenas com provedor Mock" },
        { status: 403 }
      );
    }

    const purchases = await db.purchase.findMany({
      where: {
        status: "pending",
        pixTxid: { startsWith: "mock_" },
      },
      include: {
        content: { select: { title: true, type: true } },
        botUser: { select: { telegramFirstName: true, telegramUsername: true } },
        bot: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const subscriptions = await db.subscription.findMany({
      where: {
        pixTxid: { startsWith: "mock_" },
        endDate: null,
      },
      include: {
        plan: { select: { name: true, period: true } },
        botUser: { select: { telegramFirstName: true, telegramUsername: true } },
        bot: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const pending = [
      ...purchases.map((p) => ({
        txid: p.pixTxid,
        type: "purchase" as const,
        amount: p.amount.toNumber(),
        description: p.content?.title ?? "Acesso à Live",
        contentType: p.content?.type ?? "live",
        botName: p.bot.name,
        userName: p.botUser.telegramFirstName ?? p.botUser.telegramUsername ?? "—",
        createdAt: p.createdAt.toISOString(),
      })),
      ...subscriptions.map((s) => ({
        txid: s.pixTxid,
        type: "subscription" as const,
        amount: s.amount.toNumber(),
        description: s.plan.name,
        contentType: null,
        botName: s.bot.name,
        userName: s.botUser.telegramFirstName ?? s.botUser.telegramUsername ?? "—",
        createdAt: s.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: pending });
  } catch (error) {
    console.error("[Mock Pix Pending] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}
