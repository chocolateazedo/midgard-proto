import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduleContentDelivery, scheduleLiveAccessGranted, scheduleSubscriptionConfirmed } from "@/lib/inline-jobs";
import { getPixProvider } from "@/lib/pix";
import { calculateEndDate } from "@/server/queries/subscriptions";

// EFÍ Pay / generic PSP format
interface PixEntry {
  txid?: string;
  endToEndId?: string;
  valor?: string;
}

interface EfiPayWebhookBody {
  pix?: PixEntry[];
  [key: string]: unknown;
}

// Woovi/OpenPix format
interface WooviWebhookBody {
  event?: string;
  charge?: {
    correlationID?: string;
    status?: string;
    [key: string]: unknown;
  };
  pix?: {
    txid?: string;
    endToEndId?: string;
    [key: string]: unknown;
  };
  // Eventos de saque da subconta (MOVEMENT_CONFIRMED / MOVEMENT_FAILED)
  payment?: {
    correlationID?: string;
    status?: string;
    value?: number;
    [key: string]: unknown;
  };
  transaction?: {
    value?: number;
    endToEndId?: string;
    time?: string;
    providerRejectedReason?: string;
    providerErrorCode?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Localiza o WithdrawLog correspondente a um evento OPENPIX:MOVEMENT_*.
 * A Woovi gera um correlationID novo no movement (diferente do que
 * mandamos no POST /withdraw), então o lookup direto por correlationId
 * costuma falhar. Fallback: pixKey + amountCents + status pending mais
 * recente — bata o saque que o user acabou de pedir.
 */
async function findWithdrawLogForMovement(body: WooviWebhookBody) {
  const corr = body.payment?.correlationID;
  if (corr) {
    const byCorr = await db.withdrawLog.findUnique({
      where: { correlationId: corr },
    });
    if (byCorr) return byCorr;
  }

  // value vem em centavos. Buscamos em payment, depois transaction.
  const value =
    typeof body.payment?.value === "number"
      ? body.payment.value
      : typeof body.transaction?.value === "number"
        ? body.transaction.value
        : null;
  if (value === null) return null;

  // pixKey do recebedor: a Woovi pode chamar de destinationAlias,
  // pixKey ou aparecer dentro de transaction. Aceita várias formas.
  const tx = body.transaction as Record<string, unknown> | undefined;
  const pixKey =
    typeof tx?.destinationAlias === "string"
      ? (tx.destinationAlias as string)
      : typeof tx?.pixKey === "string"
        ? (tx.pixKey as string)
        : null;

  return db.withdrawLog.findFirst({
    where: {
      status: "pending",
      amountCents: value,
      ...(pixKey ? { pixKey } : {}),
    },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * Marca um WithdrawLog como concluído após confirmação da Woovi via
 * webhook OPENPIX:MOVEMENT_CONFIRMED. Idempotente.
 */
async function processMovementConfirmed(body: WooviWebhookBody): Promise<void> {
  const log = await findWithdrawLogForMovement(body);
  if (!log) {
    console.warn(
      `[Pix Webhook] MOVEMENT_CONFIRMED sem WithdrawLog local — body: ${JSON.stringify(body).slice(0, 600)}`
    );
    return;
  }
  if (log.status === "succeeded") return;
  await db.withdrawLog.update({
    where: { id: log.id },
    data: {
      status: "succeeded",
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
}

/**
 * Marca um WithdrawLog como falho após rejeição da Woovi via webhook
 * OPENPIX:MOVEMENT_FAILED. Guarda providerErrorCode + providerRejectedReason
 * pra exibir ao usuário no card de saques.
 */
async function processMovementFailed(body: WooviWebhookBody): Promise<void> {
  const log = await findWithdrawLogForMovement(body);
  if (!log) {
    console.warn(
      `[Pix Webhook] MOVEMENT_FAILED sem WithdrawLog local — body: ${JSON.stringify(body).slice(0, 600)}`
    );
    return;
  }
  if (log.status !== "pending") return; // já resolvido

  const code = body.transaction?.providerErrorCode ?? null;
  const reason = body.transaction?.providerRejectedReason ?? null;
  const message = reason ?? "Saque rejeitado pela Woovi";

  await db.withdrawLog.update({
    where: { id: log.id },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorCode: code ? code.slice(0, 100) : null,
      errorMessage: message.slice(0, 1000),
    },
  });
}

async function processPayment(txid: string): Promise<void> {
  // 1. Tentar encontrar uma compra (Purchase) com este txid
  const purchase = await db.purchase.findFirst({
    where: { pixTxid: txid },
  });

  if (purchase) {
    if (purchase.status !== "pending") return;

    const now = new Date();

    await db.purchase.update({
      where: { id: purchase.id },
      data: { status: "paid", paidAt: now },
    });

    // Verificar se é compra de conteúdo ou de live (contentId null)
    const isLivePurchase = purchase.contentId === null;

    if (!isLivePurchase && purchase.contentId) {
      await db.content.update({
        where: { id: purchase.contentId },
        data: {
          purchaseCount: { increment: 1 },
          totalRevenue: { increment: purchase.amount },
        },
      });

      await db.bot.update({
        where: { id: purchase.botId },
        data: { totalRevenue: { increment: purchase.amount } },
      });

      scheduleContentDelivery({
        purchaseId: purchase.id,
        contentId: purchase.contentId,
        botId: purchase.botId,
        botUserId: purchase.botUserId,
      });
    } else {
      // Compra de acesso à live — enviar link da transmissão
      await db.bot.update({
        where: { id: purchase.botId },
        data: { totalRevenue: { increment: purchase.amount } },
      });

      // Buscar config da live e enviar link ao usuário
      scheduleLiveAccessGranted({
        botId: purchase.botId,
        botUserId: purchase.botUserId,
      });
    }

    return;
  }

  // 2. Tentar encontrar uma assinatura (Subscription) com este txid
  const subscription = await db.subscription.findFirst({
    where: { pixTxid: txid },
    include: { plan: true },
  });

  if (subscription) {
    // Assinatura já ativada (tem endDate definido) — ignorar
    if (subscription.endDate) return;

    const now = new Date();
    const endDate = calculateEndDate(now, subscription.plan.durationDays);

    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        paidAt: now,
        startDate: now,
        endDate,
      },
    });

    await db.bot.update({
      where: { id: subscription.botId },
      data: { totalRevenue: { increment: subscription.amount } },
    });

    // Notificar o usuário que a assinatura foi ativada
    scheduleSubscriptionConfirmed({
      subscriptionId: subscription.id,
      botId: subscription.botId,
      botUserId: subscription.botUserId,
    });

    return;
  }

  console.warn(`[Pix Webhook] Nenhuma compra ou assinatura encontrada para txid: ${txid}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Detect Woovi/OpenPix webhook format (has "event" field)
    if (body.event && typeof body.event === "string" && body.event.startsWith("OPENPIX:")) {
      // Verify signature using the provider
      const signature = request.headers.get("x-webhook-signature") ?? "";
      const provider = await getPixProvider();
      if (!provider.verifyWebhook(body, signature)) {
        console.warn("[Pix Webhook] Invalid Woovi webhook signature");
        return NextResponse.json({ success: true });
      }

      const wooviBody = body as WooviWebhookBody;
      switch (body.event) {
        case "OPENPIX:CHARGE_COMPLETED": {
          const txid = wooviBody.charge?.correlationID;
          if (txid) await processPayment(txid);
          break;
        }
        case "OPENPIX:MOVEMENT_CONFIRMED": {
          await processMovementConfirmed(wooviBody);
          break;
        }
        case "OPENPIX:MOVEMENT_FAILED": {
          await processMovementFailed(wooviBody);
          break;
        }
        default:
          // Eventos não mapeados (ex: CHARGE_CREATED, CHARGE_EXPIRED).
          // Retornamos 200 pra Woovi não retentar indefinidamente.
          break;
      }

      return NextResponse.json({ success: true });
    }

    // EFÍ Pay / generic PSP format (has "pix" array)
    const efiBody = body as EfiPayWebhookBody;
    const pixEntries = efiBody.pix;
    if (pixEntries && Array.isArray(pixEntries)) {
      for (const pix of pixEntries) {
        const txid = pix.txid || pix.endToEndId;
        if (txid) {
          await processPayment(txid);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Pix Webhook] Error:", error);
    // Return 200 to prevent PSP retries from flooding logs
    return NextResponse.json({ success: true });
  }
}
