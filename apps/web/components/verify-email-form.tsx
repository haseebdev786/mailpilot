"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function VerifyEmailForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Verification failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to resend.");
      setMessage("If that account exists and is unverified, a new verification link has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to resend.");
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-[-0.055em]">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Click below to confirm this address and enter your workspace.</p>
        {message && <div role="alert" className="mt-5 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs leading-5 text-coral">{message}</div>}
        <form onSubmit={verify} className="mt-6"><Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Verifying…" : "Verify email"}</Button></form>
      </div>
    );
  }
  return (
    <div className="w-full max-w-md">
      <h1 className="text-4xl font-bold tracking-[-0.055em]">Resend verification</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Enter the email you signed up with and we will send a fresh link.</p>
      {message && <div className="mt-5 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs leading-5">{message}</div>}
      <form onSubmit={resend} className="mt-6 space-y-4">
        <div><Label htmlFor="verify-email">Email address</Label><Input id="verify-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send verification link"}</Button>
      </form>
    </div>
  );
}
