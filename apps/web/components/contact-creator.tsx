"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

export function ContactCreator({ lists, preferredListId, onCreated }: { lists: Array<{ id: string; name: string }>; preferredListId: string; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", listId: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (preferredListId) setForm((current) => ({ ...current, listId: preferredListId }));
  }, [preferredListId]);
  useEffect(() => {
    setForm((current) => current.listId || !lists.length ? current : { ...current, listId: lists[0].id });
  }, [lists]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      await readApiResponse(response);
      setForm((current) => ({ ...current, name: "", email: "", company: "" }));
      setMessage("Contact added. A list with one contact can be used for a single email campaign.");
      await onCreated();
    } catch (err) { setFailed(true); setMessage(err instanceof Error ? err.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-panel p-5"><div><h2 className="text-lg font-bold">Add a contact</h2><p className="mt-1 text-xs text-muted">For a single email, add one person to a list. For bulk outreach, import a CSV or Excel file.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["name", "email", "company"] as const).map((key) => <label key={key} className="text-xs font-semibold capitalize">{key}<input className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm font-normal" type={key === "email" ? "email" : "text"} required={key === "email"} maxLength={160} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="text-xs font-semibold">Contact list<select required className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm font-normal" value={form.listId} onChange={(event) => setForm((current) => ({ ...current, listId: event.target.value }))}><option value="">Choose a list</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label></div><Button disabled={busy || !lists.length} type="submit">{busy ? "Adding..." : "Add contact"}</Button>{!lists.length && <p className="text-xs text-muted">Create a contact list above first. It will be selected here automatically.</p>}{message && <p role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-coral" : "text-signal"}`}>{message}</p>}</form>;
}
