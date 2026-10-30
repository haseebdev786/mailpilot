import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { verifyUnsubscribeToken } from "@mailpilot/shared/compliance";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = request.headers.get("content-type")?.includes("application/json") ? await request.json().catch(() => null) : null;
  const token = url.searchParams.get("token") || body?.token;
  const identity = typeof token === "string" ? verifyUnsubscribeToken(token) : null;
  if (!identity) return NextResponse.json({ error: "This unsubscribe link is invalid. Use the link in your original email." }, { status: 400 });
  const { workspaceId, email } = identity;
  await prisma.$transaction([
    prisma.suppressionList.upsert({ where: { workspaceId_email: { workspaceId, email } }, update: { reason: "unsubscribe", source: "signed-link" }, create: { workspaceId, email, reason: "unsubscribe", source: "signed-link" } }),
    prisma.contact.updateMany({ where: { workspaceId, email }, data: { status: "unsubscribed" } }),
    prisma.campaignContact.updateMany({ where: { contact: { workspaceId, email }, completedAt: null }, data: { completedAt: new Date() } })
  ]);
  return NextResponse.json({ ok: true });
}
