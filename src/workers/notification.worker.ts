import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";

type SubscriptionConfirmedJob = {
  subscriptionId: string;
  botId: string;
  botUserId: string;
};

type LiveNotificationJob = {
  botId: string;
  token: string;
  title: string;
};

type LiveAccessGrantedJob = {
  botId: string;
  botUserId: string;
};

type NotificationJob = SubscriptionConfirmedJob | LiveNotificationJob | LiveAccessGrantedJob;

export const notificationWorker = createWorker<NotificationJob>(
  "notifications",
  async (job) => {
    if (job.name === "subscription-confirmed") {
      await handleSubscriptionConfirmed(job.data as SubscriptionConfirmedJob);
    } else if (job.name === "live-notification") {
      await handleLiveNotification(job.data as LiveNotificationJob);
    } else if (job.name === "live-access-granted") {
      await handleLiveAccessGranted(job.data as LiveAccessGrantedJob);
    }
  }
);

async function handleSubscriptionConfirmed(data: SubscriptionConfirmedJob) {
  const { subscriptionId, botId, botUserId } = data;

  const subscription = await db.subscription.findFirst({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!subscription) throw new Error(`Assinatura ${subscriptionId} não encontrada`);

  const bot = await db.bot.findFirst({ where: { id: botId } });
  if (!bot) throw new Error(`Bot ${botId} não encontrado`);

  const botUser = await db.botUser.findFirst({ where: { id: botUserId } });
  if (!botUser) throw new Error(`Usuário ${botUserId} não encontrado`);

  const token = decrypt(bot.telegramToken);
  const chatId = Number(botUser.telegramUserId);

  const periodLabels: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };

  const endDateStr = subscription.endDate
    ? subscription.endDate.toLocaleDateString("pt-BR")
    : "—";

  const benefits = (subscription.plan.benefits as string[]) ?? [];
  const benefitsText = benefits.length > 0
    ? benefits.map((b) => `  • ${b}`).join("\n")
    : "  • Acesso ao conteúdo do plano";

  const message =
    `✅ *Assinatura ativada!*\n\n` +
    `📋 Plano: *${subscription.plan.name}*\n` +
    `⏰ Período: ${periodLabels[subscription.plan.period] ?? subscription.plan.period}\n` +
    `📅 Válido até: *${endDateStr}*\n\n` +
    `Benefícios:\n${benefitsText}\n\n` +
    `Aproveite! Use /catalogo para ver os conteúdos disponíveis.`;

  await botManager.sendMessage(token, chatId, message, {
    parse_mode: "Markdown",
  });
}

async function handleLiveAccessGranted(data: LiveAccessGrantedJob) {
  const { botId, botUserId } = data;

  const bot = await db.bot.findFirst({ where: { id: botId } });
  if (!bot) throw new Error(`Bot ${botId} não encontrado`);

  const botUser = await db.botUser.findFirst({ where: { id: botUserId } });
  if (!botUser) throw new Error(`Usuário ${botUserId} não encontrado`);

  const liveStream = await db.liveStream.findUnique({ where: { botId } });
  if (!liveStream || !liveStream.isLive || !liveStream.streamLink) {
    return; // Live encerrada ou sem link
  }

  const token = decrypt(bot.telegramToken);
  const chatId = Number(botUser.telegramUserId);

  await botManager.sendMessage(
    token,
    chatId,
    `✅ *Pagamento confirmado!*\n\n` +
      `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
      `🔗 Acesse: ${liveStream.streamLink}`,
    { parse_mode: "Markdown" }
  );
}

async function handleLiveNotification(data: LiveNotificationJob) {
  const { botId, token, title } = data;

  // Buscar todos os usuários do bot
  const botUsers = await db.botUser.findMany({
    where: { botId },
    select: { telegramUserId: true },
  });

  const message =
    `🔴 *AO VIVO AGORA!*\n\n` +
    `${title}\n\n` +
    `Use /live para acessar a transmissão.`;

  // Enviar com delay para respeitar rate limits do Telegram (30 msgs/segundo)
  for (let i = 0; i < botUsers.length; i++) {
    try {
      const chatId = Number(botUsers[i].telegramUserId);
      await botManager.sendMessage(token, chatId, message, {
        parse_mode: "Markdown",
      });

      // Delay de 50ms entre mensagens (~20 msgs/seg, margem segura)
      if (i < botUsers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (e) {
      // Usuário pode ter bloqueado o bot — seguir em frente
      console.warn(`[LiveNotification] Erro ao notificar usuário:`, e);
    }
  }
}
