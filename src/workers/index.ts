import { pixConfirmationWorker } from "./pix-confirmation.worker";
import { contentDeliveryWorker } from "./content-delivery.worker";
import { previewGenerationWorker } from "./preview-generation.worker";

console.log("🚀 Starting BotFlow workers...");
console.log("  ✓ Pix Confirmation Worker");
console.log("  ✓ Content Delivery Worker");
console.log("  ✓ Preview Generation Worker");

const shutdown = async () => {
  console.log("\n🛑 Shutting down workers...");
  await Promise.all([
    pixConfirmationWorker.close(),
    contentDeliveryWorker.close(),
    previewGenerationWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
