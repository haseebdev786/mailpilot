import { Worker, DelayedError, type Job } from "bullmq";
import { logger, createWorkerConnection, getOutreachQueue, closeQueue } from "@mailpilot/shared";
import { processContactImport } from "./contact-import";
import { processCampaignSend } from "./campaign-send";
import { processAutoReply } from "./auto-reply";
import { syncAllMailboxes } from "./reply-sync";
import { processFollowupSend } from "./followup-send";

const redisConnection = createWorkerConnection();

// Redis may still be starting (or come back later). Retry instead of crashing
// the whole worker on the very first connection attempt.
async function waitForQueue() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await getOutreachQueue().setGlobalConcurrency(1);
      return;
    } catch (error) {
      logger.error("queue_waiting_for_redis", { attempt, error: error instanceof Error ? error.message : "unknown" });
      await closeQueue().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, attempt * 1_000)));
    }
  }
}

await waitForQueue();
const worker = new Worker("outreach", async (job: Job, token?: string) => {
  logger.info("queue_job_received", { jobId: job.id, jobName: job.name });
  if (job.name === "contact-import") return processContactImport(job.data);
  if (job.name === "campaign-send" || job.name === "followup-send") {
    const result = job.name === "campaign-send" ? await processCampaignSend(job.data) : await processFollowupSend(job.data);
    if ("rescheduled" in result && result.rescheduled && "delay" in result) {
      await job.moveToDelayed(Date.now() + result.delay, token);
      throw new DelayedError();
    }
    return result;
  }
  if (job.name === "auto-reply") return processAutoReply(job.data);
  return { accepted: true, jobName: job.name };
}, { connection: redisConnection, concurrency: 1 });

worker.on("completed", (job) => logger.info("queue_job_completed", { jobId: job.id, jobName: job.name }));
worker.on("failed", async (job, error) => {
  logger.error("queue_job_failed", { jobId: job?.id, jobName: job?.name, error: error.message });
  if (job && ["campaign-send", "followup-send"].includes(job.name) && job.data?.campaignId && job.data?.contactId) await prismaSafeRecordCampaignError(job.data.campaignId, job.data.contactId, error.message);
});
worker.on("error", (error) => logger.error("queue_worker_error", { error: error.message }));

async function prismaSafeRecordCampaignError(campaignId: string, contactId: string, message: string) {
  try { const { prisma } = await import("@mailpilot/shared/db"); await prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId, contactId } }, data: { lastError: message.slice(0, 500) } }); } catch (error) { logger.error("queue_error_record_failed", { campaignId, contactId, error: error instanceof Error ? error.message : "unknown" }); }
}

async function shutdown(signal: string) { logger.info("queue_worker_shutdown", { signal }); clearInterval(replyPoller); await worker.close(); await closeQueue(); await redisConnection.quit(); process.exit(0); }
process.on("SIGTERM", () => void shutdown("SIGTERM")); process.on("SIGINT", () => void shutdown("SIGINT"));
logger.info("queue_worker_ready", { queue: "outreach", concurrency: 1 });
let syncing = false;
async function pollReplies() {
  if (syncing) return;
  syncing = true;
  try { await syncAllMailboxes(); }
  catch (error) { logger.error("imap_sync_failed", { error: error instanceof Error ? error.message : "unknown" }); }
  finally { syncing = false; }
}
const replyPoller = setInterval(() => { void pollReplies(); }, 90_000);
void pollReplies();
