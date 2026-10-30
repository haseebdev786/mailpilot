"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type FailedJob = { id: string; jobName: string; jobId: string | null; error: string; attempts: number; failedAt: string };

export function FailedJobsManager() {
  const [jobs, setJobs] = useState<FailedJob[]>([]);
  const [queueFailed, setQueueFailed] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/failed-jobs");
      const data = await response.json() as { failedJobs?: FailedJob[]; queueFailed?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load failed jobs.");
      setJobs(data.failedJobs ?? []);
      setQueueFailed(data.queueFailed ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load failed jobs.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function act(failedJobId: string, action: "resolve" | "retry") {
    setMessage(null);
    const response = await fetch("/api/admin/failed-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ failedJobId, action }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setMessage(data.error ?? "Action failed.");
    await load();
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Workspace / operations</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-0.04em]">Failed jobs (dead-letter)</h2>
      <p className="mt-1 text-xs text-muted">Only final queue failures are recorded here. Resolve hides an entry; retry re-queues campaign and follow-up sends.{queueFailed !== null && queueFailed >= 0 ? ` Queue failed count: ${queueFailed}.` : ""}</p>
      {message && <div className="mt-4 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs leading-5 text-coral">{message}</div>}
      {loading ? <p className="mt-4 text-sm text-muted">Loading…</p> : jobs.length === 0 ? <p className="mt-4 text-sm text-muted">No unresolved failed jobs.</p> : (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{job.jobName} · {new Date(job.failedAt).toLocaleString()} · {job.attempts} attempt(s)</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => void act(job.id, "retry")}>Retry</Button><Button type="button" variant="secondary" onClick={() => void act(job.id, "resolve")}>Resolve</Button></div></div>
              <p className="mt-2 text-xs leading-5 text-muted">{job.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
