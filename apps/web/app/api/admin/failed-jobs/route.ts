import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@mailpilot/shared/db";
import { getOutreachQueue } from "@mailpilot/shared/queue";
import { getCurrentAuth } from "@/lib/auth";

export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (auth.role !== "OWNER") return NextResponse.json({ error: "Only workspace owners can view failed jobs." }, { status: 403 });
  const jobs = await prisma.failedJob.findMany({ where: { workspaceId: auth.workspace.id, resolvedAt: null }, orderBy: { failedAt: "desc" }, take: 100 });
  let queueFailed = 0;
  try {
    const counts = await getOutreachQueue().getJobCounts("failed");
    queueFailed = counts.failed ?? 0;
  } catch {
    queueFailed = -1;
  }
  return NextResponse.json({ failedJobs: jobs, queueFailed });
}

const actionSchema = z.object({ failedJobId: z.string().min(1), action: z.enum(["resolve", "retry"]) });

export async function POST(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (auth.role !== "OWNER") return NextResponse.json({ error: "Only workspace owners can resolve failed jobs." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  const job = await prisma.failedJob.findFirst({ where: { id: parsed.data.failedJobId, workspaceId: auth.workspace.id, resolvedAt: null } });
  if (!job) return NextResponse.json({ error: "Failed job not found." }, { status: 404 });
  if (parsed.data.action === "resolve") {
    await prisma.failedJob.update({ where: { id: job.id }, data: { resolvedAt: new Date() } });
    return NextResponse.json({ ok: true, action: "resolve" });
  }
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const jobName = job.jobName;
  if (jobName === "campaign-send" || jobName === "followup-send") {
    if (typeof payload.campaignId !== "string" || typeof payload.contactId !== "string" || typeof payload.workspaceId !== "string") {
      return NextResponse.json({ error: "This failed job has no retryable payload." }, { status: 400 });
    }
    try {
      await getOutreachQueue().add(jobName, payload, { jobId: `retry-${job.id}`, attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    } catch {
      return NextResponse.json({ error: "Queue unavailable. Start Redis and the worker, then try again." }, { status: 503 });
    }
  }
  await prisma.failedJob.update({ where: { id: job.id }, data: { resolvedAt: new Date() } });
  return NextResponse.json({ ok: true, action: "retry", retried: jobName === "campaign-send" || jobName === "followup-send" });
}
