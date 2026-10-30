import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { testMailboxConnection } from "@mailpilot/shared/mail";
import { getCurrentAuth } from "@/lib/auth";
import { credentialsFromMailbox, safeMailbox } from "@/lib/mailboxes";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const mailbox = await prisma.mailbox.findFirst({ where: { id, workspaceId: auth.workspace.id } });
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  try {
    await testMailboxConnection(credentialsFromMailbox(mailbox));
    const updated = await prisma.mailbox.update({ where: { id }, data: { healthStatus: "CONNECTED", healthError: null, lastTestedAt: new Date() } });
    return NextResponse.json({ ok: true, mailbox: safeMailbox(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    const updated = await prisma.mailbox.update({ where: { id }, data: { healthStatus: "ERROR", healthError: message.slice(0, 500), lastTestedAt: new Date() } });
    return NextResponse.json({ ok: false, error: "Connection failed. Check both SMTP and IMAP settings.", mailbox: safeMailbox(updated) }, { status: 422 });
  }
}
