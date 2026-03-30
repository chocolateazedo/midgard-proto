import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
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
      const purchase = await db.purchase.findFirst({
        where: { id: purchaseId },
      });

      if (!purchase || purchase.status === "paid") return;

      await db.purchase.update({
        where: { id: purchaseId },
        data: { status: "paid", paidAt: new Date() },
      });

      await db.content.update({
        where: { id: purchase.contentId },
        data: {
          purchaseCount: { increment: 1 },
          totalRevenue: { increment: parseFloat(purchase.amount.toString()) },
        },
      });

      await db.bot.update({
        where: { id: purchase.botId },
        data: {
          totalRevenue: { increment: parseFloat(purchase.amount.toString()) },
        },
      });

      await contentDeliveryQueue.add("deliver", {
        purchaseId,
        contentId: purchase.contentId,
        botId: purchase.botId,
        botUserId: purchase.botUserId,
      });
    } else if (status === "expired") {
      await db.purchase.update({
        where: { id: purchaseId },
        data: { status: "expired" },
      });
    }
  }
);
