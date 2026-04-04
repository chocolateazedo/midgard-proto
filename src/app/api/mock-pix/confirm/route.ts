import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scheduleContentDelivery, scheduleLiveAccessGranted, scheduleSubscriptionConfirmed } from "@/lib/inline-jobs";
import { calculateEndDate } from "@/server/queries/subscriptions";
export const dynamic = "force-dynamic";

/**
 * POST /api/mock-pix/confirm
 * Simula a confirmação de pagamento Pix para o provedor Mock.
 * Requer autenticação (owner/admin/creator).
 * Body: { txid: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Verificar se o provedor atual é mock
    const providerSetting = await db.platformSetting.findUnique({
      where: { key: "pix_provider" },
    });

    if (providerSetting?.value !== "mock") {
      return NextResponse.json(
        { success: false, error: "Endpoint disponível apenas com provedor Mock" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { txid } = body as { txid?: string };

    if (!txid) {
      return NextResponse.json(
        { success: false, error: "txid é obrigatório" },
        { status: 400 }
      );
    }

    // 1. Tentar encontrar uma compra (Purchase) com este txid
    const purchase = await db.purchase.findFirst({
      where: { pixTxid: txid },
    });

    if (purchase) {
      if (purchase.status !== "pending") {
        return NextResponse.json({
          success: true,
          data: { type: "purchase", status: purchase.status, message: "Pagamento já processado" },
        });
      }

      const now = new Date();

      await db.purchase.update({
        where: { id: purchase.id },
        data: { status: "paid", paidAt: now },
      });

      const isLivePurchase = purchase.contentId === null;

      if (!isLivePurchase && purchase.contentId) {
        await db.content.update({
          where: { id: purchase.contentId },
          data: {
            purchaseCount: { increment: 1 },
            totalRevenue: { increment: purchase.amount },
          },
        });

        await db.bot.update({
          where: { id: purchase.botId },
          data: { totalRevenue: { increment: purchase.amount } },
        });

        scheduleContentDelivery({
          purchaseId: purchase.id,
          contentId: purchase.contentId,
          botId: purchase.botId,
          botUserId: purchase.botUserId,
        });
      } else {
        await db.bot.update({
          where: { id: purchase.botId },
          data: { totalRevenue: { increment: purchase.amount } },
        });

        scheduleLiveAccessGranted({
          botId: purchase.botId,
          botUserId: purchase.botUserId,
        });
      }

      return NextResponse.json({
        success: true,
        data: { type: "purchase", status: "paid", message: "Pagamento confirmado (mock)" },
      });
    }

    // 2. Tentar encontrar uma assinatura (Subscription) com este txid
    const subscription = await db.subscription.findFirst({
      where: { pixTxid: txid },
      include: { plan: true },
    });

    if (subscription) {
      if (subscription.endDate) {
        return NextResponse.json({
          success: true,
          data: { type: "subscription", status: subscription.status, message: "Assinatura já ativada" },
        });
      }

      const now = new Date();
      const endDate = calculateEndDate(now, subscription.plan.period);

      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "active",
          paidAt: now,
          startDate: now,
          endDate,
        },
      });

      await db.bot.update({
        where: { id: subscription.botId },
        data: { totalRevenue: { increment: subscription.amount } },
      });

      scheduleSubscriptionConfirmed({
        subscriptionId: subscription.id,
        botId: subscription.botId,
        botUserId: subscription.botUserId,
      });

      return NextResponse.json({
        success: true,
        data: { type: "subscription", status: "active", message: "Assinatura ativada (mock)" },
      });
    }

    return NextResponse.json(
      { success: false, error: `Nenhuma compra ou assinatura encontrada para txid: ${txid}` },
      { status: 404 }
    );
  } catch (error) {
    console.error("[Mock Pix Confirm] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}
