import { randomBytes, randomUUID } from "crypto";

import { hash } from "bcryptjs";
import { Worker } from "bullmq";

import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { botManager } from "@/lib/telegram";
import { createBotViaBotFather, getStatus } from "@/lib/telegram-mtproto";

export type BotProvisionJobData = {
  ticketId: string;
  externalId: string;
  email: string;
  displayName: string;
  platformFeePercent?: number;
  desiredUsername?: string;
};

const LEADER_KEY = "botfans:bot-provisioner:leader";
const LEADER_ID = randomUUID();
const TTL_SECONDS = 60;
let isLeader = false;
let refreshTimer: NodeJS.Timeout | null = null;

async function acquireLeadership(): Promise<boolean> {
  const redis = getRedisConnection();
  // SET NX EX — só grava se não existe. Se outro worker já tá ativo, perde.
  const res = await redis.set(LEADER_KEY, LEADER_ID, "EX", TTL_SECONDS, "NX");
  return res === "OK";
}

async function refreshLeadership(): Promise<boolean> {
  const redis = getRedisConnection();
  // Lua: renova TTL apenas se o valor ainda é nosso
  const script =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end';
  const res = (await redis.eval(script, 1, LEADER_KEY, LEADER_ID, String(TTL_SECONDS))) as number;
  return res === 1;
}

async function readMaxPerHour(): Promise<number> {
  const setting = await db.platformSetting.findUnique({
    where: { key: "bot_provisioning_max_per_hour" },
  });
  const raw = Number(setting?.value ?? 12);
  return Number.isFinite(raw) && raw >= 1 && raw <= 500 ? Math.trunc(raw) : 12;
}

function generateTempPassword(): string {
  // 18 bytes → 24 chars base64url (alpha+num+-+_)
  return randomBytes(18).toString("base64url");
}

