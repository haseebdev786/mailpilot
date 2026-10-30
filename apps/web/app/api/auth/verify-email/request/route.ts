import { NextResponse } from "next/server";
import { createAuthToken, isTransactionalMailConfigured, sendTransactionalEmail, verificationUrl } from "@mailpilot/shared/auth-tokens";
import { checkRateLimit, clientIp } from "@mailpilot/shared/rate-limit";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const limit = await checkRateLimit(`verify-request:${clientIp(request)}:${auth.user.id}`, 5, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many verification requests. Try again later." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { email: true, emailVerifiedAt: true } });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  const token = await createAuthToken(auth.user.id, "EMAIL_VERIFICATION", 24);
  const sent = await sendTransactionalEmail({
    to: user.email,
    subject: "Verify your MailPilot email",
    text: `Verify your MailPilot account by opening this link (valid for 24 hours): ${verificationUrl(token)}`,
    html: `<p>Verify your MailPilot account by opening this link (valid for 24 hours):</p><p><a href="${verificationUrl(token)}">Verify email</a></p>`
  });
  // In development the token is returned so the flow can be tested without a
  // transactional mail provider. It is never returned in production.
  return NextResponse.json({ ok: true, emailSent: sent, transactionalMailConfigured: isTransactionalMailConfigured(), ...(process.env.NODE_ENV !== "production" ? { devToken: token } : {}) });
}
