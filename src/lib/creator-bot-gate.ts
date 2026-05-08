// Gate pra criação de bots. Regra (vigente a partir de 2026-05): só
// usuários creator com dados financeiros completos + subconta Woovi
// active podem criar bot. Bots pré-existentes não são afetados — gate
// roda só na criação.

import { db } from "@/lib/db";

export type CreatorBotGate =
  | { ok: true }
  | { ok: false; missing: string[]; message: string };

/**
 * Valida que o User tem CPF, telefone, chave Pix e subconta Woovi
 * active antes de permitir criar bot. Mensagem é amigável pra mostrar
 * direto na UI.
 */
export async function assertCreatorFinancialReady(
  userId: string,
): Promise<CreatorBotGate> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      cpf: true,
      phone: true,
      pixKey: true,
      pixKeyType: true,
      wooviSubAccountStatus: true,
    },
  });
  if (!user) {
    return {
      ok: false,
      missing: [],
      message: "Usuário não encontrado",
    };
  }

  const missing: string[] = [];
  if (!user.cpf) missing.push("CPF");
  if (!user.phone) missing.push("telefone");
  if (!user.pixKey || !user.pixKeyType) missing.push("chave Pix");
  if (user.wooviSubAccountStatus !== "active") {
    missing.push("subconta Woovi (Split Pix)");
  }

  if (missing.length === 0) return { ok: true };

  const list = missing.join(", ");
  return {
    ok: false,
    missing,
    message: `Pra criar um bot, complete primeiro: ${list}. Acesse Configurações para preencher.`,
  };
}
