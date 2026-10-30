import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

export function EmptyState({ icon: Icon, eyebrow, title, description, action, actionHref = "/dashboard" }: { icon: LucideIcon; eyebrow: string; title: string; description: string; action?: string; actionHref?: string }) {
  return <div className="relative overflow-hidden rounded-2xl border border-dashed border-line bg-panel px-6 py-14 text-center"><div className="signal-grid pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40" /><div className="relative mx-auto max-w-md"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-signal/30 bg-signal/10 text-signal"><Icon size={21} /></div><p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{eyebrow}</p><h3 className="mt-3 text-xl font-bold tracking-[-0.04em] text-ink">{title}</h3><p className="mt-3 text-sm leading-6 text-muted">{description}</p>{action && <a href={actionHref} className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-ink underline decoration-signal decoration-2 underline-offset-4">{action}<ArrowUpRight size={14} /></a>}</div></div>;
}
