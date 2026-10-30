import crypto from "node:crypto";
import { escapeHtml } from "./email-content";

function signingKey() {
  const key = process.env.UNSUBSCRIBE_SIGNING_KEY || process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("An unsubscribe signing key is required");
  return key;
}
export function createUnsubscribeToken(workspaceId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ workspaceId, email: email.trim().toLowerCase() })).toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyUnsubscribeToken(token: string): { workspaceId: string; email: string } | null {
  try {
    if (token.length > 2000) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = crypto.createHmac("sha256", signingKey()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.workspaceId !== "string" || !data.workspaceId || typeof data.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return null;
    return { workspaceId: data.workspaceId, email: data.email };
  } catch { return null; }
}
export function unsubscribeUrl(workspaceId: string, email: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(workspaceId, email))}`;
}
export function complianceFooter(input: { workspaceId: string; businessName?: string | null; address?: string | null; email: string }) {
  const url = unsubscribeUrl(input.workspaceId, input.email);
  const oneClickUrl = url.replace("/unsubscribe?", "/api/unsubscribe?");
  const text = `\n\n${input.businessName || "Our team"}${input.address ? `\n${input.address}` : ""}\nUnsubscribe: ${url}`;
  const html = `<hr><p style="font-size:12px;color:#666">${escapeHtml(input.businessName || "Our team")}${input.address ? `<br>${escapeHtml(input.address)}` : ""}<br><a href="${escapeHtml(url)}">Unsubscribe</a></p>`;
  return { text, html, url, oneClickUrl };
}
export function isUnsubscribeReply(text: string) { return /\b(stop|remove me|unsubscribe|opt out|do not contact)\b/i.test(text); }
