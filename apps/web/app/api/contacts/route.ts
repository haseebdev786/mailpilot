import { withDatabaseErrors } from "@/lib/database-response";
import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { checkContactLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const statusSchema = z.enum(["new", "contacted", "followed_up", "replied", "interested", "not_interested", "unsubscribed", "bounced"]);
const contactSchema = z.object({ email: z.string().trim().email().max(160), name: z.string().trim().max(160).optional(), company: z.string().trim().max(200).optional(), website: z.string().trim().max(500).optional(), customFields: z.record(z.string().max(2000)).optional(), listId: z.string().max(100).optional() });

export const GET = withDatabaseErrors(async (request: Request) => {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status");
  if (status && !statusSchema.safeParse(status).success) return NextResponse.json({ error: "Invalid contact status" }, { status: 400 });
  const listId = url.searchParams.get("listId");
  const tag = url.searchParams.get("tag")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  if (!Number.isInteger(page) || !Number.isInteger(limit)) return NextResponse.json({ error: "Page and limit must be integers" }, { status: 400 });
  const where = { workspaceId: auth.workspace.id, ...(search ? { OR: [{ email: { contains: search, mode: "insensitive" as const } }, { firstName: { contains: search, mode: "insensitive" as const } }, { lastName: { contains: search, mode: "insensitive" as const } }, { company: { contains: search, mode: "insensitive" as const } }] } : {}), ...(status ? { status: statusSchema.parse(status) } : {}), ...(listId ? { lists: { some: { id: listId, workspaceId: auth.workspace.id } } } : {}), ...(tag ? { tags: { some: { tag: { name: tag, workspaceId: auth.workspace.id } } } } : {}) };
  const [contacts, total] = await prisma.$transaction([prisma.contact.findMany({ where, include: { lists: { select: { id: true, name: true } }, tags: { include: { tag: { select: { name: true, color: true } } } }, _count: { select: { campaignLinks: true } }, }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }), prisma.contact.count({ where })]);
  return NextResponse.json({ contacts, total, page, limit, pages: Math.ceil(total / limit) });
});

export const POST = withDatabaseErrors(async (request: Request) => {
  try {
    const auth = await getCurrentAuth();
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const parsed = contactSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const body = parsed.data;
    if (body.listId && !await prisma.contactList.findFirst({ where: { id: body.listId, workspaceId: auth.workspace.id }, select: { id: true } })) return NextResponse.json({ error: "Contact list not found" }, { status: 404 });
    try { await checkContactLimit(auth.workspace.id); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    const parts = body.name?.trim().split(/\s+/) ?? [];
    const contact = await prisma.contact.create({ data: { workspaceId: auth.workspace.id, createdById: auth.user.id, email, firstName: parts[0] || null, lastName: parts.slice(1).join(" ") || null, company: body.company?.trim() || null, website: body.website?.trim() || null, customFields: body.customFields ?? undefined, lists: body.listId ? { connect: { id: body.listId } } : undefined } });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A contact with that email already exists in this workspace" }, { status: 409 });
    throw error;
  }
});
