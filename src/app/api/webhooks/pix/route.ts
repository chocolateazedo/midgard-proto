import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContentDeliveryQueue } from "@/lib/queue";
import { getPixProvider } from "@/lib/pix";

// EFÍ Pay / generic PSP format
interface PixEntry {
  txid?: string;
  endToEndId?: string;
  valor?: string;
}

interface EfiPayWebhookBody {
  pix?: PixEntry[];
  [key: string]: unknown;
}

// Woovi/OpenPix format
interface WooviWebhookBody {
  event?: string;
  charge?: {
    correlationID?: string;
    status?: string;
    [key: string]: unknown;
  };
  pix?: {
    txid?: string;
    endToEndId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function processPayment(txid: string): Promise<void> {
  const purchase = await db.purchase.findFirst({
    where: { pixTxid: txid },
  });

  if (!purchase) {
    console.warn(`[Pix Webhook] Purchase not found for txid: ${txid}`);
    return;
  }

  if (purchase.status !== "pending") {
    return; // Already processed
  }

  const now = new Date();

  await db.purchase.update({
    where: { id: purchase.id },
    data: { status: "paid", paidAt: now },
  });

  await db.content.update({
    where: { id: purchase.contentId },
    data: {
      purchaseCount: { increment: 1 },
      totalRevenue: { increment: purchase.amount },
    },
  });

  await db.bot.update({
    where: { id: purchase.botId },
    data: {
      totalRevenue: { increment: purchase.amount },
    },
  });

  await getContentDeliveryQueue().add("deliver", {
    purchaseId: purchase.id,
    contentId: purchase.contentId,
    botId: purchase.botId,
    botUserId: purchase.botUserId,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Detect Woovi/OpenPix webhook format (has "event" field)
    if (body.event && typeof body.event === "string" && body.event.startsWith("OPENPIX:")) {
      // Verify signature using the provider
      const signature = request.headers.get("x-webhook-signature") ?? "";
      const provider = await getPixProvider();
      if (!provider.verifyWebhook(body, signature)) {
        console.warn("[Pix Webhook] Invalid Woovi webhook signature");
        return NextResponse.json({ success: true });
      }

      // Only process CHARGE_COMPLETED events
      if (body.event === "OPENPIX:CHARGE_COMPLETED") {
        const wooviBody = body as WooviWebhookBody;
        const txid = wooviBody.charge?.correlationID;
        if (txid) {
          await processPayment(txid);
        }
      }

      return NextResponse.json({ success: true });
    }

    // EFÍ Pay / generic PSP format (has "pix" array)
    const efiBody = body as EfiPayWebhookBody;
    const pixEntries = efiBody.pix;
    if (pixEntries && Array.isArray(pixEntries)) {
      for (const pix of pixEntries) {
        const txid = pix.txid || pix.endToEndId;
        if (txid) {
          await processPayment(txid);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Pix Webhook] Error:", error);
    // Return 200 to prevent PSP retries from flooding logs
    return NextResponse.json({ success: true });
  }
}
