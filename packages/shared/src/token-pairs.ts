import crypto from "node:crypto";

/** Pure token-pair helpers, kept separate from the database-backed token store so they stay unit-testable. */
export function createTokenPair(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashAuthToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
