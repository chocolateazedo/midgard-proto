// Gate central pra qualquer envio outbound: notification, content-delivery,
// régua de recuperação, broadcast. Opt-out global + bloqueio do bot são
// respeitados aqui — não cada worker reimplementando.
//
// Usar isUserMessageable antes de send. Se 403 vier do Telegram durante o
// envio, chame markBotBlocked.

import { db } from "@/lib/db";

export type OptOutSource = "command" | "button" | "admin" | "platform";

/**
 * Testa se um BotUser específico aceita mensagem agora. Retorna o motivo
 * pra logging; senders devem pular silenciosamente em caso negativo.
 */
export async function isUserMessageable(args: {
  botId: string;
  telegramUserId: bigint | number;
}): Promise<{ ok: true } | { ok: false; reason: "opted_out" | "blocked" | "unknown_user" }> {
  const tgId = typeof args.telegramUserId === "bigint"
    ? args.telegramUserId
    : BigInt(args.telegramUserId);

  const user = await db.botUser.findUnique({
    where: {
      botId_telegramUserId: { botId: args.botId, telegramUserId: tgId },
    },
    select: { optedOutAt: true, blockedBotAt: true },
  });
  if (!user) return { ok: false, reason: "unknown_user" };
  if (user.optedOutAt !== null) return { ok: false, reason: "opted_out" };
  if (user.blockedBotAt !== null) return { ok: false, reason: "blocked" };
  return { ok: true };
}

/**
 * Marca o usuário como bloqueado (após Telegram retornar 403). Idempotente.
 */
export async function markBotBlocked(args: {
  botId: string;
  telegramUserId: bigint | number;
}): Promise<void> {
  const tgId = typeof args.telegramUserId === "bigint"
    ? args.telegramUserId
    : BigInt(args.telegramUserId);

  await db.botUser.updateMany({
    where: {
      botId: args.botId,
      telegramUserId: tgId,
      blockedBotAt: null,
    },
    data: { blockedBotAt: new Date() },
  });
}

/**
 * Limpa o estado de bloqueio. Chamado quando o webhook recebe uma
 * mensagem do usuário de novo (ele desbloqueou pra falar).
 */
export async function clearBotBlocked(args: {
  botId: string;
  telegramUserId: bigint | number;
}): Promise<void> {
  const tgId = typeof args.telegramUserId === "bigint"
    ? args.telegramUserId
    : BigInt(args.telegramUserId);

  await db.botUser.updateMany({
    where: {
      botId: args.botId,
      telegramUserId: tgId,
      blockedBotAt: { not: null },
    },
    data: { blockedBotAt: null },
  });
}

/**
 * Marca opt-out global do usuário. Append-only no log de auditoria.
 * Idempotente — re-chamar não cria opt-out duplicado.
 */
export async function optOutBotUser(args: {
  botUserId: string;
  source: OptOutSource;
  notes?: string;
}): Promise<{ alreadyOptedOut: boolean }> {
  const existing = await db.botUser.findUnique({
    where: { id: args.botUserId },
    select: { optedOutAt: true },
  });
  if (!existing) {
    throw new Error(`BotUser ${args.botUserId} não encontrado`);
  }
  if (existing.optedOutAt !== null) {
    return { alreadyOptedOut: true };
  }
  await db.$transaction([
    db.botUser.update({
      where: { id: args.botUserId },
      data: {
        optedOutAt: new Date(),
        optedOutSource: args.source,
      },
    }),
    db.messageOptOutLog.create({
      data: {
        botUserId: args.botUserId,
        action: "opt_out",
        source: args.source,
        notes: args.notes ?? null,
      },
    }),
  ]);
  return { alreadyOptedOut: false };
}

/**
 * Reverte opt-out (usuário pediu pra voltar a receber). Append-only log.
 */
export async function optInBotUser(args: {
  botUserId: string;
  source: OptOutSource;
  notes?: string;
}): Promise<{ wasOptedOut: boolean }> {
  const existing = await db.botUser.findUnique({
    where: { id: args.botUserId },
    select: { optedOutAt: true },
  });
  if (!existing) {
    throw new Error(`BotUser ${args.botUserId} não encontrado`);
  }
  if (existing.optedOutAt === null) {
    return { wasOptedOut: false };
  }
  await db.$transaction([
    db.botUser.update({
      where: { id: args.botUserId },
      data: { optedOutAt: null, optedOutSource: null },
    }),
    db.messageOptOutLog.create({
      data: {
        botUserId: args.botUserId,
        action: "opt_in",
        source: args.source,
        notes: args.notes ?? null,
      },
    }),
  ]);
  return { wasOptedOut: true };
}

/**
 * Detecta erros do Telegram que indicam que o usuário bloqueou o bot.
 * grammy lança GrammyError com error_code=403 nesses casos.
 */
export function isBotBlockedError(err: unknown): boolean {
  const e = err as {
    error_code?: number;
    description?: string;
  };
  if (e?.error_code === 403) return true;
  if (typeof e?.description === "string") {
    const d = e.description.toLowerCase();
    return (
      d.includes("bot was blocked") ||
      d.includes("user is deactivated") ||
      d.includes("forbidden")
    );
  }
  return false;
}

/**
 * Wrapper pra enviar respeitando opt-out + bloqueio. Use em todo lugar
 * que envia DM pra BotUser (régua, broadcast, content-delivery).
 *
 * Comportamento:
 *  - skip silencioso se opt-out, blocked, ou unknown_user
 *  - 403 durante o envio → marca blocked, retorna { ok:false, reason:"blocked" }
 *  - outros erros → relança
 */
export async function sendWithMessageabilityGate(
  args: {
    botId: string;
    telegramUserId: bigint | number;
  },
  fn: () => Promise<void>,
): Promise<
  { ok: true } | { ok: false; reason: "opted_out" | "blocked" | "unknown_user" }
> {
  const gate = await isUserMessageable(args);
  if (!gate.ok) return gate;
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (isBotBlockedError(err)) {
      await markBotBlocked(args);
      return { ok: false, reason: "blocked" };
    }
    throw err;
  }
}
