import { getRedisClient } from "./redis";

type FallbackEntry = { count: number; resetAt: number };
const fallback = new Map<string, FallbackEntry>();

export type RateLimitResult = { allowed: boolean; remaining: number; resetInSeconds: number };

function fallbackCheck(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const entry = fallback.get(key);
  if (!entry || entry.resetAt <= now) {
    fallback.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetInSeconds: windowSeconds };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetInSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000))
  };
}

/**
 * Distributed (Redis) fixed-window rate limit with a graceful in-process
 * fallback when Redis is unavailable. The fallback is per-process, so it is
 * weaker than Redis under multiple web processes — exactly like the queue
 * failure mode already documented in the README — but it never blocks
 * legitimate traffic just because Redis is down.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(`ratelimit:${key}`);
    if (count === 1) await redis.expire(`ratelimit:${key}`, windowSeconds);
    const ttl = await redis.ttl(`ratelimit:${key}`);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetInSeconds: ttl > 0 ? ttl : windowSeconds
    };
  } catch {
    return fallbackCheck(key, limit, windowSeconds);
  }
}

export function resetRateLimitFallback(): void {
  fallback.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
