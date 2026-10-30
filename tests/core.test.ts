import assert from "node:assert/strict";
import { normalizeDatabaseUrl } from "../packages/shared/src/database-connection";
import { retryDatabaseRead } from "../packages/shared/src/database-errors";
import { withDatabaseErrors } from "../apps/web/lib/database-response";
import { isTrustedMutation } from "../apps/web/lib/request-origin";
import { test } from "node:test";
import { createUnsubscribeToken, verifyUnsubscribeToken, complianceFooter } from "../packages/shared/src/compliance";
import { textToHtml, renderTemplate } from "../packages/shared/src/email-content";
import { sendingWindowDelay, mailboxSendLimit } from "../packages/shared/src/sending-policy";
import { campaignSchema } from "../apps/web/lib/campaigns";
import { recommendOutreach } from "../packages/shared/src/recommendations";
import { generatePersonalizedEmail } from "../packages/shared/src/campaign-ai";
import { analyzeReply, extractReplyText } from "../packages/shared/src/reply-ai";
import dns from "node:dns/promises";
import { isPublicMailAddress, resolveMailServer } from "../packages/shared/src/mail-network";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.UNSUBSCRIBE_SIGNING_KEY = "test-signing-key";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.AI_PROVIDER = "openai";
process.env.APP_URL = "https://mailpilot.example";
process.env.ALLOW_PRIVATE_MAIL_SERVERS = "false";

test("Neon pool settings are bounded, keep credentials, and respect explicit overrides", () => {
  const url = new URL(normalizeDatabaseUrl("postgresql://user:password@ep-test-pooler.region.neon.tech/db?channel_binding=require")!);
  assert.equal(url.username, "user"); assert.equal(url.password, "password");
  assert.equal(url.searchParams.get("connection_limit"), "5");
  assert.equal(url.searchParams.get("pool_timeout"), "30");
  assert.equal(url.searchParams.get("connect_timeout"), "20");
  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.searchParams.has("channel_binding"), false);
  const custom = new URL(normalizeDatabaseUrl("postgresql://user:pass@ep-test.neon.tech/db?connection_limit=2&pool_timeout=45")!);
  assert.equal(custom.searchParams.get("connection_limit"), "2"); assert.equal(custom.searchParams.get("pool_timeout"), "45");
  const local = new URL(normalizeDatabaseUrl("postgresql://user:pass@localhost:5432/db")!);
  assert.equal(local.searchParams.has("connection_limit"), false);
});

test("read recovery retries one closed connection but never amplifies pool exhaustion", async () => {
  let calls = 0;
  assert.equal(await retryDatabaseRead(async () => { if (++calls === 1) throw { code: "P1017" }; return "recovered"; }), "recovered");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(retryDatabaseRead(async () => { calls++; throw { code: "P2024" }; }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retryDatabaseRead(async () => { calls++; throw { code: "P1017" }; }));
  assert.equal(calls, 2);
});

test("database failures during authentication return 503 JSON without leaking error details", async () => {
  const response = await withDatabaseErrors(async () => { throw { code: "P2024", message: "private database details" }; })();
  assert.equal(response.status, 503); assert.equal(response.headers.get("Retry-After"), "3");
  const data = await response.json(); assert.equal(data.code, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(data).includes("private database details"), false);
  await assert.rejects(withDatabaseErrors(async () => { throw new Error("Programming error"); })(), /Programming error/);
});

test("concurrent session checks share only the in-flight read and avoid per-request writes", async (t) => {
  const { prisma } = await import("../packages/shared/src/db");
  const { getAuthContext } = await import("../packages/shared/src/auth");
  const session = { id: "test-session", expiresAt: new Date(Date.now() + 60000), lastSeenAt: new Date(), user: { id: "test-user", name: "Test", email: "test@example.test", avatarUrl: null, memberships: [{ role: "OWNER", workspace: { id: "test-workspace", name: "Test", slug: "test" } }] } };
  const original = prisma.session;
  const read = t.mock.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return session; });
  const update = t.mock.fn(async () => ({ count: 1 }));
  Object.defineProperty(prisma, "session", { configurable: true, value: { findUnique: read, updateMany: update } });
  t.after(() => Object.defineProperty(prisma, "session", { configurable: true, value: original }));
  const results = await Promise.all(Array.from({ length: 8 }, () => getAuthContext("test-session-token")));
  assert.ok(results.every((result) => result?.user.id === "test-user"));
  assert.equal(read.mock.callCount(), 1); assert.equal(update.mock.callCount(), 0);
  await getAuthContext("test-session-token"); assert.equal(read.mock.callCount(), 2);
  session.lastSeenAt = new Date(Date.now() - 16 * 60 * 1000);
  await getAuthContext("test-session-token"); assert.equal(update.mock.callCount(), 1);
  session.expiresAt = new Date(0);
  assert.equal(await getAuthContext("test-session-token"), null);
});

