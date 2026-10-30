import { NextResponse } from "next/server";
import {
  createSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions
} from "@mailpilot/shared/auth";
import { ensureDemoAccount, isDemoLoginEnabled } from "@mailpilot/shared/demo";
import { logger } from "@mailpilot/shared/logger";

/** One-click demo session. Only enabled in development or with DEMO_LOGIN_ENABLED=true. */
export async function POST(request: Request) {
  if (!isDemoLoginEnabled()) {
    return NextResponse.json({ error: "Demo login is disabled. Set DEMO_LOGIN_ENABLED=true in .env to enable it." }, { status: 403 });
  }

  try {
    const { user } = await ensureDemoAccount();
    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt, request));
    logger.info("demo_logged_in", { userId: user.id });
    return response;
  } catch (error) {
    logger.error("demo_login_failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(
      { error: "Unable to start the demo session. Make sure PostgreSQL is running and migrations were applied." },
      { status: 500 }
    );
  }
}
