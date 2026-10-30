import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildMailboxOAuthUrl } from "@mailpilot/shared/oauth-mail";
import { getCurrentAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.redirect(new URL("/login", request.url));
  const nonce = crypto.randomBytes(24).toString("base64url");
  const state = Buffer.from(JSON.stringify({ nonce })).toString("base64url");
  const url = buildMailboxOAuthUrl("MICROSOFT", state, request.url);
  if (!url) return NextResponse.redirect(new URL("/mailboxes?error=oauth_unconfigured", request.url));
  const response = NextResponse.redirect(url);
  response.cookies.set("mailpilot_oauth_nonce", nonce, { httpOnly: true, secure: new URL(request.url).protocol === "https:" || (process.env.APP_URL ?? "").startsWith("https://"), sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
