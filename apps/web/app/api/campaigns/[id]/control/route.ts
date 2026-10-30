import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!["pause", "resume", "stop"].includes(body.action)) return NextResponse.json({ error: "Choose pause, resume, or stop" }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const action = body.action;
  if ((action === "pause" && campaign.status !== "ACTIVE") || (action === "resume" && campaign.status !== "PAUSED") || (action === "stop" && ["ARCHIVED", "COMPLETED"].includes(campaign.status))) {
    return NextResponse.json({ error: "This action is not available for the campaign's current status." }, { status: 409 });
  }
  const status = action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "ARCHIVED";
  const updated = await prisma.campaign.updateMany({ where: { id, workspaceId: auth.workspace.id, status: campaign.status }, data: { status, pausedAt: action === "resume" ? null : new Date() } });
  if (!updated.count) return NextResponse.json({ error: "Campaign changed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ ok: true, status });
}
