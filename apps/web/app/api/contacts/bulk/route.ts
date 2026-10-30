import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000), action: z.enum(["status", "delete"]), status: z.enum(["new", "contacted", "followed_up", "replied", "interested", "not_interested", "unsubscribed", "bounced"]).optional() });
export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose contacts and a valid action" }, { status: 400 });
  const body = parsed.data;
  const where = { id: { in: [...new Set(body.ids)] }, workspaceId: auth.workspace.id };
  if (body.action === "delete") return NextResponse.json(await prisma.contact.deleteMany({ where }));
  if (!body.status) return NextResponse.json({ error: "Status is required" }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    if (["unsubscribed", "bounced", "not_interested"].includes(body.status!)) {
      const contacts = await tx.contact.findMany({ where, select: { email: true } });
      for (const contact of contacts) await tx.suppressionList.upsert({ where: { workspaceId_email: { workspaceId: auth.workspace.id, email: contact.email } }, update: {}, create: { workspaceId: auth.workspace.id, email: contact.email, reason: body.status!, source: "manual" } });
    }
    return tx.contact.updateMany({ where, data: { status: body.status } });
  });
  return NextResponse.json(result);
}
