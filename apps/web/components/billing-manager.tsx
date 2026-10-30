"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Plan = { code: string; name: string; monthlyPrice: number; maxMailboxes: number; maxContacts: number; maxActiveCampaigns: number; monthlySendLimit: number; monthlyAiCalls: number };
type BillingData = { plan: Plan; subscriptionStatus: string | null; subscriptionActive: boolean; currentPeriodEnd: string | null; hasStripeCustomer: boolean; usage: { mailboxes: number; contacts: number; activeCampaigns: number; monthlySends: number; monthlyAiCalls: number }; plans: Plan[]; stripeConfigured: boolean };

export function BillingManager() {
  const [data, setData] = useState<BillingData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/billing");
      const json = await response.json() as BillingData;
      if (response.ok) setData(json);
    } catch { /* billing is informational; the rest of settings still works */ }
  }
  useEffect(() => { void load(); }, []);

  async function checkout(planCode: string, interval: "MONTH" | "YEAR") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode, interval }) });
      const json = await response.json() as { url?: string; error?: string };
      if (!response.ok || !json.url) throw new Error(json.error ?? "Unable to start checkout.");
      window.location.href = json.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const json = await response.json() as { url?: string; error?: string };
      if (!response.ok || !json.url) throw new Error(json.error ?? "Unable to open the billing portal.");
      window.location.href = json.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open the billing portal.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">Loading billing…</div>;
  const rows: Array<[string, number, number]> = [
    ["Mailboxes", data.usage.mailboxes, data.plan.maxMailboxes],
    ["Contacts", data.usage.contacts, data.plan.maxContacts],
    ["Active campaigns", data.usage.activeCampaigns, data.plan.maxActiveCampaigns],
    ["Sends this period", data.usage.monthlySends, data.plan.monthlySendLimit],
    ["AI calls this period", data.usage.monthlyAiCalls, data.plan.monthlyAiCalls]
  ];
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Workspace / billing</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-0.04em]">Plan: {data.plan.name}</h2>
      <p className="mt-1 text-xs text-muted">Status: {data.subscriptionStatus ?? "none"}{data.currentPeriodEnd ? ` · renews ${new Date(data.currentPeriodEnd).toLocaleDateString()}` : ""}</p>
      {message && <div className="mt-4 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs leading-5 text-coral">{message}</div>}
      {!data.stripeConfigured && <p className="mt-4 rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs leading-5 text-muted">Stripe is not configured yet, so checkout is unavailable. Plan limits are still enforced on the server.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, used, limit]) => (
          <div key={label} className="rounded-xl bg-canvas p-3"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{label}</p><p className="mt-2 text-sm font-semibold">{used} / {limit}</p></div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {data.plans.filter((plan) => plan.code !== "free").map((plan) => (
          <Button key={plan.code} type="button" variant="secondary" disabled={busy || !data.stripeConfigured || data.plan.code === plan.code} onClick={() => void checkout(plan.code, "MONTH")}>
            {data.plan.code === plan.code ? `Current: ${plan.name}` : `Upgrade to ${plan.name} — $${(plan.monthlyPrice / 100).toFixed(0)}/mo`}
          </Button>
        ))}
        {data.hasStripeCustomer && <Button type="button" variant="secondary" disabled={busy} onClick={() => void portal()}>Manage billing in Stripe</Button>}
      </div>
    </div>
  );
}
