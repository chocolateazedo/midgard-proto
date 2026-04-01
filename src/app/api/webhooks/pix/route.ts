import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContentDeliveryQueue } from "@/lib/queue";

interface PixEntry {
  txid?: string;
  endToEndId?: string;
  valor?: string;
}

interface PixWebhookBody {
  pix?: PixEntry[];
  [key: string]: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: PixWebhookBody = await request.json();

    const pixEntries = body.pix;
    if (!pixEntries || !Array.isArray(pixEntries) || pixEntries.length === 0) {
      return NextResponse.json({ success: true });
    }

    for (const pix of pixEntries) {
      const txid = pix.txid || pix.endToEndId;
      if (!txid) continue;

      // Find the purchase by txid
      const purchase = await db.purchase.findFirst({
        where: { pixTxid: txid },
      });

      if (!purchase) {
        console.warn(`[Pix Webhook] Purchase not found for txid: ${txid}`);
        continue;
      }

      if (purchase.status !== "pending") {
        // Already processed
        continue;
      }

      const now = new Date();

      // Update purchase to paid
      await db.purchase.update({
        where: { id: purchase.id },
        data: { status: "paid", paidAt: now },
      });

      // Update content counters
      await db.content.update({
        where: { id: purchase.contentId },
        data: {
          purchaseCount: { increment: 1 },
          totalRevenue: { increment: purchase.amount },
        },
      });

      // Update bot total revenue
      await db.bot.update({
        where: { id: purchase.botId },
        data: {
          totalRevenue: { increment: purchase.amount },
        },
      });

      // Enqueue content delivery job
      await getContentDeliveryQueue().add("deliver", {
        purchaseId: purchase.id,
        contentId: purchase.contentId,
        botId: purchase.botId,
        botUserId: purchase.botUserId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Pix Webhook] Error:", error);
    // Return 200 to prevent PSP retries from flooding logs
    return NextResponse.json({ success: true });
  }
}
