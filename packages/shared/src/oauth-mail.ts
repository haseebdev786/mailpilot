import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { logger } from "./logger";

export type OAuthMailboxProvider = "GOOGLE" | "MICROSOFT";

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  callbackPath: string;
};

export function getOAuthMailConfig(provider: OAuthMailboxProvider): OAuthConfig | null {
  if (provider === "GOOGLE") {
    const clientId = process.env.GOOGLE_MAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      // mail.google.com is the scope Gmail requires for IMAP/SMTP (XOAUTH2).
      scopes: ["https://mail.google.com/"],
      callbackPath: "/api/mailboxes/oauth/google/callback"
    };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["https://outlook.office365.com/IMAP.AccessAsUser.All", "https://outlook.office365.com/SMTP.Send", "offline_access", "openid", "email", "profile"],
    callbackPath: "/api/mailboxes/oauth/microsoft/callback"
  };
}

export function oauthCallbackUrl(provider: OAuthMailboxProvider, requestUrl?: string): string {
  const config = getOAuthMailConfig(provider);
  const configured = provider === "GOOGLE" ? process.env.GOOGLE_MAIL_CALLBACK_URL : process.env.MICROSOFT_CALLBACK_URL;
  if (configured) return configured;
  const base = (process.env.APP_URL ?? (requestUrl ? new URL(requestUrl).origin : "http://localhost:3000")).replace(/\/$/, "");
  return `${base}${config?.callbackPath ?? ""}`;
}

export function buildMailboxOAuthUrl(provider: OAuthMailboxProvider, state: string, requestUrl?: string): string | null {
  const config = getOAuthMailConfig(provider);
  if (!config) return null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: oauthCallbackUrl(provider, requestUrl),
    response_type: "code",
    scope: config.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `${config.authUrl}?${params.toString()}`;
}

export type ExchangedMailboxTokens = {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

export async function exchangeMailboxOAuthCode(provider: OAuthMailboxProvider, code: string, redirectUri: string): Promise<ExchangedMailboxTokens> {
  const config = getOAuthMailConfig(provider);
  if (!config) throw new Error("Mailbox OAuth is not configured");
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!tokenResponse.ok) throw new Error(`${provider} token exchange failed`);
  const tokens = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokens.access_token) throw new Error(`${provider} did not return an access token`);
  let email = "";
  if (provider === "GOOGLE") {
    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!profile.ok) throw new Error("Google profile lookup failed");
    const data = (await profile.json()) as { email?: string };
    email = (data.email ?? "").toLowerCase();
  } else {
    const profile = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!profile.ok) throw new Error("Microsoft profile lookup failed");
    const data = (await profile.json()) as { mail?: string; userPrincipalName?: string };
    email = (data.mail ?? data.userPrincipalName ?? "").toLowerCase();
  }
  if (!email) throw new Error("Mailbox provider did not return an email address");
  return {
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    scope: tokens.scope ?? config.scopes.join(" ")
  };
}

/** Returns a fresh access token, refreshing (and persisting) it when needed. */
export async function refreshMailboxAccessToken(mailbox: {
  id: string;
  provider: string;
  oauthAccessTokenEncrypted: string | null;
  oauthTokenExpiresAt: Date | null;
  oauthRefreshTokenEncrypted: string | null;
}): Promise<string> {
  if (mailbox.oauthAccessTokenEncrypted && mailbox.oauthTokenExpiresAt && mailbox.oauthTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decryptSecret(mailbox.oauthAccessTokenEncrypted);
  }
  if (mailbox.provider !== "GOOGLE" && mailbox.provider !== "MICROSOFT") throw new Error("Mailbox is not an OAuth mailbox");
  if (!mailbox.oauthRefreshTokenEncrypted) throw new Error("Mailbox OAuth refresh token is missing. Reconnect the mailbox.");
  const config = getOAuthMailConfig(mailbox.provider);
  if (!config) throw new Error("Mailbox OAuth is not configured");
  const refreshToken = decryptSecret(mailbox.oauthRefreshTokenEncrypted);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    logger.error("oauth_refresh_failed", { mailboxId: mailbox.id, provider: mailbox.provider });
    throw new Error("Mailbox OAuth refresh failed. Reconnect the mailbox.");
  }
  const tokens = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!tokens.access_token) throw new Error("Mailbox OAuth refresh returned no access token");
  await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: {
      oauthAccessTokenEncrypted: encryptSecret(tokens.access_token),
      oauthTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ...(tokens.refresh_token ? { oauthRefreshTokenEncrypted: encryptSecret(tokens.refresh_token) } : {})
    }
  });
  return tokens.access_token;
}

export function oauthMailboxHosts(provider: string): { smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number; imapSecure: boolean } {
  if (provider === "MICROSOFT") return { smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true };
  return { smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false, imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true };
}
