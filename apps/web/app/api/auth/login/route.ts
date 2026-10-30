import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword, SESSION_COOKIE_NAME, sessionCookieOptions } from "@mailpilot/shared/auth";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";
import { DEMO_EMAIL, isDemoLoginEnabled } from "@mailpilot/shared/demo";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (input.email.toLowerCase() === DEMO_EMAIL && !isDemoLoginEnabled()) {
      return NextResponse.json({ error: "Demo login is disabled." }, { status: 403 });
    }
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt, request));
    logger.info("user_logged_in", { userId: user.id });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      const message = firstIssue?.message || "Invalid email or password.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "unknown";
    logger.error("login_failed", { error: message });
    return NextResponse.json({ error: "Unable to log in right now. Please try again." }, { status: 400 });
  }
}
