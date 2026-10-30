import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthToken, isTransactionalMailConfigured, resetUrl, sendTransactionalEmail } from "@mailpilot/shared/auth-tokens";
import { checkRateLimit, clientIp } from "@mailpilot/shared/rate-limit";
import { prisma } from "@mailpilot/shared/db";

const schema = z.object({ email: z.string().trim().email().max(160) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const limit = await checkRateLimit(`forgot-password:${clientIp(request)}:${email}`, 5, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many reset requests. Try again later." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  // Always return the same response so account existence is not leaked.
  if (!user) return NextResponse.json({ ok: true });
  const token = await createAuthToken(user.id, "PASSWORD_RESET", 1);
  const sent = await sendTransactionalEmail({
    to: email,
    subject: "Reset your MailPilot password",
    text: `Reset your MailPilot password by opening this link (valid for 1 hour): ${resetUrl(token)} If you did not request this, ignore this email.`,
    html: `<p>Reset your MailPilot password by opening this link (valid for 1 hour):</p><p><a href="${resetUrl(token)}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`
  });
  return NextResponse.json({ ok: true, emailSent: sent, transactionalMailConfigured: isTransactionalMailConfigured(), ...(process.env.NODE_ENV !== "production" ? { devToken: token } : {}) });
}
