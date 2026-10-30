import "./env";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { logger } from "./logger";

let queue: Queue | undefined;
let producer: IORedis | undefined;

export function createWorkerConnection() {
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  connection.on("error", () => logger.error("worker_redis_unavailable", {}));
  return connection;
}

// Pages and builds should not start Redis; HTTP producers must fail promptly.
export function getOutreachQueue(): Queue {
  if (!queue || producer?.status === "end") {
    void queue?.close().catch(() => undefined);
    producer = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1, connectTimeout: 3000, commandTimeout: 5000,
      retryStrategy: (attempt) => attempt <= 1 ? 200 : null
    });
    producer.on("error", () => logger.error("queue_redis_unavailable", {}));
    queue = new Queue("outreach", { connection: producer });
    queue.on("error", () => logger.error("queue_unavailable", {}));
  }
  return queue;
}

export async function closeQueue() {
  await queue?.close();
  producer?.disconnect();
  queue = undefined;
  producer = undefined;
}
