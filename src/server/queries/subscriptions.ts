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
 * Calcula a data de término somando N dias ao início. Substitui o mapa
 * de meses antigo — agora qualquer duração é expressável em dias.
 */
export function calculateEndDate(startDate: Date, days: number): Date {
  return new Date(startDate.getTime() + days * 86400_000);
}