async function resolveWebhookUrl(botId: string): Promise<string> {
  const base = await db.platformSetting.findUnique({
    where: { key: "telegram_webhook_base_url" },
  });
  const baseUrl = base?.value || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/webhooks/telegram`;
  return `${baseUrl.replace(/\/$/, "")}/${botId}`;
}

async function processJob(data: BotProvisionJobData): Promise<void> {
  const { ticketId, email, displayName, platformFeePercent, desiredUsername } = data;

  // Marca processing + incrementa tentativas
  const job = await db.provisionJob.update({
    where: { id: ticketId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  // 1) Verifica sessão MTProto
  const status = await getStatus();
  if (!status.connected) {
    await failJob(ticketId, "Sessão MTProto não conectada — admin precisa reconectar em /admin/settings");
    throw new Error("mtproto-not-connected");
  }

  // 2) Cria usuário (rollback em caso de falha posterior — leave user to admin if partial)
  let userId = job.userId;
  let tempPassword = job.tempPassword;
  if (!userId) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Conflito de email — retorna job como pending_manual pra admin resolver
      await db.provisionJob.update({
        where: { id: ticketId },
        data: {
          status: "pending_manual",
          lastError: `Email já existe como usuário ${existing.id}. Resolver manualmente.`,
        },
      });
      return;
    }
    tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        name: displayName,
        role: "creator",
        mustChangePassword: true,
        isActive: true,
        ...(platformFeePercent !== undefined
          ? { platformFeePercent: platformFeePercent }
          : {}),
      },
    });
    userId = user.id;
    await db.provisionJob.update({
      where: { id: ticketId },
      data: { userId, tempPassword },
    });
  }

  // 3) Cria bot via BotFather
  const base = desiredUsername ?? slugFromEmail(email);
  const current = await db.provisionJob.findUnique({
    where: { id: ticketId },
    select: { attemptedUsernames: true },
  });
  let created;
  try {
    created = await createBotViaBotFather({
      botName: displayName,
      desiredUsername: base,
      maxAttempts: 6,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // FloodWait/erro de rede → joga pra pending_manual
    await db.provisionJob.update({
      where: { id: ticketId },
      data: {
        status: "pending_manual",
        lastError: message,
        attemptedUsernames: {
          set: Array.from(
            new Set([...(current?.attemptedUsernames ?? []), base]),
          ),
        },
      },
    });
    throw err;
  }

  await db.provisionJob.update({
    where: { id: ticketId },
    data: {
      attemptedUsernames: {
        set: Array.from(
          new Set([...(current?.attemptedUsernames ?? []), ...created.usernamesTried]),
        ),
      },
      botUsername: created.username,
    },
  });

  // 4) Cria Bot no DB + registra webhook
  const encryptedToken = encrypt(created.token);
  const bot = await db.bot.create({
    data: {
      userId: userId!,
      name: displayName,
      username: created.username,
      telegramToken: encryptedToken,
      isActive: true,
    },
  });

  const webhookUrl = await resolveWebhookUrl(bot.id);
  try {
    await botManager.setWebhook(created.token, webhookUrl);
    await db.bot.update({
      where: { id: bot.id },
      data: { webhookUrl },
    });
  } catch (err) {
    // Bot existe mas webhook falhou — admin pode reprocessar via UI
    const message = err instanceof Error ? err.message : String(err);
    await db.provisionJob.update({
      where: { id: ticketId },
      data: {
        status: "pending_manual",
        botId: bot.id,
        lastError: `Bot criado (${created.username}) mas webhook falhou: ${message}`,
      },
    });
    throw err;
  }

  await db.provisionJob.update({
    where: { id: ticketId },
    data: {
      status: "success",
      botId: bot.id,
      completedAt: new Date(),
    },
  });
}

async function failJob(ticketId: string, message: string): Promise<void> {
  await db.provisionJob.update({
    where: { id: ticketId },
    data: { status: "failed", lastError: message, completedAt: new Date() },
  });
}

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "bot";
  return local.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Lazy worker — criado apenas após acquireLeadership + readMaxPerHour
let _worker: Worker<BotProvisionJobData> | null = null;

export async function startBotProvisionerWorker(): Promise<Worker<BotProvisionJobData> | null> {
  const acquired = await acquireLeadership();
  if (!acquired) {
    console.warn(
      "[bot-provisioner] Outro worker já detém a liderança — este processo não processará provisionamentos",
    );
    return null;
  }
  isLeader = true;

  const maxPerHour = await readMaxPerHour();
  console.log(`[bot-provisioner] Leader acquired. Limiter: ${maxPerHour}/hour`);

  _worker = new Worker<BotProvisionJobData>(
    "bot-provisioning",
    async (job) => {
      if (!isLeader) throw new Error("lost-leadership");
      // Jitter ±30s pra evitar salvas síncronas ao @BotFather se o limiter liberar vários ao mesmo tempo
      const jitterMs = Math.floor(Math.random() * 60_000) - 30_000;
      if (jitterMs > 0) await new Promise((r) => setTimeout(r, jitterMs));
      await processJob(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: maxPerHour, duration: 3_600_000 },
    },
  );

  refreshTimer = setInterval(() => {
    refreshLeadership().catch(() => {
      console.error("[bot-provisioner] Falha ao renovar liderança — encerrando worker");
      isLeader = false;
      void _worker?.close();
    });
  }, 30_000);

  _worker.on("failed", (job, err) => {
    console.error(`[bot-provisioner] job=${job?.id} failed:`, err.message);
  });
  _worker.on("completed", (job) => {
    console.log(`[bot-provisioner] job=${job.id} completed`);
  });

  return _worker;
}

export async function stopBotProvisionerWorker(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (isLeader) {
    // Libera a liderança explicitamente
    const redis = getRedisConnection();
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await redis.eval(script, 1, LEADER_KEY, LEADER_ID).catch(() => undefined);
    isLeader = false;
  }
}
