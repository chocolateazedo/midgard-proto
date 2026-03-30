import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchases, content, bots } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { contentDeliveryQueue } from "@/lib/queue";

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
      const purchase = await db.query.purchases.findFirst({
        where: eq(purchases.pixTxid, txid),
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
      await db
        .update(purchases)
        .set({ status: "paid", paidAt: now })
        .where(eq(purchases.id, purchase.id));

      // Update content counters
      await db
        .update(content)
        .set({
          purchaseCount: sql`${content.purchaseCount} + 1`,
          totalRevenue: sql`${content.totalRevenue} + ${purchase.amount}`,
        })
        .where(eq(content.id, purchase.contentId));

      // Update bot total revenue
      await db
        .update(bots)
        .set({
          totalRevenue: sql`${bots.totalRevenue} + ${purchase.amount}`,
        })
        .where(eq(bots.id, purchase.botId));

      // Enqueue content delivery job
      await contentDeliveryQueue.add("deliver", {
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
