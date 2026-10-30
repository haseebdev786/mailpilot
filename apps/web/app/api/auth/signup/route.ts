import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, SESSION_COOKIE_NAME, sessionCookieOptions } from "@mailpilot/shared/auth";
import { createAuthToken, isTransactionalMailConfigured, sendTransactionalEmail, verificationUrl } from "@mailpilot/shared/auth-tokens";
import { ensurePlans } from "@mailpilot/shared/billing";
import { checkRateLimit, clientIp } from "@mailpilot/shared/rate-limit";
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
    const signupLimit = await checkRateLimit(`signup:${clientIp(request)}`, 20, 3600);
    if (!signupLimit.allowed) return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });

    const passwordHash = await hashPassword(input.password);
    await ensurePlans();
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash } });
      const baseSlug = slugify(`${input.name}-${email.split("@")[0]}`);
      const workspace = await tx.workspace.create({ data: { name: `${input.name}'s workspace`, slug: `${baseSlug}-${user.id.slice(-6)}`, ownerId: user.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
      const plan = await tx.plan.findUniqueOrThrow({ where: { code: "free" } });
      await tx.subscription.create({ data: { workspaceId: workspace.id, planId: plan.id, status: "TRIALING" } });
      return user;
    });

    const verificationToken = await createAuthToken(created.id, "EMAIL_VERIFICATION", 24);
    const emailSent = await sendTransactionalEmail({
      to: email,
      subject: "Verify your MailPilot email",
      text: `Verify your MailPilot account by opening this link (valid for 24 hours): ${verificationUrl(verificationToken)}`,
      html: `<p>Verify your MailPilot account by opening this link (valid for 24 hours):</p><p><a href="${verificationUrl(verificationToken)}">Verify email</a></p>`
    });
    // EMAIL_VERIFICATION_REQUIRED=true is the public-launch setting: no session
    // is issued until the address is verified. The default (false) keeps the
    // existing local/demo behaviour, where verification is offered, not forced.
    if (process.env.EMAIL_VERIFICATION_REQUIRED === "true") {
      logger.info("user_signed_up_verification_pending", { userId: created.id });
      return NextResponse.json({ ok: true, requiresVerification: true, sessionCreated: false, emailSent, transactionalMailConfigured: isTransactionalMailConfigured(), ...(process.env.NODE_ENV !== "production" ? { devToken: verificationToken } : {}) }, { status: 201 });
    }
    const session = await createSession(created.id);
    const response = NextResponse.json({ ok: true, requiresVerification: true, sessionCreated: true, emailSent, transactionalMailConfigured: isTransactionalMailConfigured(), ...(process.env.NODE_ENV !== "production" ? { devToken: verificationToken } : {}) }, { status: 201 });
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
