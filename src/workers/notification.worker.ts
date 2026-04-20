import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";
import { formatDuration } from "@/lib/subscription";

type SubscriptionConfirmedJob = {
  subscriptionId: string;
  botId: string;
  botUserId: string;
};

type LiveNotificationKind = "T-10" | "T-5" | "T-1" | "T-0";

type LiveNotificationJob = {
  botId: string;
  token: string;
  title: string;
  scheduleId?: string;
  kind?: LiveNotificationKind;
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
    `⏰ Período: ${formatDuration(subscription.plan.durationDays)}\n` +
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

  const watchLink = `${liveStream.streamLink}?token=${botUserId}`;

  await botManager.sendMessage(
    token,
    chatId,
    `✅ *Pagamento confirmado!*\n\n` +
      `🔴 *${liveStream.title ?? "AO VIVO"}*\n\n` +
      `🔗 Acesse: ${watchLink}`,
    { parse_mode: "Markdown" }
  );
}

function buildLiveMessage(
  kind: LiveNotificationKind,
  title: string,
  watchLink: string | null
): string {
  switch (kind) {
    case "T-10":
      return (
        `⏰ *Sua live começa em 10 minutos!*\n\n` +
        `🔴 ${title}\n\n` +
        `Fique ligado(a) — aviso de novo em 5 min.`
      );
    case "T-5":
      return (
        `⏰ *Faltam 5 minutos!*\n\n` +
        `🔴 ${title}\n\n` +
        `Se prepara, começa logo.`
      );
    case "T-1":
      return (
        `⏰ *1 minuto pra começar!*\n\n` +
        `🔴 ${title}\n\n` +
        `Daqui a pouco te mando o link por aqui.`
      );
    case "T-0":
    default:
      return (
        `🔴 *AO VIVO AGORA!*\n\n` +
        `${title}\n\n` +
        (watchLink ? `🔗 Acesse: ${watchLink}` : `Use /live para acessar a transmissão.`)
      );
  }
}

async function handleLiveNotification(data: LiveNotificationJob) {
  const { botId, token, title, scheduleId, kind = "T-0" } = data;

  // Se o schedule foi cancelado/missed/ended, não envia mais notificações.
  // Permite cancelLiveSchedule sem ter que remover jobs individualmente.
  if (scheduleId) {
    const schedule = await db.liveSchedule.findUnique({
      where: { id: scheduleId },
      select: { status: true },
    });
    if (!schedule) return;
    if (
      schedule.status === "cancelled" ||
      schedule.status === "ended" ||
      schedule.status === "missed"
    ) {
      return;
    }
  }

  // T-0 carrega o link. T-10/T-5/T-1 são só teaser (sem link) porque ainda
  // não tem transmissão ativa.
  let streamLinkBase: string | null = null;
  if (kind === "T-0") {
    const liveStream = await db.liveStream.findUnique({
      where: { botId },
      select: { streamLink: true },
    });
    streamLinkBase = liveStream?.streamLink ?? null;
  }

  const botUsers = await db.botUser.findMany({
    where: { botId },
    select: { id: true, telegramUserId: true },
  });

  for (let i = 0; i < botUsers.length; i++) {
    try {
      const user = botUsers[i];
      const chatId = Number(user.telegramUserId);
      const personalLink = streamLinkBase
        ? `${streamLinkBase}?token=${user.id}`
        : null;
      const message = buildLiveMessage(kind, title, personalLink);
      await botManager.sendMessage(token, chatId, message, {
        parse_mode: "Markdown",
      });
      // ~20 msgs/seg (limite Telegram é 30)
      if (i < botUsers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (e) {
      console.warn(`[LiveNotification] Erro ao notificar usuário:`, e);
    }
  }
}
