"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
export function UnsubscribeForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to unsubscribe. Please try again.");
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  if (done) return <p role="status" className="mt-3 text-sm text-muted">You have been unsubscribed from this sender. Future outreach to your address will be blocked.</p>;
  if (!token) return <p className="mt-3 text-sm text-muted">Open the unsubscribe link from the email you received.</p>;
  return <form onSubmit={submit} className="mt-6 space-y-4"><p className="text-sm text-muted">Stop future outreach from this sender to the address that received this email.</p>{error && <p role="alert" className="text-sm text-coral">{error}</p>}<button disabled={busy} className="h-11 w-full rounded-xl bg-strong text-sm font-semibold text-white disabled:opacity-50">{busy ? "Unsubscribing..." : "Unsubscribe me"}</button></form>;
}
