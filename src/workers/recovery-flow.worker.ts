// Worker da régua de recuperação. Tick periódico (1min).
//
// Modelo: cada bot tem RecoveryMessages independentes. Cada mensagem tem
// uma de duas frequências:
//   - once: dispara 1x por user; idempotência = "sem log dessa msg"
//   - recurring: dispara periodicamente enquanto trigger condition se mantém;
//     idempotência = "último envio < now - recurringIntervalMinutes"
//
// Recurring com >1 variants → round-robin: variant index = sentCount % N.
// Recurring respeita janela 8h-22h Brasília (não acorda user dormindo).
//
// Buttons inline: subscribe_plan vira callback_data sub_<planId> (handler
// de /planos já existe), link vira url externa.

import { createWorker } from "@/lib/queue";
import { db } from "@/lib/db";
import { botManager } from "@/lib/telegram";
import { decrypt } from "@/lib/crypto";
import {
  isUserMessageable,
  isBotBlockedError,
  markBotBlocked,
} from "@/lib/messageability";
import type { Prisma } from "@prisma/client";

type EnforcerJob = Record<string, never>;

const MAX_PER_TICK = 200;
const ITEM_DELAY_MS = 100;
// Janela permitida pra envios recurring (Brasília, UTC-3).
const RECURRING_WINDOW_START_HOUR = 8;
const RECURRING_WINDOW_END_HOUR = 22;

interface MessageVariant {
  text: string;
  mediaKey?: string | null;
  mediaType?: "photo" | "video" | null;
}

type ButtonAction =
  | { type: "link"; url: string }
  | { type: "subscribe_plan"; planId: string };

interface MessageButton {
  text: string;
  action: ButtonAction;
}

interface MessageContent {
  variants: MessageVariant[];
  buttons?: MessageButton[];
}

