import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";

const text = z.string().max(10000).nullish().transform((value) => value ?? "");
const price = z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().finite().nonnegative().max(9999999999).nullable());
const schema = z.object({
  name: z.string().trim().min(1).max(120).default("Primary knowledge base"),
  description: z.string().max(500).nullish().transform((value) => value ?? ""),
  content: text, aboutMe: text, services: text, pastWork: text, faqs: text, packages: text, allowedDiscount: text, timelines: text, paymentTerms: text,
  pricingMin: price, pricingMax: price, isActive: z.boolean().default(true)
}).refine((input) => input.pricingMin === null || input.pricingMax === null || input.pricingMin <= input.pricingMax, "Maximum price must be at least the minimum price");

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const knowledge = await prisma.knowledgeBase.findFirst({ where: { workspaceId: auth.workspace.id }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ knowledge });
}
export async function PUT(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0].message }, { status: 400 });
  const existing = await prisma.knowledgeBase.findFirst({ where: { workspaceId: auth.workspace.id }, orderBy: { updatedAt: "desc" } });
  const knowledge = existing ? await prisma.knowledgeBase.update({ where: { id: existing.id }, data: input.data }) : await prisma.knowledgeBase.upsert({ where: { workspaceId_name: { workspaceId: auth.workspace.id, name: input.data.name } }, update: input.data, create: { workspaceId: auth.workspace.id, ...input.data } });
  return NextResponse.json({ knowledge });
}
