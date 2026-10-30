import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";
import { withDatabaseErrors } from "@/lib/database-response";

type Context = { params: Promise<{ id: string }> };
const selectionSchema = z.union([
  z.object({ contactIds: z.array(z.string().min(1).max(100)).max(10000) }).strict(),
  z.object({ listId: z.string().min(1).max(100) }).strict()
]);

export const GET = withDatabaseErrors(async (_request: Request, { params }: Context) => {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id }, select: { recipients: { select: { contactId: true } } } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ contactIds: campaign.recipients.map((item) => item.contactId) });
});

export const PUT = withDatabaseErrors(async (request: Request, { params }: Context) => {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a list or up to 10,000 contacts." }, { status: 400 });
  const input = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id }, select: { id: true } });
    if (!campaign) return { error: "Campaign not found", status: 404 };
    // Lock the draft row so launch and recipient edits cannot overlap.
    const locked = await tx.campaign.updateMany({ where: { id, workspaceId: auth.workspace.id, status: "DRAFT" }, data: { updatedAt: new Date() } });
    if (!locked.count) return { error: "Recipients can only be changed before automation starts. Create a new draft for another group.", status: 409 };
    let contactIds: string[];
    if ("listId" in input) {
      const list = await tx.contactList.findFirst({ where: { id: input.listId, workspaceId: auth.workspace.id }, select: { id: true } });
      if (!list) return { error: "Contact list not found", status: 404 };
      const contacts = await tx.contact.findMany({ where: { workspaceId: auth.workspace.id, lists: { some: { id: list.id } } }, select: { id: true }, take: 10001 });
      if (contacts.length > 10000) return { error: "Use a list with at most 10,000 contacts per campaign.", status: 400 };
      contactIds = contacts.map((contact) => contact.id);
    } else {
      contactIds = [...new Set(input.contactIds)];
      const count = await tx.contact.count({ where: { workspaceId: auth.workspace.id, id: { in: contactIds } } });
      if (count !== contactIds.length) return { error: "One or more contacts are unavailable in your workspace.", status: 400 };
    }
    await tx.campaignContact.deleteMany({ where: { campaignId: id, contactId: { notIn: contactIds } } });
    if (contactIds.length) await tx.campaignContact.createMany({ data: contactIds.map((contactId) => ({ campaignId: id, contactId })), skipDuplicates: true });
    return { contactIds, recipientCount: contactIds.length, status: 200 };
  }, { maxWait: 10000, timeout: 20000 });
  return NextResponse.json(result, { status: result.status });
});
