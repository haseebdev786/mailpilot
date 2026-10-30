"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ListCreator() {
  const [name, setName] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function create() { if (!name.trim()) return; setSaving(true); setMessage(null); const response = await fetch("/api/contact-lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); const data = await response.json() as { error?: string }; setSaving(false); if (!response.ok) setMessage(data.error ?? "Unable to create list"); else { setMessage("List created. Refresh the import mapping to use it."); setName(""); } }
  return <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Audience / lists</p><p className="mt-1 text-xs text-muted">Create a list to use during imports and campaign setup.</p></div><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="List name" className="sm:max-w-xs" onKeyDown={(event) => { if (event.key === "Enter") void create(); }} /><Button variant="secondary" onClick={() => void create()} disabled={saving || !name.trim()}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Create list</Button>{message && <span className="text-[11px] text-muted">{message}</span>}</div>;
}
