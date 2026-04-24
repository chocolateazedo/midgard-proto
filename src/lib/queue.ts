import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    // Dynamic import avoided — ioredis is already a dependency of bullmq.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis") as typeof import("ioredis").default;
    _connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    // Prevent unhandled error events from crashing the process
    _connection.on("error", () => {});
  }
  return _connection;
}

let _pixConfirmationQueue: Queue | null = null;
let _contentDeliveryQueue: Queue | null = null;
let _previewGenerationQueue: Queue | null = null;

export function getPixConfirmationQueue(): Queue {
  if (!_pixConfirmationQueue) {
    _pixConfirmationQueue = new Queue("pix-confirmation", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return _pixConfirmationQueue;
}

export function getContentDeliveryQueue(): Queue {
  if (!_contentDeliveryQueue) {
    _contentDeliveryQueue = new Queue("content-delivery", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return _contentDeliveryQueue;
}

export function getPreviewGenerationQueue(): Queue {
  if (!_previewGenerationQueue) {
    _previewGenerationQueue = new Queue("preview-generation", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _previewGenerationQueue;
}

let _notificationQueue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notifications", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return _notificationQueue;
}

let _ivsCostFinalizeQueue: Queue | null = null;

/**
 * Queue pra finalização de custo de sessão IVS.
 * Jobs são enfileirados com delay de ~5 min (tempo pra CloudWatch consolidar
 * métricas) pelo webhook handler quando um Stream End é recebido.
 */
export function getIvsCostFinalizeQueue(): Queue {
  if (!_ivsCostFinalizeQueue) {
    _ivsCostFinalizeQueue = new Queue("ivs-cost-finalize", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _ivsCostFinalizeQueue;
}

let _wooviSubAccountQueue: Queue | null = null;

/**
 * Queue pra provisionamento de subcontas Woovi (Split Pix).
 * Enfileirada quando creator/manager cadastra ou troca a chave Pix.
 * Processor cria a subconta na Woovi e marca o estado no User.
 */
export function getWooviSubAccountQueue(): Queue {
  if (!_wooviSubAccountQueue) {
    _wooviSubAccountQueue = new Queue("woovi-subaccount-provision", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
      },
    });
  }
  return _wooviSubAccountQueue;
}

let _botProvisioningQueue: Queue | null = null;

/**
 * Queue pro provisionamento de bots via BotFather (integração TopFans → BotFans).
 * Processada por bot-provisioner.worker com concurrency=1 e limiter configurável.
 */
export function getBotProvisioningQueue(): Queue {
  if (!_botProvisioningQueue) {
    _botProvisioningQueue = new Queue("bot-provisioning", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 1000,
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }
  return _botProvisioningQueue;
}

type WorkerOptions = {
  concurrency?: number;
  // Tempo (ms) que o Worker mantém o lock sem enviar heartbeat; se o
  // processor demora mais que isso, BullMQ marca o job como "stalled".
  // Default BullMQ = 30s. Jobs que processam vídeo via ffmpeg precisam
  // de valores muito maiores (sugestão: 10min).
  lockDuration?: number;
};

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  opts: WorkerOptions = {}
): Worker<T> {
  // lockDuration undefined quebra o script Lua do moveToActive (SET ... PX nil).
  // Só passa a chave quando veio explícita — BullMQ aplica default (30s) sozinho.
  const workerOpts: ConstructorParameters<typeof Worker<T>>[2] = {
    connection: getConnection(),
    concurrency: opts.concurrency ?? 5,
  };
  if (opts.lockDuration !== undefined) {
    workerOpts.lockDuration = opts.lockDuration;
  }
  return new Worker<T>(queueName, processor, workerOpts);
}

export { getConnection as getRedisConnection };
