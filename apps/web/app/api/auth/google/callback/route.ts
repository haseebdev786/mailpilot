import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE_NAME, sessionCookieOptions } from "@mailpilot/shared/auth";
import { prisma } from "@mailpilot/shared/db";
import { encryptSecret } from "@mailpilot/shared/crypto";
import { logger } from "@mailpilot/shared/logger";

function safeRedirect(request: Request, path: string) {
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  return new URL(path, origin);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const nonce = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("mailpilot_google_nonce="))?.split("=").slice(1).join("=");
  if (!code || !state || !nonce) return NextResponse.redirect(safeRedirect(request, "/login?error=google_state"));

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { nonce?: string; redirect?: string };
    if (!stateData.nonce || stateData.nonce.length !== nonce.length || !crypto.timingSafeEqual(Buffer.from(stateData.nonce), Buffer.from(nonce))) throw new Error("Invalid OAuth state");
    const callback = process.env.GOOGLE_CALLBACK_URL ?? new URL("/api/auth/google/callback", request.url).toString();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: callback, grant_type: "authorization_code" }) });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };
    if (!tokens.id_token) throw new Error("Google did not return an ID token");
    const identityResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    if (!identityResponse.ok) throw new Error("Google ID token validation failed");
    const identity = await identityResponse.json() as { sub?: string; email?: string; email_verified?: string; nonce?: string; aud?: string; iss?: string; exp?: string };
    if (identity.aud !== process.env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(identity.iss ?? "") || Number(identity.exp ?? 0) <= Date.now() / 1000 || identity.nonce !== stateData.nonce || identity.email_verified !== "true" || !identity.sub || !identity.email) throw new Error("Google identity is not verified");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error("Google profile lookup failed");
    const profile = await profileResponse.json() as { sub: string; email: string; name?: string; picture?: string };
    if (!profile.email || profile.email.toLowerCase() !== identity.email.toLowerCase() || profile.sub !== identity.sub) throw new Error("Google profile mismatch");

    const existingAccount = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } }, include: { user: true } });
    const user = existingAccount?.user ?? await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
    const resolvedUser = user ?? await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: profile.email.toLowerCase(), name: profile.name ?? "Google user", avatarUrl: profile.picture, emailVerifiedAt: new Date() } });
      const workspace = await tx.workspace.create({ data: { name: `${created.name ?? "Google user"}'s workspace`, slug: `workspace-${created.id.slice(-8)}`, ownerId: created.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "OWNER" } });
      const plan = await tx.plan.upsert({ where: { code: "free" }, update: {}, create: { code: "free", name: "Free", maxMailboxes: 1, maxContacts: 1000, maxActiveCampaigns: 1 } });
      await tx.subscription.create({ data: { workspaceId: workspace.id, planId: plan.id, status: "TRIALING" } });
      return created;
    });
    await prisma.account.upsert({ where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } }, update: { userId: resolvedUser.id, accessToken: encryptSecret(tokens.access_token), refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined, expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined }, create: { userId: resolvedUser.id, provider: "GOOGLE", providerAccountId: profile.sub, accessToken: encryptSecret(tokens.access_token), refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined, expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined } });
    const session = await createSession(resolvedUser.id);
    const response = NextResponse.redirect(safeRedirect(request, "/dashboard"));
    response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set("mailpilot_google_nonce", "", { httpOnly: true, secure: callback.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 0 });
    logger.info("google_login_succeeded", { userId: resolvedUser.id });
    return response;
  } catch (error) {
    logger.error("google_login_failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.redirect(safeRedirect(request, "/login?error=google_failed"));
  }
}
