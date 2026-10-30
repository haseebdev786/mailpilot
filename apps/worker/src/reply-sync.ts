import { prisma } from "@mailpilot/shared/db";
import { decryptSecret } from "@mailpilot/shared/crypto";
import { fetchNewInboundMessages, analyzeReply, extractReplyText, draftKnowledgeBaseReply, type ParsedInboundMessage } from "@mailpilot/shared";
import { getOutreachQueue } from "@mailpilot/shared/queue";

function credentials(mailbox: { smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean; smtpUsername: string | null; smtpPasswordEncrypted: string | null; imapHost: string | null; imapPort: number | null; imapSecure: boolean; imapUsername: string | null; imapPasswordEncrypted: string | null }) {
  if (!mailbox.imapHost || !mailbox.imapPort || !mailbox.imapUsername || !mailbox.imapPasswordEncrypted) throw new Error("Mailbox IMAP credentials are incomplete");
  return { smtpHost: mailbox.smtpHost ?? "", smtpPort: mailbox.smtpPort ?? 587, smtpSecure: mailbox.smtpSecure, smtpUsername: mailbox.smtpUsername ?? "", smtpPassword: mailbox.smtpPasswordEncrypted ? decryptSecret(mailbox.smtpPasswordEncrypted) : "", imapHost: mailbox.imapHost, imapPort: mailbox.imapPort, imapSecure: mailbox.imapSecure, imapUsername: mailbox.imapUsername, imapPassword: decryptSecret(mailbox.imapPasswordEncrypted) };
}

async function cancelContactJobs(workspaceId: string, contactId: string) {
  const jobs = await getOutreachQueue().getJobs(["waiting", "delayed", "paused"], 0, -1);
  await Promise.all(jobs.filter((job) => job.data?.workspaceId === workspaceId && job.data?.contactId === contactId).map((job) => job.remove()));
}

function matchingMessage(message: ParsedInboundMessage, outbound: Array<{ id: string; messageId: string | null; contactId: string | null; campaignId: string | null; threadId: string | null }>) {
  const ids = new Set([message.inReplyTo, ...message.references].filter(Boolean));
  return outbound.find((item) => item.messageId && ids.has(item.messageId)) ?? null;
}

