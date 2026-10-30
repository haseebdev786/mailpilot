import crypto from "node:crypto";
import { UnrecoverableError } from "bullmq";
import { prisma } from "@mailpilot/shared/db";
import { createSmtpProvider } from "@mailpilot/shared/mail";
import { generatePersonalizedEmail, generateFollowUpEmail } from "@mailpilot/shared/campaign-ai";
import { getOutreachQueue } from "@mailpilot/shared/queue";
import { complianceFooter } from "@mailpilot/shared/compliance";
import { renderTemplate, textToHtml } from "@mailpilot/shared/email-content";
import { mailboxSendLimit, sendingWindowDelay, STOP_CONTACT_STATUSES } from "@mailpilot/shared/sending-policy";
import { checkAiUsageLimit, checkMonthlySendLimit, PlanLimitError, recordAiUsage } from "@mailpilot/shared/billing";
import { configuredProviderName, isAiConfigured } from "@mailpilot/shared/ai";
import { getMailboxCredentials, mailboxHasUsableCredentials } from "@mailpilot/shared/mailbox-credentials";

export type SendData = { campaignId: string; contactId: string; workspaceId: string; stepId?: string };
const defer = (delay: number, reason: string) => ({ rescheduled: true, delay, reason });
const blockedStatus = (status: string) => (STOP_CONTACT_STATUSES as readonly string[]).includes(status);
const acceptedStatuses = ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"] as const;