interface MessageTriggerParams {
  delayMinutes?: number;
  daysBefore?: number;
  daysAfter?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verifica se está na janela 8h-22h horário de Brasília (UTC-3).
 * Worker pode rodar em qualquer fuso — convertemos pra Brasília na hora.
 */
function isWithinDeliveryWindow(now = new Date()): boolean {
  // UTC-3 sem DST (Brasil aboliu horário de verão)
  const brasiliaMs = now.getTime() - 3 * 60 * 60 * 1000;
  const brasilia = new Date(brasiliaMs);
  const hour = brasilia.getUTCHours();
  return hour >= RECURRING_WINDOW_START_HOUR && hour < RECURRING_WINDOW_END_HOUR;
}

function renderText(
  template: string,
  vars: { nome: string; produtor: string; planoMaisBarato: string },
): string {
  return template
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{produtor}", vars.produtor)
    .replaceAll("{plano_mais_barato}", vars.planoMaisBarato);
}

function buildInlineKeyboard(
  buttons: MessageButton[] | undefined,
):
  | undefined
  | { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> } {
  if (!buttons || buttons.length === 0) return undefined;
  // 1 botão por linha — layout vertical, mais legível em DMs.
  return {
    inline_keyboard: buttons.map((b) => {
      if (b.action.type === "link") {
        return [{ text: b.text, url: b.action.url }];
      }
      return [{ text: b.text, callback_data: `sub_${b.action.planId}` }];
    }),
  };
}

async function getCheapestActivePlanLabel(botId: string): Promise<string> {
  const plan = await db.subscriptionPlan.findFirst({
    where: { botId, isActive: true },
    orderBy: { price: "asc" },
    select: { name: true, price: true },
  });
  if (!plan) return "Plano de Assinatura";
  return `${plan.name} (R$ ${plan.price.toNumber().toFixed(2).replace(".", ",")})`;
}

async function findEligibleBotUsers(args: {
  botId: string;
  messageId: string;
  triggerType: string;
  params: MessageTriggerParams;
  frequency: "once" | "recurring";
  recurringIntervalMinutes: number | null;
  limit: number;
}): Promise<
  Array<{ botUserId: string; telegramUserId: bigint; firstName: string | null }>
> {
  const {
    botId,
    messageId,
    triggerType,
    params,
    frequency,
    recurringIntervalMinutes,
    limit,
  } = args;
  const now = new Date();

  // Eligibility: either nunca recebeu (once), ou último envio foi há mais
  // que o intervalo (recurring). Filter combina via Prisma `none`.
  const logFilter: Prisma.RecoveryMessageLogListRelationFilter = (() => {
    if (frequency === "recurring" && recurringIntervalMinutes) {
      const cutoff = new Date(
        now.getTime() - recurringIntervalMinutes * 60_000,
      );
      return {
        none: {
          messageId,
          sentAt: { gte: cutoff },
        },
      };
    }
    return { none: { messageId } };
  })();

  const baseWhere: Prisma.BotUserWhereInput = {
    botId,
    optedOutAt: null,
    blockedBotAt: null,
    recoveryMessageLogs: logFilter,
  };

  switch (triggerType) {
    case "time_after_first_seen": {
      const delayMin = Math.max(0, params.delayMinutes ?? 0);
      const cutoff = new Date(now.getTime() - delayMin * 60_000);
      const rows = await db.botUser.findMany({
        where: {
          ...baseWhere,
          firstSeenAt: { lte: cutoff },
          subscriptions: {
            none: { status: "active", endDate: { gt: now } },
          },
        },
        select: { id: true, telegramUserId: true, telegramFirstName: true },
        take: limit,
      });
      return rows.map((r) => ({
        botUserId: r.id,
        telegramUserId: r.telegramUserId,
        firstName: r.telegramFirstName,
      }));
    }
    case "cart_abandoned": {
      const delayMin = Math.max(0, params.delayMinutes ?? 0);
      const cutoff = new Date(now.getTime() - delayMin * 60_000);
      const rows = await db.botUser.findMany({
        where: {
          ...baseWhere,
          purchases: {
            some: { status: "pending", createdAt: { lte: cutoff } },
          },
          subscriptions: {
            none: { status: "active", endDate: { gt: now } },
          },
        },
        select: { id: true, telegramUserId: true, telegramFirstName: true },
        take: limit,
      });
      return rows.map((r) => ({
        botUserId: r.id,
        telegramUserId: r.telegramUserId,
        firstName: r.telegramFirstName,
      }));
    }
    case "subscription_ending": {
      const daysBefore = Math.max(0, params.daysBefore ?? 0);
      const lo = now;
      const hi = new Date(now.getTime() + daysBefore * 24 * 60 * 60_000);
      const rows = await db.botUser.findMany({
        where: {
          ...baseWhere,
          subscriptions: {
            some: { status: "active", endDate: { gte: lo, lte: hi } },
          },
        },
        select: { id: true, telegramUserId: true, telegramFirstName: true },
        take: limit,
      });
      return rows.map((r) => ({
        botUserId: r.id,
        telegramUserId: r.telegramUserId,
        firstName: r.telegramFirstName,
      }));
    }
    case "winback": {
      const daysAfter = Math.max(0, params.daysAfter ?? 0);
      const cutoff = new Date(now.getTime() - daysAfter * 24 * 60 * 60_000);
      const rows = await db.botUser.findMany({
        where: {
          ...baseWhere,
          subscriptions: {
            some: { status: "expired", endDate: { lte: cutoff } },
            none: { status: "active", endDate: { gt: now } },
          },
        },
        select: { id: true, telegramUserId: true, telegramFirstName: true },
        take: limit,
      });
      return rows.map((r) => ({
        botUserId: r.id,
        telegramUserId: r.telegramUserId,
        firstName: r.telegramFirstName,
      }));
    }
    case "no_active_subscription": {
      const rows = await db.botUser.findMany({
        where: {
          ...baseWhere,
          subscriptions: {
            none: { status: "active", endDate: { gt: now } },
          },
        },
        select: { id: true, telegramUserId: true, telegramFirstName: true },
        take: limit,
      });
      return rows.map((r) => ({
        botUserId: r.id,
        telegramUserId: r.telegramUserId,
        firstName: r.telegramFirstName,
      }));
    }
    default:
      return [];
  }
}

async function deliverMessage(args: {
  botId: string;
  messageId: string;
  content: MessageContent;
  botUserId: string;
  telegramUserId: bigint;
  firstName: string | null;
  botName: string;
  token: string;
  cheapestPlanLabel: string;
}): Promise<void> {
  const {
    botId,
    messageId,
    content,
    botUserId,
    telegramUserId,
    firstName,
    botName,
    token,
    cheapestPlanLabel,
  } = args;

  // Re-checa messageability na hora de enviar (concorrência).
  const gate = await isUserMessageable({ botId, telegramUserId });
  if (!gate.ok) {
    await db.recoveryMessageLog
      .create({
        data: { messageId, botUserId, result: gate.reason },
      })
      .catch(() => {
        /* falha não bloqueia */
      });
    return;
  }

  // Variant picker: round-robin baseado em quantos `sent` esse user já
  // teve dessa mensagem. Pra `once` sempre é index 0 (1 variant só).
  const variants = content.variants ?? [];
  if (variants.length === 0) return;
  const sentSoFar = await db.recoveryMessageLog.count({
    where: { messageId, botUserId, result: "sent" },
  });
  const variant = variants[sentSoFar % variants.length];

  const text = renderText(variant.text, {
    nome: firstName ?? "amigo(a)",
    produtor: botName,
    planoMaisBarato: cheapestPlanLabel,
  });

  const replyMarkup = buildInlineKeyboard(content.buttons);

  let result: "sent" | "failed" | "blocked" = "sent";
  let errorMessage: string | null = null;

  try {
    if (variant.mediaKey && variant.mediaType) {
      const tgType = variant.mediaType === "video" ? "video" : "image";
      await botManager.sendMediaFromKey(token, Number(telegramUserId), {
        type: tgType,
        key: variant.mediaKey,
        caption: text,
        options: {
          parse_mode: "Markdown",
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        },
      });
    } else {
      await botManager.sendMessage(token, Number(telegramUserId), text, {
        parse_mode: "Markdown",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
  } catch (err) {
    if (isBotBlockedError(err)) {
      await markBotBlocked({ botId, telegramUserId });
      result = "blocked";
    } else {
      result = "failed";
      errorMessage =
        err instanceof Error
          ? err.message.slice(0, 500)
          : String(err).slice(0, 500);
    }
  }

  // Idempotente — unique constraint protege.
  try {
    await db.recoveryMessageLog.create({
      data: { messageId, botUserId, result, errorMessage },
    });
  } catch {
    return;
  }
}

export const recoveryFlowWorker = createWorker<EnforcerJob>(
  "recovery-flow",
  async () => {
    const messages = await db.recoveryMessage.findMany({
      where: { isActive: true },
    });
    if (messages.length === 0) return;

    // Agrupa por botId pra carregar bot+plan label uma vez.
    const byBot = new Map<string, typeof messages>();
    for (const m of messages) {
      const arr = byBot.get(m.botId) ?? [];
      arr.push(m);
      byBot.set(m.botId, arr);
    }

    let processed = 0;

    for (const [botId, msgs] of Array.from(byBot.entries())) {
      if (processed >= MAX_PER_TICK) break;
      const bot = await db.bot.findUnique({
        where: { id: botId },
        select: { telegramToken: true, name: true, isActive: true },
      });
      if (!bot?.isActive) continue;
      const token = decrypt(bot.telegramToken);
      const cheapestPlanLabel = await getCheapestActivePlanLabel(botId);

      for (const msg of msgs) {
        if (processed >= MAX_PER_TICK) break;
        // Recurring messages só disparam dentro da janela 8h-22h Brasília.
        if (msg.frequency === "recurring" && !isWithinDeliveryWindow()) {
          continue;
        }
        const remaining = MAX_PER_TICK - processed;
        const eligibles = await findEligibleBotUsers({
          botId,
          messageId: msg.id,
          triggerType: msg.triggerType,
          params: msg.triggerParams as unknown as MessageTriggerParams,
          frequency: msg.frequency as "once" | "recurring",
          recurringIntervalMinutes: msg.recurringIntervalMinutes,
          limit: Math.min(50, remaining),
        });
        for (const e of eligibles) {
          if (processed >= MAX_PER_TICK) break;
          try {
            await deliverMessage({
              botId,
              messageId: msg.id,
              content: msg.content as unknown as MessageContent,
              botUserId: e.botUserId,
              telegramUserId: e.telegramUserId,
              firstName: e.firstName,
              botName: bot.name,
              token,
              cheapestPlanLabel,
            });
          } catch (err) {
            console.error(
              `[recovery] message ${msg.id} botUser ${e.botUserId} falhou:`,
              err,
            );
          }
          processed += 1;
          await sleep(ITEM_DELAY_MS);
        }
      }
    }

    if (processed > 0) {
      console.log(`[recovery] ${processed} envio(s) processado(s)`);
    }
  },
);

export async function scheduleRecoveryFlowTick() {
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue");
  const queue = new Queue("recovery-flow", {
    connection: getRedisConnection(),
  });
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }
  await queue.add(
    "tick",
    {},
    {
      repeat: { every: 60_000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  console.log("  ✓ Recovery flow worker agendado (1min)");
}
