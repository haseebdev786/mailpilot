import { UnrecoverableError } from "bullmq";
import { prisma } from "@mailpilot/shared/db";
import { checkMonthlySendLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { getMailboxCredentials, mailboxHasUsableCredentials } from "@mailpilot/shared/mailbox-credentials";
import { createSmtpProvider } from "@mailpilot/shared/mail";
import { textToHtml } from "@mailpilot/shared/email-content";

export async function processAutoReply(data: { workspaceId: string; threadId: string; replyId: string; mailboxId: string; toEmail: string; draft: string }) {
  const thread = await prisma.thread.findFirst({ where: { id: data.threadId, workspaceId: data.workspaceId }, include: { contact: true, mailbox: true, replies: { orderBy: { createdAt: "desc" }, take: 1 }, messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  const reply = thread?.replies[0];
  const inbound = thread?.messages[0];
  if (!thread || thread.manualReplyAt || thread.needsAttention || !reply || reply.id !== data.replyId || reply.handledAt || reply.needsAttention || (reply.aiConfidence ?? 0) < 0.8 || !reply.aiDraft || !thread.contact || ["unsubscribed", "bounced", "not_interested"].includes(thread.contact.status)) return { skipped: true };
  if (await prisma.suppressionList.findUnique({ where: { workspaceId_email: { workspaceId: data.workspaceId, email: thread.contact.email } } })) return { skipped: true };
  const campaign = inbound?.campaignId ? await prisma.campaign.findFirst({ where: { id: inbound.campaignId, workspaceId: data.workspaceId, replyMode: "AUTO", status: { in: ["ACTIVE", "COMPLETED"] } } }) : null;
  if (!campaign) return { skipped: true };
  const mailbox = thread.mailbox;
  if (!mailbox || mailbox.workspaceId !== data.workspaceId || !mailbox.isActive || mailbox.healthStatus !== "CONNECTED" || !mailboxHasUsableCredentials(mailbox)) return { skipped: true };
  try { await checkMonthlySendLimit(data.workspaceId); } catch (error) { if (error instanceof PlanLimitError) return { skipped: true, reason: "plan_monthly_send_limit" }; throw error; }
  const deliveryId = `reply-${reply.id}`;
  const previous = await prisma.emailMessage.findUnique({ where: { id: deliveryId } });
  if (previous) return { skipped: true, reason: "already_attempted" };
  const messageId = `<${deliveryId}@${new URL(process.env.APP_URL ?? "http://localhost:3000").hostname}>`;
  const subject = thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject || "your note"}`;
  const text = reply.aiDraft;
  const html = textToHtml(text);
  const credentials = await getMailboxCredentials(mailbox);
  try { await prisma.emailMessage.create({ data: { id: deliveryId, workspaceId: data.workspaceId, mailboxId: mailbox.id, threadId: thread.id, contactId: thread.contact.id, direction: "OUTBOUND", status: "SENDING", messageId, inReplyTo: inbound?.messageId, fromEmail: mailbox.email, toEmail: thread.contact.email, subject, bodyText: text, bodyHtml: html } }); }
  catch (error) { if ((error as { code?: string }).code === "P2002") return { skipped: true }; throw error; }
  try {
    await createSmtpProvider(credentials).send({ from: mailbox.fromName ? `${JSON.stringify(mailbox.fromName)} <${mailbox.email}>` : mailbox.email, to: thread.contact.email, subject, text, html, messageId, inReplyTo: inbound?.messageId ?? undefined });
    await prisma.$transaction([
      prisma.emailMessage.update({ where: { id: deliveryId }, data: { status: "SENT", sentAt: new Date() } }),
      prisma.reply.update({ where: { id: reply.id }, data: { handledAt: new Date() } }),
      prisma.thread.update({ where: { id: thread.id }, data: { snippet: text.slice(0, 180), lastMessageAt: new Date() } })
    ]);
  } catch { throw new UnrecoverableError("Auto-reply delivery is uncertain. Check the mailbox before manually retrying."); }
  return { sent: true };
}
