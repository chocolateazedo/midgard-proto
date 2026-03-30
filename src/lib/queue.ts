import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const pixConfirmationQueue = new Queue("pix-confirmation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const contentDeliveryQueue = new Queue("content-delivery", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const previewGenerationQueue = new Queue("preview-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>
): Worker<T> {
  return new Worker<T>(queueName, processor, {
    connection,
    concurrency: 5,
  });
}

export { connection as redisConnection };
