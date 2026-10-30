import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "web", database: "ready", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, service: "web", database: "unavailable" }, { status: 503 });
  }
}
