import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthToken, isTransactionalMailConfigured, sendTransactionalEmail, verificationUrl } from "@mailpilot/shared/auth-tokens";
import { checkRateLimit, clientIp } from "@mailpilot/shared/rate-limit";
import { prisma } from "@mailpilot/shared/db";

const schema = z.object({ email: z.string().trim().email().max(160) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const limit = await checkRateLimit(`verify-resend:${clientIp(request)}:${email}`, 5, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  // Same response whether or not the account exists or is already verified.
  if (!user || user.emailVerifiedAt) return NextResponse.json({ ok: true });
  const token = await createAuthToken(user.id, "EMAIL_VERIFICATION", 24);
  const sent = await sendTransactionalEmail({
    to: email,
    subject: "Verify your MailPilot email",
    text: `Verify your MailPilot account by opening this link (valid for 24 hours): ${verificationUrl(token)}`,
    html: `<p>Verify your MailPilot account by opening this link (valid for 24 hours):</p><p><a href="${verificationUrl(token)}">Verify email</a></p>`
  });
  return NextResponse.json({ ok: true, emailSent: sent, transactionalMailConfigured: isTransactionalMailConfigured(), ...(process.env.NODE_ENV !== "production" ? { devToken: token } : {}) });
}
