import crypto from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callback = process.env.GOOGLE_CALLBACK_URL ?? new URL("/api/auth/google/callback", request.url).toString();
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/login?error=google_unconfigured", request.url));
  const nonce = crypto.randomBytes(24).toString("base64url");
  const state = Buffer.from(JSON.stringify({ nonce, redirect: "/dashboard" })).toString("base64url");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "openid email profile", access_type: "offline", prompt: "consent", state, nonce });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("mailpilot_google_nonce", nonce, { httpOnly: true, secure: callback.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
