"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BarChart3, BookOpen, ContactRound, Inbox, LayoutDashboard, LogOut, Mail, Moon, PanelLeft, Plus, Settings, Sun, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Zap },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/mailboxes", label: "Mailboxes", icon: Mail },
  { href: "/knowledge-base", label: "Knowledge base", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: Zap }
] as const;

export function DashboardShell({ children, user, workspace, emailVerified = true }: { children: React.ReactNode; user: { name: string | null; email: string }; workspace: { name: string }; emailVerified?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<"checking" | "ready" | "degraded">("checking");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  useEffect(() => { fetch("/api/health").then((response) => response.json()).then((data: { ok?: boolean; redis?: string }) => setHealth(data.ok && data.redis === "ready" ? "ready" : "degraded")).catch(() => setHealth("degraded")); }, []);
  async function resendVerification() { const response = await fetch("/api/auth/verify-email/request", { method: "POST" }); const data = await response.json() as { error?: string }; setVerifyMessage(response.ok ? "Verification link sent (if transactional mail is configured, check your inbox)." : data.error ?? "Unable to resend verification link."); }
  useEffect(() => { const stored = window.localStorage.getItem("mailpilot-theme"); const enabled = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches); setDark(enabled); document.documentElement.classList.toggle("dark", enabled); }, []);
  function toggleTheme() { const next = !dark; setDark(next); document.documentElement.classList.toggle("dark", next); window.localStorage.setItem("mailpilot-theme", next ? "dark" : "light"); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  const initials = (user.name ?? user.email).split(/[\s@]+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <div className="min-h-screen bg-canvas text-ink"><aside className={cn("fixed inset-y-0 left-0 z-30 flex w-[254px] flex-col border-r border-line bg-panel px-4 py-5 transition-transform lg:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full")}><div className="flex items-center justify-between px-2"><a href="/dashboard" className="flex items-center gap-2.5"><span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-strong text-mint"><Activity size={16} /><span className="signal-dot absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-signal" /></span><span><span className="block text-sm font-bold tracking-[-0.04em]">MailPilot</span><span className="block font-mono text-[8px] uppercase tracking-[0.2em] text-muted">Outreach OS</span></span></a><button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="text-muted lg:hidden"><PanelLeft size={17} /></button></div><div className="mt-8 rounded-2xl border border-line bg-canvas/70 p-3"><p className="px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Workspace</p><div className="mt-2 rounded-lg px-1 py-1 text-left text-xs font-semibold text-ink"><span className="truncate">{workspace.name}</span></div><div className="mt-3 flex items-center gap-2 border-t border-line pt-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal text-[9px] font-bold text-signal-foreground">{initials}</span><span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{user.name ?? "Workspace owner"}</span><span className="block truncate text-[10px] text-muted">{user.email}</span></span></div></div><div className="mt-7 flex-1"><p className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Command center</p><nav className="space-y-1">{navItems.map((item) => { const active = pathname === item.href; const Icon = item.icon; return <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition", active ? "bg-signal/15 text-signal ring-1 ring-inset ring-signal/25" : "text-muted hover:bg-canvas hover:text-ink")}><Icon size={16} strokeWidth={active ? 2.4 : 1.9} /><span>{item.label}</span></a>; })}</nav></div><div className="space-y-2 border-t border-line pt-4"><button onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-muted transition hover:bg-canvas hover:text-ink">{dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}</button><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-muted transition hover:bg-canvas hover:text-ink"><LogOut size={16} /> Log out</button></div></aside><div className="lg:pl-[254px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-line bg-canvas/85 px-5 backdrop-blur-xl lg:px-9"><div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted hover:bg-panel lg:hidden"><PanelLeft size={18} /></button><div className="hidden items-center gap-2 text-[11px] text-muted sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-signal" /> {health === "checking" ? "Checking system…" : health === "ready" ? "System ready" : "System degraded — check /api/health"}</div></div><div className="flex items-center gap-3"><Button variant="secondary" size="sm" onClick={() => router.push("/campaigns")}><Plus size={14} /> New campaign</Button><NotificationsBell /></div></header><main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-9 lg:py-10">{!emailVerified && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-signal/30 bg-signal/10 px-4 py-3 text-xs"><span>Your email is not verified yet. Some launches may be restricted when verification is required.</span><button onClick={() => void resendVerification()} className="font-semibold underline">Resend verification link</button>{verifyMessage && <span className="w-full text-muted">{verifyMessage}</span>}</div>}{children}</main></div>{mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/55 lg:hidden" />}</div>;
}
