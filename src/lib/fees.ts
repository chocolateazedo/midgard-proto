import { db } from "@/lib/db";

export type FeeBreakdown = {
  platformFee: number;
  managerFee: number;
  creatorNet: number;
  managerUserId: string | null;
};

export type CreatorFeeContext = {
  id: string;
  platformFeePercent: unknown;
  managerFeePercent: unknown;
  managedByUserId: string | null;
  pixKey: string | null;
  wooviSubAccountStatus: "none" | "pending" | "active" | "failed";
  managedBy: {
    id: string;
    platformFeePercent: unknown;
    pixKey: string | null;
    wooviSubAccountStatus: "none" | "pending" | "active" | "failed";
  } | null;
};

function toNumber(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }
  if (typeof v === "object" && "toNumber" in (v as object)) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return fallback;
}

/**
 * Calcula a distribuição de fees baseado no creator (e seu manager se houver).
 * - Standalone: platformFee = bruto × creator.platformFeePercent + transactionFee,
 *               creatorNet = bruto − platformFee.
 * - Managed:    platformFee = bruto × manager.platformFeePercent + transactionFee,
 *               managerFee  = bruto × creator.managerFeePercent,
 *               creatorNet  = bruto − platformFee − managerFee.
 *
 * `transactionFeeCents` é a taxa fixa global da plataforma (cobre custo do PSP
 * + lucro fixo). Soma ao platformFee independente do percentual.
 *
 * Valores arredondados a 2 casas. Se a soma extrapolar o bruto, trunca
 * managerFee primeiro, depois platformFee — protege charges baixos.
 */
export function computeFees(
  amount: number,
  creator: CreatorFeeContext,
  transactionFeeCents: number = 0
): FeeBreakdown {
  if (amount <= 0) {
    return { platformFee: 0, managerFee: 0, creatorNet: 0, managerUserId: null };
  }

  const managed = creator.managedByUserId && creator.managedBy;

  const platformPercent = managed
    ? toNumber(creator.managedBy!.platformFeePercent, 10)
    : toNumber(creator.platformFeePercent, 10);

  const managerPercent = managed
    ? toNumber(creator.managerFeePercent, 0)
    : 0;

  const platformPercentFee = round2((amount * platformPercent) / 100);
  const transactionFee = round2(transactionFeeCents / 100);
  let platformFee = round2(platformPercentFee + transactionFee);
  let managerFee = round2((amount * managerPercent) / 100);

  // Garante que platformFee + managerFee <= amount (charges baixos).
  if (platformFee > amount) {
    platformFee = amount;
    managerFee = 0;
  } else if (platformFee + managerFee > amount) {
    managerFee = round2(amount - platformFee);
  }
  const creatorNet = round2(amount - platformFee - managerFee);

  return {
    platformFee,
    managerFee,
    creatorNet,
    managerUserId: managed ? creator.managedBy!.id : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Busca o creator + manager context necessário pra computeFees().
 * Retorna null se o creator não existe.
 */
export async function loadCreatorFeeContext(
  creatorUserId: string
): Promise<CreatorFeeContext | null> {
  const creator = await db.user.findUnique({
    where: { id: creatorUserId },
    select: {
      id: true,
      platformFeePercent: true,
      managerFeePercent: true,
      managedByUserId: true,
      pixKey: true,
      wooviSubAccountStatus: true,
      managedBy: {
        select: {
          id: true,
          platformFeePercent: true,
          pixKey: true,
          wooviSubAccountStatus: true,
        },
      },
    },
  });
  if (!creator) return null;
  return creator as CreatorFeeContext;
}
