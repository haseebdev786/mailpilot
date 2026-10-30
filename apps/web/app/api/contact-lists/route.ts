import { withDatabaseErrors } from "@/lib/database-response";
import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const GET = withDatabaseErrors(async () => {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const lists = await prisma.contactList.findMany({ where: { workspaceId: auth.workspace.id }, include: { _count: { select: { contacts: true } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ lists: lists.map((list) => ({ id: list.id, name: list.name, description: list.description, count: list._count.contacts })) });
});

export const POST = withDatabaseErrors(async (request: Request) => {
  try {
    const auth = await getCurrentAuth();
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { name?: string; description?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120 || (body.description != null && (typeof body.description !== "string" || body.description.length > 2000))) return NextResponse.json({ error: "Enter a list name of 1–120 characters and a description under 2,000 characters" }, { status: 400 });
    const list = await prisma.contactList.create({ data: { workspaceId: auth.workspace.id, name, description: body.description?.trim() || null } });
    return NextResponse.json({ list }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A list with that name already exists. Choose it in the contact form below, or use another name." }, { status: 409 });
    throw error;
  }
});
