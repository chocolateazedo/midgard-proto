import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { purchases, content, bots } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { contentDeliveryQueue } from "@/lib/queue";
import { getPixProvider } from "@/lib/pix";

type PixConfirmationJob = {
  purchaseId: string;
  txid: string;
};

export const pixConfirmationWorker = createWorker<PixConfirmationJob>(
  "pix-confirmation",
  async (job) => {
    const { purchaseId, txid } = job.data;

    const provider = await getPixProvider();
    const status = await provider.getChargeStatus(txid);

    if (status === "paid") {
      const purchase = await db.query.purchases.findFirst({
        where: eq(purchases.id, purchaseId),
      });

      if (!purchase || purchase.status === "paid") return;

      await db
        .update(purchases)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(purchases.id, purchaseId));

      await db
        .update(content)
        .set({
          purchaseCount: sql`${content.purchaseCount} + 1`,
          totalRevenue: sql`${content.totalRevenue} + ${purchase.amount}`,
        })
        .where(eq(content.id, purchase.contentId));

      await db
        .update(bots)
        .set({
          totalRevenue: sql`${bots.totalRevenue} + ${purchase.amount}`,
        })
        .where(eq(bots.id, purchase.botId));

      await contentDeliveryQueue.add("deliver", {
        purchaseId,
        contentId: purchase.contentId,
        botId: purchase.botId,
        botUserId: purchase.botUserId,
      });
    } else if (status === "expired") {
      await db
        .update(purchases)
        .set({ status: "expired" })
        .where(eq(purchases.id, purchaseId));
    }
  }
);
