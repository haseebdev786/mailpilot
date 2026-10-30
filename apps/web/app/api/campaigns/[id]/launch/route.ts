import { NextResponse } from "next/server";
import { prisma } from "@mailpilot/shared/db";
import { getOutreachQueue } from "@mailpilot/shared/queue";
import { STOP_CONTACT_STATUSES, sendingWindowDelay } from "@mailpilot/shared/sending-policy";
import { checkActiveCampaignLimit, checkMonthlySendLimit, PlanLimitError } from "@mailpilot/shared/billing";
import { getCurrentAuth } from "@/lib/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: auth.workspace.id },
    include: { recipients: { where: { completedAt: null, contact: { status: { notIn: [...STOP_CONTACT_STATUSES] } } }, include: { contact: { select: { email: true } } }, orderBy: { enrolledAt: "asc" } }, mailboxes: { include: { mailbox: true } }, steps: { orderBy: { position: "asc" } } }
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "DRAFT") return NextResponse.json({ error: "Only a draft can be launched. Use Resume for a paused campaign." }, { status: 409 });
  if (!campaign.mailboxes.length || campaign.mailboxes.some(({ mailbox }) => !mailbox.isActive || mailbox.healthStatus !== "CONNECTED" || (!mailbox.smtpPasswordEncrypted && !mailbox.oauthRefreshTokenEncrypted))) {
    return NextResponse.json({ error: "Connect and test every selected mailbox before launching." }, { status: 400 });
  }
  try { await checkActiveCampaignLimit(auth.workspace.id); await checkMonthlySendLimit(auth.workspace.id); } catch (error) { if (error instanceof PlanLimitError) return NextResponse.json({ error: error.message }, { status: 402 }); throw error; }
  const suppressions = await prisma.suppressionList.findMany({ where: { workspaceId: auth.workspace.id }, select: { email: true } });
  const suppressed = new Set(suppressions.map((entry) => entry.email));
  let recipients = campaign.recipients.filter((recipient) => !suppressed.has(recipient.contact.email));
  if (!recipients.length) return NextResponse.json({ error: "Add at least one eligible recipient before launching." }, { status: 400 });
  let claimed = false;
  try {
    const queue = getOutreachQueue();
    await queue.getJobCounts("waiting");
    const updated = await prisma.campaign.updateMany({ where: { id, workspaceId: auth.workspace.id, status: "DRAFT" }, data: { status: "ACTIVE", launchedAt: new Date(), pausedAt: null } });
    if (!updated.count) return NextResponse.json({ error: "This campaign has already been launched." }, { status: 409 });
    claimed = true;
    // A recipient edit may have committed while Redis was being checked.
    // Once ACTIVE is claimed, edits are locked; read the final saved selection.
    const savedRecipients = await prisma.campaignContact.findMany({ where: { campaignId: id, completedAt: null, contact: { workspaceId: auth.workspace.id, status: { notIn: [...STOP_CONTACT_STATUSES] } } }, include: { contact: { select: { email: true } } }, orderBy: { enrolledAt: "asc" } });
    recipients = savedRecipients.filter((recipient) => !suppressed.has(recipient.contact.email));
    if (!recipients.length) {
      await prisma.campaign.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "DRAFT", launchedAt: null } });
      return NextResponse.json({ error: "No eligible recipients remain. Review and save your recipient selection." }, { status: 400 });
    }
    let delay = 0;
    await queue.addBulk(recipients.map((recipient) => {
      delay += (campaign.sendingDelayMin + Math.floor(Math.random() * (campaign.sendingDelayMax - campaign.sendingDelayMin + 1))) * 1000;
      return { name: "campaign-send", data: { campaignId: id, contactId: recipient.contactId, workspaceId: auth.workspace.id }, opts: { jobId: `initial-${id}-${recipient.contactId}`, delay: Math.max(delay, 1000), attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 1000 } };
    }));
    const eligible = new Set(recipients.map((recipient) => recipient.contactId));
    await prisma.campaignContact.updateMany({ where: { campaignId: id, contactId: { notIn: [...eligible] }, completedAt: null }, data: { completedAt: new Date() } });
    // Tell the UI when the first email can actually leave, so a closed sending
    // window does not look like a broken worker.
    const windowDelay = sendingWindowDelay(campaign);
    return NextResponse.json({ ok: true, queued: recipients.length, windowDelay, timezone: campaign.timezone });
  } catch {
    // A lost Redis acknowledgement may still have created jobs. Stable job IDs
    // and durable send reservations make a later retry safe.
    if (claimed) await prisma.campaign.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "DRAFT", launchedAt: null } });
    return NextResponse.json({ error: "Unable to queue campaign. Check Redis and start the worker, then try again." }, { status: 503 });
  }
}
