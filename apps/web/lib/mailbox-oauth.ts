import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { encryptSecret } from "@mailpilot/shared/crypto";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";
import { exchangeMailboxOAuthCode, oauthCallbackUrl, oauthMailboxHosts, type OAuthMailboxProvider } from "@mailpilot/shared/oauth-mail";
import { checkMailboxLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { testMailboxConnection } from "@mailpilot/shared/mail";
import { getCurrentAuth } from "@/lib/auth";

export async function handleMailboxOAuthCallback(provider: OAuthMailboxProvider, request: Request): Promise<NextResponse> {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.redirect(new URL("/login", request.url));
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const nonce = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("mailpilot_oauth_nonce="))?.split("=").slice(1).join("=");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/mailboxes?error=${reason}`, request.url));
  if (!code || !state || !nonce) return fail("oauth_state");
  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { nonce?: string };
    if (!stateData.nonce || stateData.nonce.length !== nonce.length || !crypto.timingSafeEqual(Buffer.from(stateData.nonce), Buffer.from(nonce))) throw new Error("Invalid OAuth state");
    const tokens = await exchangeMailboxOAuthCode(provider, code, oauthCallbackUrl(provider, request.url));
    await checkMailboxLimit(auth.workspace.id);
    const hosts = oauthMailboxHosts(provider);
    const mailbox = await prisma.mailbox.upsert({
      where: { workspaceId_email: { workspaceId: auth.workspace.id, email: tokens.email } },
      update: {
        provider,
        smtpHost: hosts.smtpHost, smtpPort: hosts.smtpPort, smtpSecure: hosts.smtpSecure, smtpUsername: tokens.email,
        imapHost: hosts.imapHost, imapPort: hosts.imapPort, imapSecure: hosts.imapSecure, imapUsername: tokens.email,
        oauthAccessTokenEncrypted: encryptSecret(tokens.accessToken),
        oauthTokenExpiresAt: tokens.expiresAt,
        oauthScope: tokens.scope,
        ...(tokens.refreshToken ? { oauthRefreshTokenEncrypted: encryptSecret(tokens.refreshToken) } : {})
      },
      create: {
        workspaceId: auth.workspace.id, name: `${provider === "GOOGLE" ? "Gmail" : "Outlook"} · ${tokens.email}`, email: tokens.email, provider,
        smtpHost: hosts.smtpHost, smtpPort: hosts.smtpPort, smtpSecure: hosts.smtpSecure, smtpUsername: tokens.email,
        imapHost: hosts.imapHost, imapPort: hosts.imapPort, imapSecure: hosts.imapSecure, imapUsername: tokens.email,
        oauthAccessTokenEncrypted: encryptSecret(tokens.accessToken),
        oauthTokenExpiresAt: tokens.expiresAt,
        oauthScope: tokens.scope,
        ...(tokens.refreshToken ? { oauthRefreshTokenEncrypted: encryptSecret(tokens.refreshToken) } : {})
      }
    });
    // Validate with the fresh access token (XOAUTH2), falling back to SMTP/IMAP
    // credentials if the provider ever rejects OAuth for this account.
    try {
      await testMailboxConnection({
        smtpHost: hosts.smtpHost, smtpPort: hosts.smtpPort, smtpSecure: hosts.smtpSecure, smtpUsername: tokens.email, smtpPassword: "",
        imapHost: hosts.imapHost, imapPort: hosts.imapPort, imapSecure: hosts.imapSecure, imapUsername: tokens.email, imapPassword: "",
        oauthAccessToken: tokens.accessToken
      });
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { healthStatus: "CONNECTED", healthError: null, lastTestedAt: new Date() } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { healthStatus: "ERROR", healthError: message.slice(0, 500), lastTestedAt: new Date() } });
    }
    const response = NextResponse.redirect(new URL("/mailboxes?oauth=connected", request.url));
    response.cookies.set("mailpilot_oauth_nonce", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof PlanLimitError) return fail("plan_limit");
    logger.error("mailbox_oauth_failed", { provider, error: error instanceof Error ? error.message : "unknown" });
    return fail("oauth_failed");
  }
}
