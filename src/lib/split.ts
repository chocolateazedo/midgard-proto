import { db } from "@/lib/db";

/**
 * Lê a flag `split_enabled` de platform_settings.
 * Split só é realmente aplicado quando provider=woovi (controle duplo);
 * a flag serve pra desligar temporariamente sem trocar provider, útil
 * durante migração ou investigação de bugs.
 */
export async function isSplitEnabled(): Promise<boolean> {
  const [provider, flag] = await Promise.all([
    db.platformSetting.findUnique({ where: { key: "pix_provider" } }),
    db.platformSetting.findUnique({ where: { key: "split_enabled" } }),
  ]);
  if (provider?.value !== "woovi") return false;
  return flag?.value === "true";
}

// Monta o array de splits para enviar à Woovi no momento de criar o charge.
//
// Regras de negócio:
// - O charge é criado com o BRUTO total. Os splits apontam quanto vai pra
//   cada subconta (creator e/ou manager). O que sobra = taxa da plataforma
//   e fica no saldo master da conta Woovi.
// - Só entra no split quem tem subconta active (wooviSubAccountStatus) + pixKey.
//   Se a subconta do creator não está active, o creatorNet fica na plataforma
//   (ela repassa por outro meio fora deste fluxo). Idem manager. Isso evita
//   bloquear a venda por falta de provisionamento.
// - Valores são em centavos inteiros pra evitar erro de arredondamento.
// - Nunca incluímos o platformFee como split — é o residual.

import type { PixSplit } from "@/lib/pix";
import type { FeeBreakdown, CreatorFeeContext } from "@/lib/fees";

export interface SplitBuildResult {
  splits: PixSplit[];
  // Subtotal que efetivamente saiu como split (creator+manager). O restante
  // do charge fica na plataforma (residual = bruto − subtotal).
  splitSubtotalCents: number;
  // Diagnósticos — útil pra auditoria quando creator/manager tinham que
  // estar no split mas a subconta deles não estava active.
  skippedCreator: boolean;
  skippedManager: boolean;
}

/**
 * Constrói o array de splits com base no breakdown de fees e nos dados da
 * subconta do creator/manager.
 *
 * @param amount valor bruto da cobrança (reais, com decimais)
 * @param fees resultado de computeFees()
 * @param creator contexto do creator com pixKey + status da subconta
 */
export function buildWooviSplits(
  amount: number,
  fees: FeeBreakdown,
  creator: CreatorFeeContext
): SplitBuildResult {
  const splits: PixSplit[] = [];
  let splitSubtotalCents = 0;

  const creatorCents = Math.round(fees.creatorNet * 100);
  const managerCents = Math.round(fees.managerFee * 100);
  const totalCents = Math.round(amount * 100);

  const creatorSubActive =
    !!creator.pixKey && creator.wooviSubAccountStatus === "active";
  const managerSubActive =
    !!creator.managedBy?.pixKey &&
    creator.managedBy?.wooviSubAccountStatus === "active";

  const includeCreator = creatorSubActive && creatorCents > 0;
  const includeManager = managerSubActive && managerCents > 0;

  if (includeCreator) {
    splits.push({
      pixKey: creator.pixKey!,
      value: creatorCents,
      splitType: "SPLIT_SUB_ACCOUNT",
    });
    splitSubtotalCents += creatorCents;
  }
  if (includeManager) {
    splits.push({
      pixKey: creator.managedBy!.pixKey!,
      value: managerCents,
      splitType: "SPLIT_SUB_ACCOUNT",
    });
    splitSubtotalCents += managerCents;
  }

  // Defesa: se por bug algum split ficou maior que o total, descarta.
  if (splitSubtotalCents > totalCents) {
    return {
      splits: [],
      splitSubtotalCents: 0,
      skippedCreator: true,
      skippedManager: true,
    };
  }

  return {
    splits,
    splitSubtotalCents,
    skippedCreator: creatorCents > 0 && !includeCreator,
    skippedManager: managerCents > 0 && !includeManager,
  };
}

/**
 * Conveniência para callers: devolve o array de splits pra passar ao
 * createCharge (ou undefined quando split está desligado ou não há
 * destinatários válidos). Também loga quando alguém deveria receber mas
 * ficou fora por subconta não-active — útil pra diagnóstico.
 */
export async function prepareChargeSplits(
  amount: number,
  fees: FeeBreakdown,
  creator: CreatorFeeContext
): Promise<PixSplit[] | undefined> {
  const enabled = await isSplitEnabled();
  if (!enabled) return undefined;
  const result = buildWooviSplits(amount, fees, creator);
  if (result.skippedCreator || result.skippedManager) {
    console.warn(
      `[split] creator=${creator.id} skipped creator=${result.skippedCreator} manager=${result.skippedManager} (subconta não active)`
    );
  }
  return result.splits.length > 0 ? result.splits : undefined;
}
