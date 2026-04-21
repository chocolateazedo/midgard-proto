import { createWorker } from "@/lib/queue";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";

type ExpiryCheckJob = Record<string, never>;

// Remove do canal + DM de aviso, pra cada subscription que acabou de expirar.
// Falhas no Telegram não re-abrem a subscription — só logamos; o worker
// channel-membership-reconciler (tick 30min) depois re-tenta quem ficou pra trás.
async function removeFromChannelAndNotify(subscriptionId: string): Promise<void> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      bot: {
        select: {
          telegramToken: true,
          channelId: true,
          channelTitle: true,
        },
      },
      botUser: { select: { telegramUserId: true } },
      plan: { select: { name: true } },
    },
  });
  if (!sub) return;

  const token = decrypt(sub.bot.telegramToken);
  const telegramUserId = BigInt(sub.botUser.telegramUserId);

  // 1) Remove do canal se bot tem canal e user estava dentro
  if (
    sub.bot.channelId &&
    sub.channelJoinedAt &&
    !sub.channelRemovedAt
  ) {
    try {
      await botManager.removeFromChannel(
        token,
        sub.bot.channelId,
        telegramUserId
      );
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          channelRemovedAt: new Date(),
          channelRemovalReason: "expired",
        },
      });
    } catch (err) {
      console.error(
        `[SubscriptionExpiry] Falha ao remover user ${telegramUserId} do canal ${sub.bot.channelId}:`,
        err
      );
    }
  }

  // 2) DM de aviso (independente de ter canal — assinante precisa saber)
  try {
    const message =
      `⌛ *Sua assinatura expirou*\n\n` +
      `Plano: ${sub.plan.name}\n\n` +
      (sub.bot.channelId
        ? `Você foi removido do canal. Renove pra voltar a ter acesso.`
        : `Renove pra voltar a ter acesso aos conteúdos.`);

    await botManager.sendMessage(
      token,
      Number(sub.botUser.telegramUserId),
      message,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Planos de Acesso", callback_data: "cmd_planos" }],
          ],
        },
      }
    );
  } catch (err) {
    console.error(
      `[SubscriptionExpiry] Falha ao enviar DM pra ${telegramUserId}:`,
      err
    );
  }
}

export const subscriptionExpiryWorker = createWorker<ExpiryCheckJob>(
  "subscription-expiry",
  async () => {
    const now = new Date();

    // Buscar assinaturas ativas que já expiraram
    const expired = await db.subscription.findMany({
      where: {
        status: "active",
        endDate: { lt: now },
      },
      select: { id: true },
    });

    if (expired.length === 0) return;

    // Atualizar em lote
    await db.subscription.updateMany({
      where: {
        id: { in: expired.map((s) => s.id) },
      },
      data: { status: "expired" },
    });

    console.log(
      `[SubscriptionExpiry] ${expired.length} assinatura(s) expirada(s)`
    );

    // Pra cada uma, tenta remover do canal + notificar. Processamento serial
    // evita floodar @BotFather com chamadas em paralelo.
    for (const { id } of expired) {
      await removeFromChannelAndNotify(id);
    }
  }
);

/**
 * Agenda o job repetitivo de verificação de expiração.
 * Deve ser chamado uma vez no startup dos workers.
 */
export async function scheduleExpiryCheck() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");

  const queue = new Queue("subscription-expiry", {
    connection: getRedisConnection(),
  });

  // Remover jobs repetitivos antigos antes de adicionar novos
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Verificar a cada 1 hora
  await queue.add(
    "check-expiry",
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  console.log("  ✓ Verificação de expiração de assinaturas agendada (1h)");
}