async function completeIfFinished(campaignId: string) {
  if (await prisma.campaignContact.count({ where: { campaignId, completedAt: null } }) === 0) {
    await prisma.campaign.updateMany({ where: { id: campaignId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  }
}

export async function processOutreachSend(data: SendData) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: data.campaignId, workspaceId: data.workspaceId },
    include: { mailboxes: { include: { mailbox: true }, orderBy: { position: "asc" } }, steps: { where: { type: "EMAIL" }, orderBy: { position: "asc" } }, recipients: { where: { contactId: data.contactId, contact: { workspaceId: data.workspaceId } }, include: { contact: true } } }
  });
  if (!campaign || ["ARCHIVED", "COMPLETED"].includes(campaign.status)) return { skipped: true };
  if (campaign.status !== "ACTIVE") return defer(60_000, "campaign_not_active");
  const recipient = campaign.recipients[0];
  const step = data.stepId ? campaign.steps.find((item) => item.id === data.stepId) : campaign.steps.find((item) => item.position === 0);
  if (!recipient || !step) return { skipped: true };
  if (recipient.completedAt) { await completeIfFinished(campaign.id); return { skipped: true }; }
  const contact = recipient.contact;
  const isSuppressed = async () => Boolean(await prisma.suppressionList.findUnique({ where: { workspaceId_email: { workspaceId: data.workspaceId, email: contact.email } }, select: { id: true } }));
  if (blockedStatus(contact.status) || await isSuppressed()) {
    await prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } }, data: { completedAt: new Date() } });
    await completeIfFinished(campaign.id);
    return { skipped: true, reason: "recipient_stopped" };
  }

  const nextStep = campaign.steps.find((item) => item.position > step.position);
  async function scheduleNext(sentAt: Date) {
    if (!nextStep) { await completeIfFinished(campaign!.id); return; }
    await getOutreachQueue().add("followup-send", { ...data, stepId: nextStep.id }, {
      jobId: `followup-${campaign!.id}-${contact.id}-${nextStep.id}`,
      delay: Math.max(0, sentAt.getTime() + nextStep.delayHours * 3_600_000 - Date.now()),
      attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 1000
    });
  }

  const deliveryId = "send-" + crypto.createHash("sha256").update([data.workspaceId, campaign.id, contact.id, step.id].join("/")).digest("hex");
  const previousAttempt = await prisma.emailMessage.findFirst({ where: { OR: [
    { id: deliveryId },
    { workspaceId: data.workspaceId, campaignId: campaign.id, contactId: contact.id, direction: "OUTBOUND", NOT: { subject: { startsWith: "[Test] " } }, ...(step.position === 0 ? { OR: [{ sequenceStepId: step.id }, { sequenceStepId: null, threadId: null }] } : { sequenceStepId: step.id }) }
  ] }, orderBy: { createdAt: "asc" } });
  if (previousAttempt) {
    if ((acceptedStatuses as readonly string[]).includes(previousAttempt.status)) {
      await scheduleNext(previousAttempt.sentAt ?? previousAttempt.createdAt);
      return { skipped: true, reason: "already_sent" };
    }
    throw new UnrecoverableError("A previous delivery attempt needs manual review in the sending mailbox. Automatic resend is blocked to avoid duplicates.");
  }
  let prior = null;
  if (step.position > 0) {
    const priorStep = campaign.steps.filter((item) => item.position < step.position).at(-1)!;
    prior = await prisma.emailMessage.findFirst({ where: { workspaceId: data.workspaceId, campaignId: campaign.id, contactId: contact.id, direction: "OUTBOUND", status: { in: [...acceptedStatuses] }, ...(priorStep.position === 0 ? { OR: [{ sequenceStepId: priorStep.id }, { sequenceStepId: null, threadId: null }] } : { sequenceStepId: priorStep.id }) }, orderBy: { sentAt: "desc" } });
    if (!prior?.sentAt) return defer(60_000, "waiting_for_previous_step");
    const gap = prior.sentAt.getTime() + step.delayHours * 3_600_000 - Date.now();
    if (gap > 0) return defer(gap, "followup_gap");
  }
  const windowDelay = sendingWindowDelay(campaign);
  if (windowDelay) return defer(windowDelay, "outside_sending_window");
  const since = new Date(Date.now() - 86_400_000);
  const campaignCount = await prisma.emailMessage.count({ where: { campaignId: campaign.id, direction: "OUTBOUND", createdAt: { gte: since } } });
  if (campaignCount >= campaign.dailySendLimit) return defer(3_600_000, "campaign_daily_limit");
  const candidates = campaign.mailboxes.map((link) => link.mailbox).filter((mailbox) => mailbox.workspaceId === data.workspaceId && mailbox.isActive && mailbox.healthStatus === "CONNECTED" && mailboxHasUsableCredentials(mailbox));
  if (!candidates.length) throw new Error("No connected sending mailbox is available");
  // Counts include uncertain delivery reservations. Quotas use a rolling 24h window.
  let mailbox: typeof candidates[number] | undefined;
  let smallestDelay = 3_600_000;
  for (const candidate of candidates) {
    const [count, latest] = await Promise.all([
      prisma.emailMessage.count({ where: { mailboxId: candidate.id, direction: "OUTBOUND", createdAt: { gte: since } } }),
      prisma.emailMessage.findFirst({ where: { mailboxId: candidate.id, direction: "OUTBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    ]);
    if (count >= mailboxSendLimit(candidate)) continue;
    const seed = Number.parseInt(crypto.createHash("sha256").update(deliveryId + candidate.id).digest("hex").slice(0, 8), 16);
    const delaySeconds = campaign.sendingDelayMin + seed % (campaign.sendingDelayMax - campaign.sendingDelayMin + 1);
    const wait = latest ? latest.createdAt.getTime() + delaySeconds * 1000 - Date.now() : 0;
    if (wait > 0) { smallestDelay = Math.min(smallestDelay, wait); continue; }
    mailbox = candidate; break;
  }
  if (!mailbox) return defer(Math.max(1000, smallestDelay), "mailbox_limit_or_spacing");
  try { await checkMonthlySendLimit(data.workspaceId); } catch (error) { if (error instanceof PlanLimitError) return defer(3_600_000, "plan_monthly_send_limit"); throw error; }

  const needsAiDraft = step.position === 0
    ? !(step.subject && step.templateBody) && !(recipient.generatedSubject && recipient.generatedText)
    : true;
  if (needsAiDraft && isAiConfigured()) {
    try { await checkAiUsageLimit(data.workspaceId); } catch (error) { if (error instanceof PlanLimitError) return defer(3_600_000, "plan_ai_limit"); throw error; }
  }
  let draft: { subject: string; text: string };
  if (step.position === 0) {
    if (step.subject && step.templateBody) draft = { subject: renderTemplate(step.subject, contact), text: renderTemplate(step.templateBody, contact) };
    else if (recipient.generatedSubject && recipient.generatedText) draft = { subject: recipient.generatedSubject, text: recipient.generatedText };
    else {
      const generated = await generatePersonalizedEmail({ firstName: contact.firstName, company: contact.company, website: contact.website, businessDescription: campaign.businessDescription, services: campaign.services, offer: campaign.offer, tone: campaign.tone, cta: campaign.cta, signature: campaign.signature });
      if (generated.provider !== "local") await recordAiUsage(data.workspaceId, generated.provider, generated.model);
      draft = generated;
    }
  } else {
    draft = await generateFollowUpEmail({ firstName: contact.firstName, company: contact.company, previousSubject: prior?.subject, previousText: prior?.bodyText, instruction: step.templateBody, businessDescription: campaign.businessDescription, services: campaign.services, signature: campaign.signature });
    if (isAiConfigured()) await recordAiUsage(data.workspaceId, configuredProviderName());
  }
  if (!draft.subject.trim() || draft.subject.length > 200 || /[\r\n]/.test(draft.subject) || !draft.text.trim() || draft.text.length > 6000) throw new Error("Invalid email content");
  const html = textToHtml(draft.text);
  const credentials = await getMailboxCredentials(mailbox);
  const footer = complianceFooter({ workspaceId: data.workspaceId, businessName: mailbox.fromName, address: mailbox.businessAddress, email: contact.email });
  // AI generation may take time: check current state again immediately before SMTP.
  const [currentCampaign, currentContact, currentMailbox] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaign.id }, select: { status: true } }),
    prisma.contact.findUnique({ where: { id: contact.id }, select: { status: true } }),
    prisma.mailbox.findUnique({ where: { id: mailbox.id }, select: { isActive: true, healthStatus: true } })
  ]);
  if (currentCampaign?.status !== "ACTIVE") return defer(60_000, "campaign_changed");
  if (!currentContact || blockedStatus(currentContact.status) || await isSuppressed()) return { skipped: true, reason: "recipient_changed" };
  if (!currentMailbox?.isActive || currentMailbox.healthStatus !== "CONNECTED") return defer(60_000, "mailbox_changed");
  const messageId = `<${deliveryId}@${new URL(process.env.APP_URL ?? "http://localhost:3000").hostname}>`;
  // Persist a unique reservation before talking to SMTP. SMTP has no exactly-once
  // guarantee; an uncertain outcome must be reviewed instead of automatically resent.
  try {
    await prisma.emailMessage.create({ data: { id: deliveryId, workspaceId: data.workspaceId, mailboxId: mailbox.id, campaignId: campaign.id, sequenceStepId: step.id, contactId: contact.id, direction: "OUTBOUND", status: "SENDING", messageId, inReplyTo: prior?.messageId, fromEmail: mailbox.email, toEmail: contact.email, subject: draft.subject, bodyText: draft.text + footer.text, bodyHtml: html + footer.html } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { skipped: true, reason: "delivery_reserved" };
    throw error;
  }
  try {
    const sent = await createSmtpProvider(credentials).send({ from: mailbox.fromName ? `${JSON.stringify(mailbox.fromName)} <${mailbox.email}>` : mailbox.email, to: contact.email, subject: draft.subject, text: draft.text + footer.text, html: html + footer.html, messageId, inReplyTo: prior?.messageId ?? undefined, headers: { "List-Unsubscribe": `<${footer.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    const sentAt = new Date();
    await prisma.$transaction([
      prisma.emailMessage.update({ where: { id: deliveryId }, data: { status: "SENT", messageId: sent.messageId || messageId, sentAt } }),
      prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } }, data: { currentStep: step.position, completedAt: nextStep ? null : sentAt, lastError: null, ...(step.position === 0 ? { generatedSubject: draft.subject, generatedText: draft.text, generatedHtml: html, generatedAt: sentAt } : {}) } }),
      prisma.contact.updateMany({ where: { id: contact.id, status: { notIn: [...STOP_CONTACT_STATUSES] } }, data: { status: step.position === 0 ? "contacted" : "followed_up", lastContactedAt: sentAt } })
    ]);
  } catch {
    throw new UnrecoverableError("Delivery could not be confirmed. Check the sending mailbox before retrying; automatic resend is blocked.");
  }
  await scheduleNext(new Date());
  return { sent: true, contactId: contact.id, step: step.position };
}
