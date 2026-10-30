import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { mock } from "node:test";
import EmbeddedPostgres from "embedded-postgres";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
async function freePort() {
  const server = net.createServer(); server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
const dbPort = await freePort();
const webPort = Number(process.env.TEST_WEB_PORT || await freePort());
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mailpilot-integration-"));
const base = `http://127.0.0.1:${webPort}`;
Object.assign(process.env, {
  NODE_ENV: "production", DATABASE_URL: `postgresql://mailpilot:test-only@127.0.0.1:${dbPort}/mailpilot_test`,
  DATABASE_URL_UNPOOLED: `postgresql://mailpilot:test-only@127.0.0.1:${dbPort}/mailpilot_test`,
  APP_URL: base, ENCRYPTION_KEY: "a".repeat(64), UNSUBSCRIBE_SIGNING_KEY: "integration-only-key",
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", AI_PROVIDER: "openai", DEMO_LOGIN_ENABLED: "false",
  REDIS_URL: `redis://127.0.0.1:${await freePort()}`
});
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, port: dbPort, user: "mailpilot", password: "test-only", persistent: true, onLog: () => {}, onError: () => {} });
let web: ChildProcess | undefined;
let output = "";
let prisma: typeof import("../packages/shared/src/db.ts").prisma | undefined;
let checks = 0;
function passed(name: string) { checks++; console.log(`PASS ${name}`); }

