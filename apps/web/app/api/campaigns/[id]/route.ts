import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";
import { safeCampaign } from "@/lib/campaigns";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id }, include: { _count: { select: { recipients: true } }, mailboxes: { include: { mailbox: { select: { id: true, name: true, email: true } } }, orderBy: { position: "asc" } }, recipients: { include: { contact: { select: { id: true, email: true, firstName: true, company: true } } }, take: 20, orderBy: { enrolledAt: "asc" } } } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ campaign: { ...safeCampaign(campaign), mailboxes: campaign.mailboxes.map((link) => link.mailbox), recipients: campaign.recipients } });
}
