import "./env";
import IORedis from "ioredis";
import { logger } from "./logger";

let client: IORedis | undefined;
let warned = false;

/** Lazily created Redis client. Never throws on construction; commands may fail. */
export function getRedisClient(): IORedis {
  if (!client || client.status === "end") {
    client = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 3000,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => (attempt <= 1 ? 200 : null),
      lazyConnect: true
    });
    client.on("error", () => {
      if (!warned) {
        warned = true;
        logger.warn("redis_unavailable_fallback");
      }
    });
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const result = await getRedisClient().ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function acquireLock(key: string, ttlMs: number): Promise<boolean> {
  try {
    const result = await getRedisClient().set(key, process.pid.toString(), "PX", ttlMs, "NX");
    return result === "OK";
  } catch {
    // Without Redis there is no distributed lock; a single worker still works.
    return true;
  }
}

export async function releaseLock(key: string): Promise<void> {
  try {
    await getRedisClient().del(key);
  } catch {
    // Best effort only.
  }
}

export async function getWorkerHeartbeat(): Promise<number | null> {
  try {
    const value = await getRedisClient().get("mailpilot:worker:heartbeat");
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}