try {
  console.log("Starting an isolated temporary PostgreSQL database...");
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("mailpilot_test");
  const pg = postgres.getPgClient("mailpilot_test", "127.0.0.1"); await pg.connect();
  try {
    const migrations = await fs.readdir(path.join(root, "prisma/migrations"));
    for (const migration of migrations.filter((name) => /^\d/.test(name)).sort()) await pg.query(await fs.readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
  } finally { await pg.end(); }
  passed("all committed migrations apply to an empty database");
  prisma = (await import("../packages/shared/src/db.ts")).prisma;
  web = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], { cwd: path.join(root, "apps/web"), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  web.stdout?.on("data", (chunk) => { output = (output + chunk).slice(-10000); });
  web.stderr?.on("data", (chunk) => { output = (output + chunk).slice(-10000); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (web.exitCode !== null) throw new Error(`Web server exited: ${output}`);
    try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, output);
  async function api(url: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(base + url, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error(`${url} returned ${response.status}: ${text.slice(0, 250)}\n${output}`); }
    return { status: response.status, data, cookie: response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ") };
  }
  assert.equal((await api("/api/contacts")).status, 401);
  assert.equal((await api("/api/contacts/import/preview", "", {})).status, 401);
  assert.equal((await api("/api/auth/demo", "", {})).status, 403);
  assert.equal((await api("/api/auth/login", "", { email: "demo@mailpilot.dev", password: "demo1234" })).status, 403);
  passed("protected routes and both disabled demo login paths reject access");
  const first = await api("/api/auth/signup", "", { name: "Test Pilot", email: "pilot@example.test", password: "test-password-123" });
  const second = await api("/api/auth/signup", "", { name: "Other Pilot", email: "other@example.test", password: "test-password-123" });
  assert.equal(first.status, 201); assert.equal(second.status, 201); assert.ok(first.cookie);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "pilot@example.test" }, include: { memberships: true } });
  assert.equal(user.emailVerifiedAt, null);
  const workspaceId = user.memberships[0].workspaceId;
  const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: "other@example.test" }, include: { memberships: true } });
  const otherWorkspaceId = otherUser.memberships[0].workspaceId;
  passed("signup creates isolated workspaces without falsely verifying email");
  const crossSite = await fetch(`${base}/api/contact-lists`, { method: "POST", headers: { cookie: first.cookie, origin: "https://untrusted.example", "content-type": "application/json" }, body: JSON.stringify({ name: "Must not create" }) });
  assert.equal(crossSite.status, 403); passed("cross-site mutations are rejected");
  const list = await api("/api/contact-lists", first.cookie, { name: "My prospects" }); assert.equal(list.status, 201);
  const otherList = await api("/api/contact-lists", second.cookie, { name: "Private list" }); assert.equal(otherList.status, 201);
  assert.equal((await api("/api/contacts", first.cookie, { email: "escape@example.test", listId: otherList.data.list.id })).status, 404);
  const contact = await api("/api/contacts", first.cookie, { email: "lead@example.test", name: "Alex", company: "Small Shop", listId: list.data.list.id }); assert.equal(contact.status, 201);
  assert.equal((await api("/api/contact-lists", first.cookie, { name: "My prospects" })).status, 409);
  assert.equal((await api("/api/contacts", first.cookie, { email: "lead@example.test", listId: list.data.list.id })).status, 409);
  assert.equal((await api(`/api/contacts?listId=${list.data.list.id}`, first.cookie)).data.total, 1);
  const otherContact = await api("/api/contacts", second.cookie, { email: "lead@example.test", listId: otherList.data.list.id }); assert.equal(otherContact.status, 201);
  assert.equal((await api("/api/deals", first.cookie, { name: "Forbidden", contactId: otherContact.data.contact.id })).status, 404);
  assert.equal((await api("/api/contacts?page=oops", first.cookie)).status, 400);
  passed("contact lists, contacts and deals enforce workspace ownership");
  const recommendation = await api("/api/recommendations", first.cookie, { businessDescription: "We build websites for small businesses.", services: "Website design", audience: "Retailers" });
  assert.equal(recommendation.status, 200); assert.equal(recommendation.data.source, "starter");
  const template = recommendation.data.recommendation.templates[0];
  assert.equal((await api("/api/knowledge-base", first.cookie, { aboutMe: "We build websites", services: "Web design", pricingMin: "0", pricingMax: "500" }, "PUT")).status, 200);
  assert.equal((await api("/api/knowledge-base", first.cookie, { pricingMin: "900", pricingMax: "100" }, "PUT")).status, 400);
  passed("business context and starter recommendations work without AI credentials");
  const { encryptSecret } = await import("../packages/shared/src/crypto.ts");
  const mailbox = await prisma.mailbox.create({ data: { workspaceId, name: "Test mailbox", email: "sender@example.test", smtpHost: "smtp.example.test", smtpPort: 465, smtpSecure: true, smtpUsername: "test", smtpPasswordEncrypted: encryptSecret("test-only"), healthStatus: "CONNECTED", dailySendLimit: 50 } });
  const campaignInput = { name: "Reviewed template", listId: list.data.list.id, mailboxIds: [mailbox.id], businessDescription: "We build websites", services: "Web design", templateSubject: template.subject, templateText: template.text, followUps: [], sendingDelayMin: 0, sendingDelayMax: 0, sendingStartHour: 0, sendingEndHour: 24, timezone: "UTC", skipWeekends: false };
  const campaign = await api("/api/campaigns", first.cookie, campaignInput); assert.equal(campaign.status, 201);
  const campaignId = campaign.data.campaign.id;
  const recipientPath = `/api/campaigns/${campaignId}/recipients`;
  assert.equal((await api(recipientPath)).status, 401);
  assert.equal((await api(recipientPath, second.cookie)).status, 404);
  assert.equal((await api(recipientPath, second.cookie, { contactIds: [] }, "PUT")).status, 404);
  const lateContact = await api("/api/contacts", first.cookie, { email: "late-client@example.test", name: "Late Client" });
  assert.equal(lateContact.status, 201);
  const selectedLate = await api(recipientPath, first.cookie, { contactIds: [lateContact.data.contact.id, lateContact.data.contact.id] }, "PUT");
  assert.equal(selectedLate.status, 200); assert.equal(selectedLate.data.recipientCount, 1);
  assert.deepEqual((await api(recipientPath, first.cookie)).data.contactIds, [lateContact.data.contact.id]);
  const latePreview = await api(`/api/campaigns/${campaignId}/preview`, first.cookie, { contactId: lateContact.data.contact.id });
  assert.equal(latePreview.status, 200); assert.match(latePreview.data.draft.text, /Late/);
  passed("existing drafts can select and preview clients added after campaign creation");
  assert.equal((await api(recipientPath, first.cookie, { contactIds: [otherContact.data.contact.id] }, "PUT")).status, 400);
  assert.equal((await api(recipientPath, first.cookie, { listId: otherList.data.list.id }, "PUT")).status, 404);
  assert.deepEqual((await api(recipientPath, first.cookie)).data.contactIds, [lateContact.data.contact.id]);
  assert.equal((await api(recipientPath, first.cookie, { contactIds: [] }, "PUT")).status, 200);
  assert.equal((await api(`/api/campaigns/${campaignId}/launch`, first.cookie, {})).status, 400);
  const fromList = await api(recipientPath, first.cookie, { listId: list.data.list.id }, "PUT");
  assert.equal(fromList.status, 200); assert.deepEqual(fromList.data.contactIds, [contact.data.contact.id]);
  passed("recipient replacement supports entire lists, rejects foreign contacts, and blocks empty launches");
  assert.equal((await api(`/api/campaigns/${campaignId}`, second.cookie)).status, 404);
  const preview = await api(`/api/campaigns/${campaignId}/preview`, first.cookie, { contactId: contact.data.contact.id });
  assert.equal(preview.status, 200); assert.match(preview.data.draft.text, /Alex/); assert.equal(preview.data.draft.provider, "template");
  assert.equal((await api(`/api/campaigns/${campaignId}/preview`, first.cookie, { contactId: otherContact.data.contact.id })).status, 400);
  assert.equal((await api(`/api/campaigns/${campaignId}/control`, first.cookie, { action: "garbage" })).status, 400);
  assert.equal((await api(`/api/campaigns/${campaignId}/control`, first.cookie, { action: "resume" })).status, 409);
  passed("campaign creation, personalized preview, and state transitions are validated");
  const launch = await api(`/api/campaigns/${campaignId}/launch`, first.cookie, {});
  assert.equal(launch.status, 503); assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status, "DRAFT");
  passed("unavailable Redis returns promptly and does not activate a campaign");

  // All SMTP delivery is intercepted in this process. No real mail is sent.
  const sent: Array<{ to: string; text: string; html: string; messageId: string; inReplyTo?: string }> = [];
  let failDelivery = false;
  mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail: typeof sent[number]) => { sent.push(mail); if (failDelivery) throw new Error("Simulated lost SMTP acknowledgement"); return { messageId: mail.messageId }; }, close: () => {} }));
  const { processOutreachSend } = await import("../apps/worker/src/outreach-send.ts");
  const sendData = { workspaceId, campaignId, contactId: contact.data.contact.id };
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
  assert.equal((await api(recipientPath, first.cookie, { contactIds: [] }, "PUT")).status, 409);
  assert.equal(await prisma.campaignContact.count({ where: { campaignId } }), 1);
  passed("recipient selection is locked after automation starts");
  assert.equal((await processOutreachSend(sendData)).sent, true); assert.equal(sent.length, 1);
  await processOutreachSend(sendData); assert.equal(sent.length, 1);
  assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status, "COMPLETED");
  passed("template sends persist once, avoid duplicates, and complete the campaign (mock SMTP)");
  async function freshCampaign(email: string) {
    const recipient = await prisma.contact.create({ data: { workspaceId, email, firstName: "Test" } });
    const campaign = await prisma.campaign.create({ data: { workspaceId, createdById: user.id, name: "Worker regression", status: "ACTIVE", businessDescription: "Websites", services: "Design", sendingDelayMin: 0, sendingDelayMax: 0, sendingStartHour: 0, sendingEndHour: 24, skipWeekends: false, mailboxes: { create: { mailboxId: mailbox.id } }, recipients: { create: { contactId: recipient.id } }, steps: { create: { position: 0, type: "EMAIL", subject: "Hi {{firstName}}", templateBody: "Could we discuss website design?", delayHours: 0 } } }, include: { steps: true } });
    return { data: { workspaceId, campaignId: campaign.id, contactId: recipient.id }, campaign, recipient };
  }
  const paused = await freshCampaign("paused@example.test");
  const followup = await prisma.sequenceStep.create({ data: { campaignId: paused.campaign.id, position: 1, type: "EMAIL", delayHours: 24, templateBody: "Follow up" } });
  await prisma.campaign.update({ where: { id: paused.campaign.id }, data: { status: "PAUSED" } });
  assert.equal((await processOutreachSend({ ...paused.data, stepId: followup.id })).rescheduled, true);
  assert.equal(sent.length, 1); passed("paused follow-ups are deferred instead of discarded");
  const limited = await freshCampaign("limited@example.test");
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { dailySendLimit: 1 } });
  assert.equal((await processOutreachSend(limited.data)).reason, "mailbox_limit_or_spacing"); assert.equal(sent.length, 1);
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { dailySendLimit: 50 } });
  passed("mailbox quotas prevent additional SMTP calls");
  const replied = await freshCampaign("replied@example.test");
  await prisma.contact.update({ where: { id: replied.recipient.id }, data: { status: "replied" } });
  assert.equal((await processOutreachSend(replied.data)).reason, "recipient_stopped"); assert.equal(sent.length, 1);
  passed("replied contacts cannot receive further outreach");
  const uncertain = await freshCampaign("uncertain@example.test"); failDelivery = true;
  await assert.rejects(processOutreachSend(uncertain.data), /Delivery could not be confirmed/);
  const attempted = sent.length;
  await assert.rejects(processOutreachSend(uncertain.data), /previous delivery attempt needs manual review/);
  assert.equal(sent.length, attempted); failDelivery = false;
  passed("uncertain SMTP delivery is never automatically duplicated");
  const { createUnsubscribeToken } = await import("../packages/shared/src/compliance.ts");
  const token = createUnsubscribeToken(workspaceId, "lead@example.test");
  const unsubscribe = await fetch(`${base}/api/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  assert.equal(unsubscribe.status, 200);
  assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: contact.data.contact.id } })).status, "unsubscribed");
  assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: otherContact.data.contact.id } })).status, "new");
  assert.equal((await api("/api/unsubscribe", "", { email: "lead@example.test" })).status, 400);
  assert.equal(await prisma.suppressionList.count({ where: { workspaceId: otherWorkspaceId } }), 0);
  passed("one-click unsubscribe affects only its signed workspace");
  const changedMailbox = await api(`/api/mailboxes/${mailbox.id}`, first.cookie, { smtpHost: "smtp-new.example.test" }, "PATCH");
  assert.equal(changedMailbox.status, 200); assert.equal(changedMailbox.data.mailbox.healthStatus, "UNKNOWN");
  assert.equal("smtpPasswordEncrypted" in changedMailbox.data.mailbox, false);
  passed("credential changes require retesting and never expose stored secrets");
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { healthStatus: "CONNECTED", smtpHost: "smtp.example.test" } });
  for (const route of ["/dashboard", "/contacts", "/campaigns", "/knowledge-base", "/mailboxes", "/inbox", "/analytics", "/settings"]) assert.equal((await fetch(base + route, { headers: { cookie: first.cookie } })).status, 200, route);
  passed("all protected application pages render against migrated PostgreSQL");
  console.log(`Integration checks passed: ${checks}. No external email or AI calls were made.`);
  if (process.argv.includes("--serve")) {
    console.log(`UI preview ready: ${base} — login pilot@example.test / test-password-123. Type stop to close.`);
    process.stdin.resume(); await once(process.stdin, "data"); process.stdin.pause();
  }
} catch (error) {
  console.error(error); console.error(output.slice(-5000)); process.exitCode = 1;
} finally {
  mock.restoreAll();
  if (web && web.exitCode === null) { web.kill(); await once(web, "exit"); }
  await prisma?.$disconnect();
  // Validate the disposable directory before deletion; Windows can briefly retain file handles after shutdown.
  if (path.dirname(dataDir) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith("mailpilot-integration-")) throw new Error("Unexpected test database directory");
  await postgres.stop();
  await fs.rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
