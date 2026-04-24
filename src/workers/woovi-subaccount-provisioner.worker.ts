// Worker de provisionamento de subcontas Woovi.
//
// Fluxo:
// 1. Lê o User e checa estado atual.
// 2. Se já `active` ou sem pixKey, encerra cedo.
// 3. Marca `pending`, chama createWooviSubAccount. Se der conflito/já
//    existe, confirma via getWooviSubAccount antes de dar por perdido.
// 4. Em sucesso, marca `active` + `provisionedAt`. Em falha, marca
//    `failed` + salva mensagem (user vê no card de pagamento).
//
// Idempotente: pode rodar múltiplas vezes pra mesma pixKey sem efeito
// colateral — se a subconta já existe, é tratado como sucesso.

import { db } from "@/lib/db";
import { createWorker } from "@/lib/queue";
import {
  createWooviSubAccount,
  getWooviSubAccount,
} from "@/lib/woovi-subaccount";

export interface WooviSubAccountProvisionJob {
  userId: string;
}

export const wooviSubAccountProvisionerWorker = createWorker<WooviSubAccountProvisionJob>(
  "woovi-subaccount-provision",
  async (job) => {
    const { userId } = job.data;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        pixKey: true,
        pixKeyType: true,
        wooviSubAccountStatus: true,
      },
    });

    if (!user) {
      console.warn(`[woovi-subaccount] user ${userId} não encontrado`);
      return;
    }

    // Só creator/manager têm subconta de repasse.
    if (user.role !== "creator" && user.role !== "manager") {
      return;
    }

    // Sem pixKey não há o que provisionar.
    if (!user.pixKey) {
      await db.user.update({
        where: { id: userId },
        data: {
          wooviSubAccountStatus: "none",
          wooviSubAccountError: null,
          wooviSubAccountProvisionedAt: null,
        },
      });
      return;
    }

    if (user.wooviSubAccountStatus === "active") {
      return;
    }

    await db.user.update({
      where: { id: userId },
      data: { wooviSubAccountStatus: "pending", wooviSubAccountError: null },
    });

    // Nome enviado à Woovi: usa o nome do usuário. Limite defensivo.
    const subAccountName = (user.name || `user-${user.id.slice(0, 8)}`).slice(0, 100);
    let result = await createWooviSubAccount({
      name: subAccountName,
      pixKey: user.pixKey,
    });

    // Se a criação falhou com HTTP error, pode ser que a subconta já exista
    // (Woovi costuma retornar 4xx em conflito). Tenta confirmar via GET.
    if (!result.ok && result.errorCode === "HTTP_ERROR") {
      const existing = await getWooviSubAccount(user.pixKey);
      if (existing.ok) {
        result = existing;
      }
    }

    if (!result.ok) {
      await db.user.update({
        where: { id: userId },
        data: {
          wooviSubAccountStatus: "failed",
          wooviSubAccountError: `[${result.errorCode}] ${result.message}`.slice(0, 1000),
        },
      });
      // Lança para BullMQ aplicar retry policy (exponential backoff).
      throw new Error(`Woovi subaccount falhou: ${result.errorCode} — ${result.message}`);
    }

    await db.user.update({
      where: { id: userId },
      data: {
        wooviSubAccountStatus: "active",
        wooviSubAccountError: null,
        wooviSubAccountProvisionedAt: new Date(),
      },
    });
  },
  { concurrency: 2 }
);

wooviSubAccountProvisionerWorker.on("failed", (job, err) => {
  console.error(
    `[woovi-subaccount] job ${job?.id} falhou (attempts=${job?.attemptsMade}):`,
    err.message
  );
});
