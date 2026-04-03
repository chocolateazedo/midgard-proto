import { pixConfirmationWorker } from "./pix-confirmation.worker";
import { contentDeliveryWorker } from "./content-delivery.worker";
import { previewGenerationWorker } from "./preview-generation.worker";
import { notificationWorker } from "./notification.worker";
import {
  subscriptionExpiryWorker,
  scheduleExpiryCheck,
} from "./subscription-expiry.worker";

console.log("🚀 Starting BotFlow workers...");
console.log("  ✓ Pix Confirmation Worker");
console.log("  ✓ Content Delivery Worker");
console.log("  ✓ Preview Generation Worker");
console.log("  ✓ Notification Worker");
console.log("  ✓ Subscription Expiry Worker");

// Agendar verificação periódica de expiração de assinaturas
scheduleExpiryCheck().catch((err) => {
  console.error("Erro ao agendar verificação de expiração:", err);
});

const shutdown = async () => {
  console.log("\n🛑 Shutting down workers...");
  await Promise.all([
    pixConfirmationWorker.close(),
    contentDeliveryWorker.close(),
    previewGenerationWorker.close(),
    notificationWorker.close(),
    subscriptionExpiryWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
