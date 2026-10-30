"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function AuthForm({ initialError, demoEnabled = false, demoEmail, demoPassword }: { initialError?: string; demoEnabled?: boolean; demoEmail?: string; demoPassword?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ? "Google sign-in is not configured yet. Add the Google variables from .env.example to enable it." : "");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  async function demoLogin() {
    setDemoBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to start the demo session.");
      router.push("/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start the demo session.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const data = await response.json() as { error?: string; requiresVerification?: boolean; sessionCreated?: boolean };
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
      if (mode === "signup" && data.requiresVerification && data.sessionCreated === false) { setError("Account created. Check your email for the verification link, then log in."); return; }
      router.push("/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="w-full max-w-md">
    <div className="mb-10 flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-strong text-mint shadow-glow"><Sparkles size={18} strokeWidth={2.3} /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-signal" /></div>
      <div><p className="text-lg font-bold tracking-[-0.04em]">MailPilot</p><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">Signal, not noise</p></div>
    </div>
    <div className="mb-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{mode === "login" ? "Workspace access" : "Create workspace"}</p>
      <h1 className="text-4xl font-bold tracking-[-0.055em] text-ink">{mode === "login" ? "Turn replies into momentum." : "Start with a clean signal."}</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{mode === "login" ? "Your outreach cockpit for thoughtful follow-up, automated when it should be." : "Build an outreach system that stays clear, personal, and under your control."}</p>
    </div>
    <div className="mb-6 flex rounded-xl border border-line bg-panel p-1">
      {(["login", "signup"] as const).map((value) => <button key={value} type="button" onClick={() => { setMode(value); setError(""); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === value ? "bg-strong text-white" : "text-muted hover:text-ink"}`}>{value === "login" ? "Log in" : "Create account"}</button>)}
    </div>
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" && <div><Label htmlFor="name">Full name</Label><div className="relative"><UserRound className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" className="pl-10" autoComplete="name" required /></div></div>}
      <div><Label htmlFor="email">Email address</Label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="pl-10" autoComplete="email" required /></div></div>
      <div><Label htmlFor="password">Password</Label><div className="relative"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "8 characters minimum" : "••••••••"} className="pl-10 pr-10" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : 1} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-muted hover:text-ink">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
      {error && <div role="alert" className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs leading-5 text-coral">{error}</div>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Connecting…" : mode === "login" ? "Enter workspace" : "Create workspace"}<ArrowRight size={16} /></Button>
    </form>
    {demoEnabled && <div className="mt-4 rounded-xl border border-dashed border-signal/60 bg-signal/10 p-3">
      <p className="text-xs font-semibold text-ink">Try it with the demo account</p>
      <p className="mt-1 font-mono text-[10px] text-muted">{demoEmail} · {demoPassword}</p>
      <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => void demoLogin()} disabled={busy || demoBusy}>{demoBusy ? "Opening demo…" : "Use demo account"}</Button>
    </div>}
    <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-line" /><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">or continue with</span><div className="h-px flex-1 bg-line" /></div>
    <a href="/api/auth/google" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-panel text-sm font-semibold text-ink transition hover:border-signal/50 hover:shadow-glow"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-strong text-[10px] font-bold text-white">G</span> Google</a>
    <p className="mt-4 text-center text-[11px] leading-5 text-muted"><a href="/forgot-password" className="underline">Forgot password?</a> · <a href="/verify-email" className="underline">Resend verification link</a></p>
    <p className="mt-3 text-center text-[11px] leading-5 text-muted">By continuing, you agree to keep your outreach respectful and permission-based.</p>
  </div>;
}
