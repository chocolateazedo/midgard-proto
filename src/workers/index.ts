import { pixConfirmationWorker } from "./pix-confirmation.worker";
import { contentDeliveryWorker } from "./content-delivery.worker";
import { previewGenerationWorker } from "./preview-generation.worker";
import { notificationWorker } from "./notification.worker";
import {
  subscriptionExpiryWorker,
  scheduleExpiryCheck,
} from "./subscription-expiry.worker";
import { ivsCostFinalizeWorker } from "./ivs-cost-finalize.worker";
import {
  liveScheduleEnforcerWorker,
  scheduleEnforcerCheck,
} from "./live-schedule-enforcer.worker";
import {
  contentScheduleEnforcerWorker,
  scheduleContentEnforcerCheck,
} from "./content-schedule-enforcer.worker";
import {
  startBotProvisionerWorker,
  stopBotProvisionerWorker,
} from "./bot-provisioner.worker";

console.log("🚀 Starting BotFans workers...");
console.log("  ✓ Pix Confirmation Worker");
console.log("  ✓ Content Delivery Worker");
console.log("  ✓ Preview Generation Worker");
console.log("  ✓ Notification Worker");
console.log("  ✓ Subscription Expiry Worker");
console.log("  ✓ IVS Cost Finalize Worker");
console.log("  ✓ Live Schedule Enforcer Worker");
console.log("  ✓ Content Schedule Enforcer Worker");
console.log("  ✓ Bot Provisioner Worker (single-leader)");

// Agendar verificação periódica de expiração de assinaturas
scheduleExpiryCheck().catch((err) => {
  console.error("Erro ao agendar verificação de expiração:", err);
});

// Agendar tick periódico do enforcer de live schedules
scheduleEnforcerCheck().catch((err) => {
  console.error("Erro ao agendar live schedule enforcer:", err);
});

// Agendar tick periódico do enforcer de publicação de conteúdo
scheduleContentEnforcerCheck().catch((err) => {
  console.error("Erro ao agendar content schedule enforcer:", err);
});

// Ativa o bot-provisioner (tenta virar leader via Redis). Se perder, fica noop.
startBotProvisionerWorker().catch((err) => {
  console.error("Erro ao iniciar bot-provisioner worker:", err);
});

const shutdown = async () => {
  console.log("\n🛑 Shutting down workers...");
  await Promise.all([
    pixConfirmationWorker.close(),
    contentDeliveryWorker.close(),
    previewGenerationWorker.close(),
    notificationWorker.close(),
    subscriptionExpiryWorker.close(),
    ivsCostFinalizeWorker.close(),
    liveScheduleEnforcerWorker.close(),
    contentScheduleEnforcerWorker.close(),
    stopBotProvisionerWorker(),
  ]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
