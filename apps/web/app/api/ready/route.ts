import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { pingRedis } from "@mailpilot/shared/redis";

export async function GET() {
  let database = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = false;
  }
  const redis = await pingRedis();
  const ready = database && redis;
  return NextResponse.json({ ready, database: database ? "ready" : "unavailable", redis: redis ? "ready" : "unavailable", timestamp: new Date().toISOString() }, { status: ready ? 200 : 503 });
}
