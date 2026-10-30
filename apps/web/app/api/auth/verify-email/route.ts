import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, SESSION_COOKIE_NAME, sessionCookieOptions } from "@mailpilot/shared/auth";
import { consumeAuthToken } from "@mailpilot/shared/auth-tokens";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";

const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A verification token is required." }, { status: 400 });
  const userId = await consumeAuthToken(parsed.data.token, "EMAIL_VERIFICATION");
  if (!userId) return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  const session = await createSession(userId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt, request));
  logger.info("email_verified", { userId });
  return response;
}
