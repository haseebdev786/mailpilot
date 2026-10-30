import crypto from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./db";
import { retryDatabaseRead } from "./database-errors";
import { logger } from "./logger";

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE_NAME = "webdev_app_session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
};

export type AuthContext = {
  user: SessionUser;
  workspace: { id: string; name: string; slug: string };
  role: "OWNER" | "ADMIN" | "MEMBER";
  sessionId: string;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, stored] = encoded.split(":");
  if (!salt || !stored) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

const pendingSessions = new Map<string, Promise<AuthContext | null>>();

export async function getAuthContext(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const hash = tokenHash(token);
  const pending = pendingSessions.get(hash);
  if (pending) return pending;
  const lookup = loadAuthContext(hash);
  pendingSessions.set(hash, lookup);
  try { return await lookup; } finally { pendingSessions.delete(hash); }
}

async function loadAuthContext(hash: string): Promise<AuthContext | null> {
  const session = await retryDatabaseRead(() => prisma.session.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        select: { id: true, email: true, name: true, avatarUrl: true, emailVerifiedAt: true, memberships: {
          include: { workspace: { select: { id: true, name: true, slug: true, ownerId: true } } },
          orderBy: { createdAt: "asc" },
          take: 1
        } }
      }
    }
  }));
  if (!session || session.expiresAt <= new Date() || !session.user.memberships[0]) return null;
  const seenBefore = new Date(Date.now() - 15 * 60 * 1000);
  if (session.lastSeenAt < seenBefore) {
    // Telemetry is not an authentication requirement; don't reject a valid
    // session because its activity timestamp could not be refreshed.
    await prisma.session.updateMany({ where: { id: session.id, lastSeenAt: { lt: seenBefore } }, data: { lastSeenAt: new Date() } })
      .catch(() => logger.warn("session_activity_update_failed"));
  }
  const membership = session.user.memberships[0];
  return {
    user: session.user,
    workspace: membership.workspace,
    role: membership.role,
    sessionId: session.id
  };
}

function isHttpsContext(request?: Request) {
  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProto === "https" || process.env.APP_URL?.startsWith("https://") || process.env.PUBLIC_APP_URL?.startsWith("https://");
}

export function sessionCookieOptions(expiresAt: Date, request?: Request) {
  const httpsContext = isHttpsContext(request);
  return {
    httpOnly: true,
    secure: Boolean(httpsContext),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt
  };
}

export function clearCookieOptions(request?: Request) {
  const httpsContext = isHttpsContext(request);
  return { httpOnly: true, secure: Boolean(httpsContext), sameSite: "lax" as const, path: "/" };
}
