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

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>
): Worker<T> {
  return new Worker<T>(queueName, processor, {
    connection: getConnection(),
    concurrency: 5,
  });
}

export { getConnection as getRedisConnection };
