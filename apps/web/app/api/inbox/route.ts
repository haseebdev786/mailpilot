import { textToHtml } from "@mailpilot/shared/email-content";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { decryptSecret } from "@mailpilot/shared/crypto";
import { createSmtpProvider } from "@mailpilot/shared/mail";
import { getCurrentAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await getCurrentAuth(); if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url); const search = url.searchParams.get("search")?.trim(); const attention = url.searchParams.get("attention");
  const threads = await prisma.thread.findMany({ where: { workspaceId: auth.workspace.id, ...(attention === "true" ? { needsAttention: true } : {}), ...(search ? { OR: [{ subject: { contains: search, mode: "insensitive" } }, { snippet: { contains: search, mode: "insensitive" } }, { contact: { email: { contains: search, mode: "insensitive" } } }] } : {}) }, include: { contact: { select: { id: true, email: true, firstName: true, company: true, status: true } }, messages: { orderBy: { createdAt: "asc" }, take: 50 }, replies: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { lastMessageAt: "desc" }, take: 100 });
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth(); if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { threadId?: string; text?: string };
  if (typeof body.threadId !== "string" || typeof body.text !== "string" || !body.text.trim() || body.text.length > 10000) return NextResponse.json({ error: "Thread and message are required" }, { status: 400 });
  const thread = await prisma.thread.findFirst({ where: { id: body.threadId, workspaceId: auth.workspace.id }, include: { mailbox: true, contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!thread?.mailbox || !thread.contact) return NextResponse.json({ error: "Thread mailbox or contact not found" }, { status: 404 });
  if (["unsubscribed", "bounced", "not_interested"].includes(thread.contact.status) || await prisma.suppressionList.findUnique({ where: { workspaceId_email: { workspaceId: auth.workspace.id, email: thread.contact.email } } })) return NextResponse.json({ error: "This contact cannot receive outreach." }, { status: 409 });
  const mailbox = thread.mailbox;
  if (!mailbox.isActive || mailbox.healthStatus !== "CONNECTED") return NextResponse.json({ error: "Mailbox is not connected" }, { status: 400 });
  if (!mailbox.smtpHost || !mailbox.smtpPort || !mailbox.smtpUsername || !mailbox.smtpPasswordEncrypted) return NextResponse.json({ error: "Mailbox SMTP credentials are incomplete" }, { status: 400 });
  const messageId = `<${crypto.randomUUID()}@${new URL(process.env.APP_URL ?? "http://localhost:3000").hostname}>`; const subject = thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject ?? "your note"}`;
  try {
    await prisma.thread.update({ where: { id: thread.id }, data: { manualReplyAt: new Date() } });
    const sent = await createSmtpProvider({ smtpHost: mailbox.smtpHost, smtpPort: mailbox.smtpPort, smtpSecure: mailbox.smtpSecure, smtpUsername: mailbox.smtpUsername, smtpPassword: decryptSecret(mailbox.smtpPasswordEncrypted), imapHost: mailbox.imapHost ?? "", imapPort: mailbox.imapPort ?? 993, imapSecure: mailbox.imapSecure, imapUsername: mailbox.imapUsername ?? "", imapPassword: mailbox.imapPasswordEncrypted ? decryptSecret(mailbox.imapPasswordEncrypted) : "" }).send({ from: mailbox.fromName ? `${mailbox.fromName} <${mailbox.email}>` : mailbox.email, to: thread.contact.email, subject, text: body.text.trim(), html: textToHtml(body.text.trim()), messageId, inReplyTo: thread.messages[0]?.messageId ?? undefined });
    await prisma.$transaction([prisma.emailMessage.create({ data: { workspaceId: auth.workspace.id, mailboxId: mailbox.id, contactId: thread.contact.id, threadId: thread.id, direction: "OUTBOUND", status: "SENT", messageId: sent.messageId || messageId, inReplyTo: thread.messages[0]?.messageId, fromEmail: mailbox.email, toEmail: thread.contact.email, subject, bodyText: body.text.trim(), bodyHtml: textToHtml(body.text.trim()), sentAt: new Date() } }), prisma.thread.update({ where: { id: thread.id }, data: { manualReplyAt: new Date(), needsAttention: false, snippet: body.text.trim().slice(0, 180), lastMessageAt: new Date(), tags: [] } })]);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send reply" }, { status: 502 }); }
}
