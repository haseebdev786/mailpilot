"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recommendation = { businessDescription: string; audience: string; rationale: string; tone: string; cta: string; templates: Array<{ name: string; subject: string; text: string }> };
export type RecommendedTemplate = { businessDescription: string; tone: string; cta: string; templateSubject: string; templateText: string };

export function OutreachAdvisor({ businessDescription, services, signature, onApply }: { businessDescription: string; services: string; signature: string; onApply: (value: RecommendedTemplate) => void }) {
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  async function recommend() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessDescription, services, audience, signature }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate recommendations");
      setResult(data.recommendation); setSource(data.source);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-signal/40 bg-signal/5 p-4" aria-label="Outreach recommendations">
    <div><h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} /> Recommend my outreach</h3><p className="mt-2 text-xs leading-5 text-muted">Describe your business and services above, then get a suggested audience and an editable email template.</p></div>
    <label className="block text-xs font-semibold">Who would you like to reach? <span className="font-normal text-muted">(optional)</span><input className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm" value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={500} placeholder="For example, founders of small online stores" /></label>
    <Button type="button" variant="secondary" onClick={() => void recommend()} disabled={busy || businessDescription.trim().length < 10 || services.trim().length < 2}>{busy ? "Preparing recommendations..." : "Suggest description & templates"}</Button>
    {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    {result && <div className="space-y-4" aria-live="polite"><p className="text-xs font-semibold">{source === "ai" ? "AI recommendation — review before using" : "Starter template — AI is not configured"}</p><p className="text-xs leading-5"><strong>Suggested description:</strong> {result.businessDescription}</p><p className="text-xs leading-5"><strong>Suggested audience:</strong> {result.audience}</p><p className="text-xs leading-5 text-muted">{result.rationale}</p>{result.templates.map((template) => <div key={template.name} className="space-y-3 rounded-xl border border-line bg-panel p-4"><h4 className="text-sm font-semibold">{template.name}</h4><p className="text-xs font-semibold">{template.subject}</p><p className="whitespace-pre-wrap text-xs leading-6">{template.text}</p><Button type="button" variant="secondary" onClick={() => onApply({ businessDescription: result.businessDescription, tone: result.tone, cta: result.cta, templateSubject: template.subject, templateText: template.text })}>Use this template</Button></div>)}</div>}
  </section>;
}
