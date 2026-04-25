// Limites globais de pagamento configurados em platform_settings.
//
// - transaction_fee_cents: taxa fixa em centavos cobrada pela plataforma
//   em CADA cobrança Pix (compra avulsa, assinatura, live). Soma ao
//   platformFee percentual no computeFees. Usado também como reserva pra
//   cobrir taxa do PSP (Woovi) no Split Pix — manter no mínimo o valor
//   da taxa Pix in da Woovi (geralmente R$ 0,99 + 0,99%).
//
// - min_transaction_cents: valor mínimo (em centavos) que qualquer
//   conteúdo pago, plano de assinatura ou live com cobrança precisa
//   ter pra ser publicado/criado. Conteúdo gratuito (price=0) bypassa
//   esse mínimo.

import { db } from "@/lib/db";

export interface PaymentLimits {
  transactionFeeCents: number;
  minTransactionCents: number;
}

const DEFAULT_TRANSACTION_FEE_CENTS = 190; // R$ 1,90
const DEFAULT_MIN_TRANSACTION_CENTS = 200; // R$ 2,00

export async function getPaymentLimits(): Promise<PaymentLimits> {
  const settings = await db.platformSetting.findMany({
    where: { key: { in: ["transaction_fee_cents", "min_transaction_cents"] } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  const fee = parseInt(map.get("transaction_fee_cents") ?? "", 10);
  const min = parseInt(map.get("min_transaction_cents") ?? "", 10);
  return {
    transactionFeeCents:
      Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_TRANSACTION_FEE_CENTS,
    minTransactionCents:
      Number.isFinite(min) && min >= 0 ? min : DEFAULT_MIN_TRANSACTION_CENTS,
  };
}

export type MinPriceResult =
  | { ok: true }
  | { ok: false; minReais: number; message: string };

/**
 * Valida se um preço (em reais) atende o mínimo da plataforma.
 * Preços iguais a zero (conteúdo gratuito) passam direto.
 */
export async function assertMinTransactionPrice(
  amountReais: number
): Promise<MinPriceResult> {
  if (amountReais <= 0) return { ok: true };
  const limits = await getPaymentLimits();
  const cents = Math.round(amountReais * 100);
  if (cents < limits.minTransactionCents) {
    const minReais = limits.minTransactionCents / 100;
    return {
      ok: false,
      minReais,
      message: `Valor mínimo da plataforma é R$ ${minReais.toFixed(2)}`,
    };
  }
  return { ok: true };
}