export async function processMailboxReplies(mailboxId: string) {
  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId }, include: { workspace: true } });
  if (!mailbox || !mailbox.isActive) return { imported: 0 };
  const result = await fetchNewInboundMessages(credentials(mailbox), mailbox.imapLastUid);
  let imported = 0;
  for (const message of result.messages) {
    if (!message.fromEmail || message.fromEmail === mailbox.email.toLowerCase()) continue;
    const inboundId = `inbound-${mailbox.id}-${message.uid}`;
    if (await prisma.reply.findFirst({ where: { emailMessageId: inboundId }, select: { id: true } })) continue;
    const outbound = await prisma.emailMessage.findMany({ where: { workspaceId: mailbox.workspaceId, OR: [{ messageId: { in: [message.inReplyTo ?? "", ...message.references] } }, { toEmail: message.fromEmail }], direction: "OUTBOUND" }, select: { id: true, messageId: true, contactId: true, campaignId: true, threadId: true }, orderBy: { createdAt: "desc" }, take: 10 });
    const matched = matchingMessage(message, outbound) ?? outbound[0] ?? null;
    const contactId = matched?.contactId ?? outbound.find((item) => item.contactId)?.contactId ?? null;
    const contact = contactId ? await prisma.contact.findFirst({ where: { id: contactId, workspaceId: mailbox.workspaceId } }) : null;
    if (!contact) continue; // Only ingest replies associated with this workspace's outreach.
    const thread = matched?.threadId ? await prisma.thread.findUnique({ where: { id: matched.threadId } }) : await prisma.thread.create({ data: { workspaceId: mailbox.workspaceId, mailboxId: mailbox.id, contactId, subject: message.subject, snippet: message.text.slice(0, 180), lastMessageAt: message.receivedAt } });
    if (!thread) continue;
    const emailMessage = await prisma.emailMessage.upsert({ where: { id: inboundId }, update: {}, create: { id: inboundId, workspaceId: mailbox.workspaceId, mailboxId: mailbox.id, campaignId: matched?.campaignId, contactId, threadId: thread.id, direction: "INBOUND", status: "REPLIED", messageId: message.messageId, inReplyTo: message.inReplyTo, fromEmail: message.fromEmail, toEmail: message.toEmail, subject: message.subject, bodyText: message.text, bodyHtml: message.html, rawHeaders: { references: message.references, uid: message.uid }, sentAt: message.receivedAt } });
    if (matched && !matched.threadId) await prisma.emailMessage.update({ where: { id: matched.id }, data: { threadId: thread.id } });
    const analysis = await analyzeReply({ text: message.text, subject: message.subject });
    const isRealReply = !["BOUNCE", "OUT_OF_OFFICE"].includes(analysis.classification);
    const knowledge = await prisma.knowledgeBase.findFirst({ where: { workspaceId: mailbox.workspaceId, isActive: true }, orderBy: { updatedAt: "desc" } });
    const knowledgeText = knowledge ? [knowledge.content, knowledge.aboutMe, knowledge.services, knowledge.pastWork, knowledge.faqs, `Pricing: ${knowledge.pricingMin ?? ""}-${knowledge.pricingMax ?? ""}`, knowledge.packages, knowledge.allowedDiscount, knowledge.timelines, knowledge.paymentTerms].filter(Boolean).join("\n") : "";
    const autoDraft = isRealReply && knowledgeText ? await draftKnowledgeBaseReply({ message: extractReplyText(message.text), knowledgeBase: knowledgeText, classification: analysis.classification }) : { draft: "", needsAttention: analysis.needsAttention };
    const reply = await prisma.reply.create({ data: { workspaceId: mailbox.workspaceId, threadId: thread.id, emailMessageId: emailMessage.id, contactId, classification: analysis.classification, summary: analysis.summary, aiDraft: autoDraft.draft || null, aiConfidence: analysis.confidence, needsAttention: analysis.needsAttention || autoDraft.needsAttention } });
    const needsAttention = analysis.needsAttention || autoDraft.needsAttention;
    const updateContact = analysis.classification === "BOUNCE" ? { status: "bounced" as const } : analysis.classification === "UNSUBSCRIBE" ? { status: "unsubscribed" as const } : analysis.classification === "NOT_INTERESTED" ? { status: "not_interested" as const } : analysis.classification === "INTERESTED" ? { status: "interested" as const } : isRealReply ? { status: "replied" as const } : undefined;
    if (analysis.classification === "BOUNCE") await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: { status: "BOUNCED" } });
    if (updateContact && contactId) await prisma.contact.updateMany({ where: { id: contactId, status: { notIn: ["unsubscribed", "bounced"] } }, data: updateContact });
    if (contactId && isRealReply) await cancelContactJobs(mailbox.workspaceId, contactId);
    if (analysis.classification === "BOUNCE" && contact) await prisma.suppressionList.upsert({ where: { workspaceId_email: { workspaceId: mailbox.workspaceId, email: contact.email } }, update: { reason: "bounce", source: "imap" }, create: { workspaceId: mailbox.workspaceId, email: contact.email, reason: "bounce", source: "imap" } });
    if (analysis.classification === "UNSUBSCRIBE" && contact) await prisma.suppressionList.upsert({ where: { workspaceId_email: { workspaceId: mailbox.workspaceId, email: contact.email } }, update: { reason: "unsubscribe", source: "imap" }, create: { workspaceId: mailbox.workspaceId, email: contact.email, reason: "unsubscribe", source: "imap" } });
    if (contactId && (isRealReply || analysis.classification === "BOUNCE")) await prisma.campaignContact.updateMany({ where: { contactId, completedAt: null }, data: { completedAt: new Date() } });
    if (analysis.classification === "INTERESTED" && contactId) { const existingDeal = await prisma.deal.findFirst({ where: { workspaceId: mailbox.workspaceId, contactId, stage: { notIn: ["WON", "LOST"] } } }); if (!existingDeal) await prisma.deal.create({ data: { workspaceId: mailbox.workspaceId, contactId, campaignId: matched?.campaignId, name: `${contact?.firstName ?? contact?.email ?? "Lead"} opportunity`, stage: "QUALIFIED", notes: analysis.summary } }); }
    if (needsAttention || analysis.classification === "INTERESTED") await prisma.notification.create({ data: { workspaceId: mailbox.workspaceId, type: needsAttention ? "NEEDS_ATTENTION" : "INTERESTED_LEAD", title: needsAttention ? "Reply needs attention" : "Interested lead", body: `${contact?.email ?? message.fromEmail}: ${analysis.summary}`, entityType: "Thread", entityId: thread.id } });
    const campaign = matched?.campaignId ? await prisma.campaign.findFirst({ where: { id: matched.campaignId, workspaceId: mailbox.workspaceId, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { replyMode: true } }) : null;
    if (campaign?.replyMode === "AUTO" && autoDraft.draft && !needsAttention && !["BOUNCE", "OUT_OF_OFFICE", "UNSUBSCRIBE", "NOT_INTERESTED"].includes(analysis.classification)) await getOutreachQueue().add("auto-reply", { workspaceId: mailbox.workspaceId, threadId: thread.id, replyId: reply.id, mailboxId: mailbox.id, toEmail: message.fromEmail, draft: autoDraft.draft }, { attempts: 3, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    await prisma.thread.update({ where: { id: thread.id }, data: { snippet: message.text.slice(0, 180), lastMessageAt: message.receivedAt, needsAttention, tags: needsAttention ? ["needs attention"] : undefined } });
    imported += 1;
  }
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { imapLastUid: result.lastUid, lastSyncedAt: new Date() } });
  return { imported };
}

export async function syncAllMailboxes() {
  const mailboxes = await prisma.mailbox.findMany({ where: { isActive: true, imapHost: { not: null }, imapPasswordEncrypted: { not: null } }, select: { id: true } });
  let imported = 0;
  for (const mailbox of mailboxes) { try { imported += (await processMailboxReplies(mailbox.id)).imported; } catch { /* mailbox health is handled by the next test/sync */ } }
  return imported;
}
