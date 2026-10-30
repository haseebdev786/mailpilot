import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, SESSION_COOKIE_NAME, sessionCookieOptions } from "@mailpilot/shared/auth";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128)
});

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "workspace";
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });

    const passwordHash = await hashPassword(input.password);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash } });
      const baseSlug = slugify(`${input.name}-${email.split("@")[0]}`);
      const workspace = await tx.workspace.create({ data: { name: `${input.name}'s workspace`, slug: `${baseSlug}-${user.id.slice(-6)}`, ownerId: user.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
      const plan = await tx.plan.upsert({ where: { code: "free" }, update: {}, create: { code: "free", name: "Free", description: "A focused starting point for testing outreach", maxMailboxes: 1, maxContacts: 1000, maxActiveCampaigns: 1 } });
      await tx.subscription.create({ data: { workspaceId: workspace.id, planId: plan.id, status: "TRIALING" } });
      return user;
    });

    const session = await createSession(created.id);
    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt, request));
    logger.info("user_signed_up", { userId: created.id });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      const message = firstIssue?.message || "Invalid input provided.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "unknown";
    logger.error("signup_failed", { error: message });
    return NextResponse.json({ error: "Unable to create the account right now. Please try again." }, { status: 400 });
  }
}
