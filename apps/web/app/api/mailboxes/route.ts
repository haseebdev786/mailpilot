import { NextResponse } from "next/server";
import { encryptSecret } from "@mailpilot/shared/crypto";
import { prisma } from "@mailpilot/shared/db";
import { logger } from "@mailpilot/shared/logger";
import { testMailboxConnection } from "@mailpilot/shared/mail";
import { checkMailboxLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";
import { mailboxCreateSchema, safeMailbox } from "@/lib/mailboxes";

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const mailboxes = await prisma.mailbox.findMany({ where: { workspaceId: auth.workspace.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ mailboxes: mailboxes.map(safeMailbox) });
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const shouldTest = body.testConnection === true;
    const input = mailboxCreateSchema.parse(body);
    try { await checkMailboxLimit(auth.workspace.id); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
    const mailbox = await prisma.mailbox.create({ data: { workspaceId: auth.workspace.id, name: input.name, email: input.email.toLowerCase(), smtpHost: input.smtpHost, smtpPort: input.smtpPort, smtpSecure: input.smtpSecure, smtpUsername: input.smtpUsername, smtpPasswordEncrypted: encryptSecret(input.smtpPassword), imapHost: input.imapHost, imapPort: input.imapPort, imapSecure: input.imapSecure, imapUsername: input.imapUsername, imapPasswordEncrypted: encryptSecret(input.imapPassword), fromName: input.fromName || null, signature: input.signature || null, businessAddress: input.businessAddress || null, dailySendLimit: input.dailySendLimit, warmupEnabled: input.warmupEnabled, warmupStartPerDay: input.warmupStartPerDay, warmupRampPerDay: input.warmupRampPerDay } });
    if (!shouldTest) return NextResponse.json({ mailbox: safeMailbox(mailbox), test: null }, { status: 201 });
    try {
      await testMailboxConnection({ smtpHost: input.smtpHost, smtpPort: input.smtpPort, smtpSecure: input.smtpSecure, smtpUsername: input.smtpUsername, smtpPassword: input.smtpPassword, imapHost: input.imapHost, imapPort: input.imapPort, imapSecure: input.imapSecure, imapUsername: input.imapUsername, imapPassword: input.imapPassword });
      const updated = await prisma.mailbox.update({ where: { id: mailbox.id }, data: { healthStatus: "CONNECTED", healthError: null, lastTestedAt: new Date() } });
      return NextResponse.json({ mailbox: safeMailbox(updated), test: { ok: true } }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      const updated = await prisma.mailbox.update({ where: { id: mailbox.id }, data: { healthStatus: "ERROR", healthError: message.slice(0, 500), lastTestedAt: new Date() } });
      return NextResponse.json({ mailbox: safeMailbox(updated), test: { ok: false, error: "Connection failed. Check the host, port, username, and password." } }, { status: 201 });
    }
  } catch (error) {
    logger.error("mailbox_create_failed", { userId: auth.user.id, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Mailbox details are invalid or the email is already connected." }, { status: 400 });
  }
}
