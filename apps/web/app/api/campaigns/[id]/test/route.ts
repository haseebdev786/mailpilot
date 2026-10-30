import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSmtpProvider } from "@mailpilot/shared/mail";
import { generatePersonalizedEmail } from "@mailpilot/shared/campaign-ai";
import { decryptSecret } from "@mailpilot/shared/crypto";
import { prisma } from "@mailpilot/shared/db";
import { getCurrentAuth } from "@/lib/auth";
import { messageIdFor } from "@/lib/campaigns";
import { renderTemplate, textToHtml } from "@mailpilot/shared/email-content";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const parsed = z.object({ testEmail: z.string().trim().email().max(160), contactId: z.string().optional(), subject: z.string().trim().max(200).refine((value) => !/[\r\n]/.test(value)).optional(), text: z.string().trim().max(6000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid test address and email draft" }, { status: 400 });
  const body = parsed.data;
  if (!body.testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.testEmail)) return NextResponse.json({ error: "Enter a valid test email" }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: auth.workspace.id }, include: { steps: { where: { position: 0 }, take: 1 }, mailboxes: { include: { mailbox: true }, orderBy: { position: "asc" } }, recipients: { include: { contact: true }, take: 1 } } });
  if (!campaign || !campaign.mailboxes[0]) return NextResponse.json({ error: "Campaign or sending mailbox not found" }, { status: 404 });
  if (![auth.user.email.toLowerCase(), ...campaign.mailboxes.map(({ mailbox }) => mailbox.email.toLowerCase())].includes(body.testEmail.toLowerCase())) return NextResponse.json({ error: "Send a test to your account email or a selected mailbox." }, { status: 400 });
  const recipient = body.contactId ? await prisma.contact.findFirst({ where: { id: body.contactId, workspaceId: auth.workspace.id, campaignLinks: { some: { campaignId: id } } } }) : campaign.recipients[0]?.contact;
  if (!recipient) return NextResponse.json({ error: "Add at least one campaign recipient before testing" }, { status: 400 });
  try {
    const template = campaign.steps[0];
    const subject = body.subject || (template?.subject ? renderTemplate(template.subject, recipient) : "");
    const text = body.text || (template?.subject ? renderTemplate(template.templateBody ?? "", recipient) : "");
    const draft = subject && text ? { subject, text, html: textToHtml(text) } : await generatePersonalizedEmail({ firstName: recipient.firstName, company: recipient.company, website: recipient.website, businessDescription: campaign.businessDescription, services: campaign.services, offer: campaign.offer, tone: campaign.tone, cta: campaign.cta, signature: campaign.signature });
    const mailbox = campaign.mailboxes[0].mailbox;
    if (!mailbox.isActive || mailbox.healthStatus !== "CONNECTED") throw new Error("Connect and test the sending mailbox first");
    if (!mailbox.smtpHost || !mailbox.smtpPort || !mailbox.smtpUsername || !mailbox.smtpPasswordEncrypted) throw new Error("Sending mailbox credentials are incomplete");
    const messageId = messageIdFor(new URL(process.env.APP_URL ?? "http://localhost:3000").hostname, crypto.randomUUID());
    await createSmtpProvider({ smtpHost: mailbox.smtpHost, smtpPort: mailbox.smtpPort, smtpSecure: mailbox.smtpSecure, smtpUsername: mailbox.smtpUsername, smtpPassword: decryptSecret(mailbox.smtpPasswordEncrypted), imapHost: mailbox.imapHost ?? "", imapPort: mailbox.imapPort ?? 993, imapSecure: mailbox.imapSecure, imapUsername: mailbox.imapUsername ?? "", imapPassword: mailbox.imapPasswordEncrypted ? decryptSecret(mailbox.imapPasswordEncrypted) : "" }).send({ from: mailbox.fromName ? `${mailbox.fromName} <${mailbox.email}>` : mailbox.email, to: body.testEmail, subject: `[Test] ${draft.subject}`, text: draft.text, html: draft.html, messageId });
    await prisma.emailMessage.create({ data: { workspaceId: auth.workspace.id, mailboxId: mailbox.id, campaignId: campaign.id, direction: "OUTBOUND", status: "SENT", messageId, fromEmail: mailbox.email, toEmail: body.testEmail, subject: `[Test] ${draft.subject}`, bodyText: draft.text, bodyHtml: draft.html, sentAt: new Date() } });
    return NextResponse.json({ ok: true, draft });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Test send failed" }, { status: 502 }); }
}
