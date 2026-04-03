import { db } from "@/lib/db";

/**
 * Retorna a assinatura ativa de um usuário do Telegram para um bot específico.
 */
export async function getActiveSubscription(
  botId: string,
  botUserId: string
) {
  return db.subscription.findFirst({
    where: {
      botId,
      botUserId,
      status: "active",
      endDate: { gt: new Date() },
    },
    include: { plan: true },
  });
}

/**
 * Verifica se o usuário tem assinatura ativa em um plano que inclui acesso à live.
 */
export async function hasLiveAccess(
  botId: string,
  botUserId: string
): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: {
      botId,
      botUserId,
      status: "active",
      endDate: { gt: new Date() },
      plan: { includesLiveAccess: true },
    },
  });

  return !!subscription;
}

/**
 * Verifica se o usuário já comprou um conteúdo específico (compra paga).
 * Usado para evitar cobrança duplicada — re-entrega sem cobrar.
 */
export async function getExistingPaidPurchase(
  botId: string,
  botUserId: string,
  contentId: string
) {
  return db.purchase.findFirst({
    where: {
      botId,
      botUserId,
      contentId,
      status: "paid",
    },
  });
}

/**
 * Calcula a data de término baseada no período do plano.
 */
export function calculateEndDate(
  startDate: Date,
  period: "monthly" | "quarterly" | "semiannual" | "annual"
): Date {
  const end = new Date(startDate);
  const monthsMap = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  };
  end.setMonth(end.getMonth() + monthsMap[period]);
  return end;
}
