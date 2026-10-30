import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { z } from "zod";
import { getCurrentAuth } from "@/lib/auth";
import { campaignSchema, safeCampaign } from "@/lib/campaigns";

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const campaigns = await prisma.campaign.findMany({ where: { workspaceId: auth.workspace.id }, include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ campaigns: campaigns.map(safeCampaign) });
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const input = campaignSchema.parse(await request.json());
    const [list, mailboxes, contacts] = await Promise.all([
      prisma.contactList.findFirst({ where: { id: input.listId, workspaceId: auth.workspace.id } }),
      prisma.mailbox.findMany({ where: { id: { in: input.mailboxIds }, workspaceId: auth.workspace.id, isActive: true }, orderBy: { createdAt: "asc" } }),
      prisma.contact.findMany({ where: { workspaceId: auth.workspace.id, lists: { some: { id: input.listId, workspaceId: auth.workspace.id } } }, select: { id: true } })
    ]);
    if (!list) return NextResponse.json({ error: "Contact list not found" }, { status: 404 });
    if (mailboxes.length !== new Set(input.mailboxIds).size) return NextResponse.json({ error: "One or more mailboxes are unavailable" }, { status: 400 });
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: auth.workspace.id, createdById: auth.user.id, mailboxId: mailboxes[0]?.id, name: input.name,
        businessDescription: input.businessDescription, services: input.services, offer: input.offer || null, tone: input.tone,
        cta: input.cta, signature: input.signature || null, sendingDelayMin: input.sendingDelayMin, sendingDelayMax: input.sendingDelayMax,
        sendingStartHour: input.sendingStartHour, sendingEndHour: input.sendingEndHour, timezone: input.timezone, skipWeekends: input.skipWeekends,
        replyMode: input.replyMode, lists: { connect: { id: list.id } },
        mailboxes: { create: mailboxes.map((mailbox, position) => ({ mailboxId: mailbox.id, position })) },
        steps: { create: [{ position: 0, type: "EMAIL", delayHours: 0, subject: input.templateSubject || null, templateBody: input.templateText || "Initial personalized email" }, ...input.followUps.map((step, index) => ({ position: index + 1, type: "EMAIL" as const, delayHours: step.delayHours, templateBody: step.instruction }))] },
        recipients: { createMany: { data: contacts.map((contact) => ({ contactId: contact.id })) } }
      },
      include: { _count: { select: { recipients: true } } }
    });
    return NextResponse.json({ campaign: safeCampaign(campaign) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message || "Campaign details are invalid.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign details are invalid" }, { status: 400 });
  }
}
