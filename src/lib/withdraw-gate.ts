// Guarda para trocas da chave Pix: impede que o usuário (ou admin) altere
// os dados bancários enquanto houver saldo na subconta Woovi. Única via
// de destrancar é solicitar o saque total em /dashboard/financeiro.

import { db } from "@/lib/db";
import { getWooviSubAccountBalance } from "@/lib/woovi-subaccount";

export type GateResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Retorna ok=false quando:
 * - subconta está active
 * - E existe pixKey atual
 * - E saldo na Woovi é > 0
 *
 * Em caso de erro de comunicação com a Woovi, retorna ok=false também —
 * é preferível bloquear a permitir possível perda de saldo.
 */
export async function ensureNoBlockingBalance(userId: string): Promise<GateResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      pixKey: true,
      wooviSubAccountStatus: true,
    },
  });
  if (!user) return { ok: true }; // user já nem existe — deixa o caller tratar
  if (user.wooviSubAccountStatus !== "active" || !user.pixKey) {
    return { ok: true };
  }

  const bal = await getWooviSubAccountBalance(user.pixKey);
  if (!bal.ok) {
    return {
      ok: false,
      message:
        "Não foi possível verificar seu saldo agora. Tente novamente em instantes ou solicite um saque para destravar a alteração.",
    };
  }
  if (bal.data.balanceCents > 0) {
    return {
      ok: false,
      message:
        "Há saldo vinculado à chave Pix atual. Solicite o saque total em Financeiro antes de alterar os dados bancários.",
    };
  }
  return { ok: true };
}