test("development accepts same-origin loopback and LAN requests without allowing cross-site mutations", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "192.168.1.50:3000"]) {
    const request = new Request(`http://${host}/api/contact-lists`, { headers: { host, origin: `http://${host}`, "sec-fetch-site": "same-origin" } });
    assert.equal(isTrustedMutation(request, "http://localhost:3000", true), true);
    if (host !== "localhost:3000") assert.equal(isTrustedMutation(request, "http://localhost:3000", false), false);
  }
  assert.equal(isTrustedMutation(new Request("http://localhost:3000/api/contacts", { headers: { host: "localhost:3000", origin: "https://untrusted.example" } }), "http://localhost:3000", true), false);
  assert.equal(isTrustedMutation(new Request("http://localhost:3000/api/contacts", { headers: { origin: "http://localhost:3000", "sec-fetch-site": "cross-site" } }), "http://localhost:3000", true), false);
});

test("mail connections reject private addresses, mapped IPv4, metadata and loopback", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "172.16.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2002:7f00:1::", "not-an-ip"]) assert.equal(isPublicMailAddress(address), false, address);
  assert.equal(isPublicMailAddress("8.8.8.8"), true);
  assert.equal(isPublicMailAddress("2606:4700:4700::1111"), true);
});

test("mail DNS validation rejects mixed public/private answers and pins public addresses", async (t) => {
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
  await assert.rejects(resolveMailServer("smtp.example.test"), /public internet/);
  t.mock.restoreAll();
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  assert.deepEqual(await resolveMailServer("smtp.example.test"), { address: "8.8.8.8", servername: "smtp.example.test" });
});

test("unsubscribe tokens bind both sender workspace and recipient", () => {
  const token = createUnsubscribeToken("workspace-a", "Person@Example.com");
  assert.deepEqual(verifyUnsubscribeToken(token), { workspaceId: "workspace-a", email: "person@example.com" });
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ workspaceId: "workspace-b", email: "person@example.com" })).toString("base64url");
  assert.equal(verifyUnsubscribeToken(`${forged}.${signature}`), null);
  assert.equal(verifyUnsubscribeToken(`${payload}.invalid`), null);
  assert.equal(verifyUnsubscribeToken(`${token}.extra`), null);
});

test("footer uses a POST API URL for one-click and escapes sender content", () => {
  const footer = complianceFooter({ workspaceId: "one", email: "person@example.com", businessName: "<script>bad</script>", address: "A & B" });
  assert.match(footer.oneClickUrl, /^https:\/\/mailpilot.example\/api\/unsubscribe\?token=/);
  assert.match(footer.url, /\/unsubscribe\?token=/);
  assert.ok(!footer.html.includes("<script>"));
  assert.match(footer.html, /A &amp; B/);
});

test("templates personalize as text, then encode HTML", () => {
  const text = renderTemplate("Hi {{firstName}}, a note for {{company}}.", { firstName: "<img src=x>", company: "A & B" });
  assert.equal(text, "Hi <img src=x>, a note for A & B.");
  assert.ok(!textToHtml(text).includes("<img"));
  assert.equal(renderTemplate("Hi {{firstName}} at {{company}}", {}), "Hi there at your team");
});

const policy = { timezone: "Asia/Karachi", sendingStartHour: 9, sendingEndHour: 18, skipWeekends: true };
test("sending windows respect local time, boundaries, and weekends", () => {
  assert.equal(sendingWindowDelay(policy, new Date("2026-10-21T04:00:00Z")), 0);
  assert.equal(sendingWindowDelay(policy, new Date("2026-10-21T03:59:30Z")), 30_000);
  assert.equal(sendingWindowDelay(policy, new Date("2026-10-23T13:00:00Z")), 63 * 3_600_000);
});

test("sending windows handle midnight and daylight saving changes", () => {
  assert.equal(sendingWindowDelay({ ...policy, timezone: "UTC", sendingStartHour: 0, sendingEndHour: 24, skipWeekends: false }, new Date("2026-10-21T00:00:00Z")), 0);
  assert.equal(sendingWindowDelay({ ...policy, timezone: "America/New_York", skipWeekends: false }, new Date("2026-03-08T06:30:00Z")), 6.5 * 3_600_000);
});

test("mailbox warm-up is capped at the configured rolling daily limit", () => {
  const mailbox = { dailySendLimit: 20, warmupEnabled: true, warmupStartPerDay: 5, warmupRampPerDay: 5, createdAt: new Date("2026-10-20T00:00:00Z") };
  assert.equal(mailboxSendLimit(mailbox, new Date("2026-10-20T12:00:00Z")), 5);
  assert.equal(mailboxSendLimit(mailbox, new Date("2026-10-21T00:00:00Z")), 10);
  assert.equal(mailboxSendLimit(mailbox, new Date("2026-11-01T00:00:00Z")), 20);
});

