import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getOutreachQueue } from "@mailpilot/shared/queue";
import { getWorkerHeartbeat, pingRedis } from "@mailpilot/shared/redis";

export async function GET() {
  const timestamp = new Date().toISOString();
  let database: "ready" | "unavailable" = "ready";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  const redis = await pingRedis();
  let queue: Record<string, number> | null = null;
  let queueError: string | null = null;
  try {
    queue = await getOutreachQueue().getJobCounts("waiting", "active", "delayed", "failed");
  } catch (error) {
    queueError = error instanceof Error ? error.message : "queue unavailable";
  }
  const heartbeat = await getWorkerHeartbeat();
  const worker = heartbeat && Date.now() - heartbeat < 180_000 ? "ready" : heartbeat ? "stale" : "unknown";
  const body = {
    ok: database === "ready",
    service: "web",
    database,
    redis: redis ? "ready" : "unavailable",
    queue,
    queueError,
    worker,
    workerHeartbeatAt: heartbeat ? new Date(heartbeat).toISOString() : null,
    timestamp
  };
  // Browsing works without Redis/worker, so only a database outage is a 503.
  // Redis/worker problems are reported as degraded, not hidden.
  return NextResponse.json(body, { status: database === "ready" ? 200 : 503 });
}
