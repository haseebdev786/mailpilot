import nodemailer from "nodemailer";
import { createTokenPair, hashAuthToken } from "./token-pairs";
export { createTokenPair, hashAuthToken };
import { prisma } from "./db";
import { logger } from "./logger";

export type AuthTokenType = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export async function createAuthToken(userId: string, type: AuthTokenType, ttlHours: number): Promise<string> {
  const { token, tokenHash } = createTokenPair();
  // A user should only have one live token of each kind at a time.
  await prisma.authToken.deleteMany({ where: { userId, type, consumedAt: null } });
  await prisma.authToken.create({
    data: { userId, type, tokenHash, expiresAt: new Date(Date.now() + ttlHours * 3_600_000) }
  });
  return token;
}

export async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string | null> {
  const tokenHash = hashAuthToken(token);
  const record = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!record || record.type !== type || record.consumedAt || record.expiresAt <= new Date()) return null;
  await prisma.authToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return record.userId;
}

/** Returns true only when a transactional SMTP sender is actually configured. */
export function isTransactionalMailConfigured(): boolean {
  return Boolean(process.env.TRANSACTIONAL_SMTP_HOST && process.env.TRANSACTIONAL_SMTP_USER && process.env.TRANSACTIONAL_SMTP_PASS && process.env.MAIL_FROM);
}

export async function sendTransactionalEmail(input: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!isTransactionalMailConfigured()) {
    logger.warn("transactional_mail_unconfigured", { to: input.to });
    return false;
  }
  try {
    const transport = nodemailer.createTransport({
      host: process.env.TRANSACTIONAL_SMTP_HOST,
      port: Number(process.env.TRANSACTIONAL_SMTP_PORT ?? 587),
      secure: Number(process.env.TRANSACTIONAL_SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.TRANSACTIONAL_SMTP_USER, pass: process.env.TRANSACTIONAL_SMTP_PASS }
    });
    await transport.sendMail({ from: process.env.MAIL_FROM, to: input.to, subject: input.subject, text: input.text, html: input.html });
    transport.close();
    return true;
  } catch (error) {
    logger.error("transactional_mail_failed", { error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

export function verificationUrl(token: string): string {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

export function resetUrl(token: string): string {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}
