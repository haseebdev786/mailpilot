import { BillingManager } from "@/components/billing-manager";
import { ComplianceManager } from "@/components/compliance-manager";
import { FailedJobsManager } from "@/components/failed-jobs-manager";
export default function SettingsPage() { return <div className="space-y-8"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Workspace / settings</p><h1 className="mt-3 text-4xl font-bold tracking-[-0.06em]">Settings</h1><p className="mt-3 text-sm text-muted">Protect your sending reputation and keep outreach compliant.</p></div><BillingManager /><FailedJobsManager /><ComplianceManager /></div>; }
