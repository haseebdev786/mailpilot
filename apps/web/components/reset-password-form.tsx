"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function forgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to send reset link.");
      setMessage("If that account exists, a password reset link has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Reset failed.");
      setMessage("Password updated. You can now log in with the new password.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-[-0.055em]">Choose a new password</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Reset links are valid for 1 hour and can only be used once.</p>
        {message && <div className="mt-5 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs leading-5">{message}</div>}
        <form onSubmit={reset} className="mt-6 space-y-4">
          <div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
        <p className="mt-5 text-center text-xs text-muted"><a href="/login" className="underline">Back to login</a></p>
      </div>
    );
  }
  return (
    <div className="w-full max-w-md">
      <h1 className="text-4xl font-bold tracking-[-0.055em]">Forgot password?</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Enter your email and we will send a reset link if the account exists.</p>
      {message && <div className="mt-5 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs leading-5">{message}</div>}
      <form onSubmit={forgot} className="mt-6 space-y-4">
        <div><Label htmlFor="forgot-email">Email address</Label><Input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted"><a href="/login" className="underline">Back to login</a></p>
    </div>
  );
}