test("campaign validation rejects invalid windows and incomplete templates", () => {
  const valid = { name: "Test", listId: "list", mailboxIds: ["mailbox"], businessDescription: "We build useful websites", services: "Web design" };
  assert.ok(campaignSchema.safeParse(valid).success);
  assert.ok(!campaignSchema.safeParse({ ...valid, timezone: "not/a/timezone" }).success);
  assert.ok(!campaignSchema.safeParse({ ...valid, sendingStartHour: 18, sendingEndHour: 9 }).success);
  assert.ok(!campaignSchema.safeParse({ ...valid, templateSubject: "hello" }).success);
  assert.ok(!campaignSchema.safeParse({ ...valid, templateSubject: "hello\r\nBcc: x", templateText: "test" }).success);
});

test("missing AI configuration returns a clearly marked editable starter", async () => {
  const result = await recommendOutreach({ businessDescription: "I build websites for small businesses.", services: "Website design", audience: "Local businesses", signature: "Haseeb" });
  assert.equal(result.source, "starter");
  assert.equal(result.recommendation.audience, "Local businesses");
  assert.match(result.recommendation.templates[0].text, /Haseeb/);
});

test("AI recommendations validate the provider's structured response", async (t) => {
  process.env.OPENAI_API_KEY = "test-only";
  t.after(() => { process.env.OPENAI_API_KEY = ""; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: JSON.stringify({ businessDescription: "Website design for small teams", audience: "Local retailers", rationale: "A focused audience", tone: "friendly", cta: "Would this help?", templates: [{ name: "Introduction", subject: "A question", text: "Hi {{firstName}}, would website design help your team?" }] }) } }] }));
  const result = await recommendOutreach({ businessDescription: "We design websites", services: "Web design", audience: "", signature: "" });
  assert.equal(result.source, "ai");
  assert.equal(result.recommendation.templates.length, 1);
});

test("AI-provided HTML is discarded in favor of escaped plain text", async (t) => {
  process.env.OPENAI_API_KEY = "test-only";
  t.after(() => { process.env.OPENAI_API_KEY = ""; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: JSON.stringify({ subject: "Hello", text: "Hi <img src=x>, could we talk?", html: "<script>bad()</script>", subjectVariants: ["Hello"] }) } }] }));
  const draft = await generatePersonalizedEmail({ firstName: "A" });
  assert.ok(!draft.html.includes("<script>"));
  assert.ok(!draft.html.includes("<img"));
});

test("explicit opt-outs cannot be overridden by AI", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("AI must not run for an opt-out"); });
  const result = await analyzeReply({ text: "Please unsubscribe me. Your price looks good though." });
  assert.equal(result.classification, "UNSUBSCRIBE");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("quoted unsubscribe footers do not turn interested replies into opt-outs", async () => {
  const reply = "Yes, sounds good!\n\nOn Wed, Oct 21, Sender wrote:\n> Our offer\n> Unsubscribe: https://example.test/unsubscribe";
  assert.equal(extractReplyText(reply), "Yes, sounds good!");
  assert.equal((await analyzeReply({ text: reply })).classification, "INTERESTED");
  assert.equal((await analyzeReply({ text: "Can you explain this?\n> Unsubscribe: https://example.test" })).classification, "ASKING_DETAILS");
});

test("auth tokens hash without storing the raw token", async () => {
  const { createTokenPair, hashAuthToken } = await import("../packages/shared/src/token-pairs.ts");
  const pair = createTokenPair();
  assert.equal(hashAuthToken(pair.token), pair.tokenHash);
  assert.notEqual(createTokenPair().tokenHash, pair.tokenHash);
});

test("Stripe webhook signatures verify only fresh, correctly signed payloads", async () => {
  const crypto = await import("node:crypto");
  const { verifyStripeWebhookSignature } = await import("../packages/shared/src/billing-plans.ts");
  const secret = "whsec-test-only";
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(verifyStripeWebhookSignature(body, `t=${timestamp},v1=${signature}`, secret), true);
  assert.equal(verifyStripeWebhookSignature(body, `t=${timestamp},v1=deadbeef`, secret), false);
  assert.equal(verifyStripeWebhookSignature(body, `t=${timestamp - 1000},v1=${signature}`, secret), false);
  assert.equal(verifyStripeWebhookSignature(body, null, secret), false);
});

test("plan tiers increase in every limit", async () => {
  const { PLAN_DEFAULTS } = await import("../packages/shared/src/billing-plans.ts");
  assert.ok(PLAN_DEFAULTS.free.monthlySendLimit < PLAN_DEFAULTS.pro.monthlySendLimit);
  assert.ok(PLAN_DEFAULTS.pro.monthlySendLimit < PLAN_DEFAULTS.scale.monthlySendLimit);
  assert.ok(PLAN_DEFAULTS.free.maxMailboxes < PLAN_DEFAULTS.pro.maxMailboxes);
  assert.ok(PLAN_DEFAULTS.free.monthlyAiCalls < PLAN_DEFAULTS.pro.monthlyAiCalls);
});

test("rate limiting allows up to the limit, then blocks, even without Redis", async () => {
  const { checkRateLimit } = await import("../packages/shared/src/rate-limit.ts");
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal((await checkRateLimit(key, 2, 60)).allowed, true);
  assert.equal((await checkRateLimit(key, 2, 60)).allowed, true);
  const third = await checkRateLimit(key, 2, 60);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});
