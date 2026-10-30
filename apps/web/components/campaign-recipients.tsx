"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { readApiResponse } from "@/lib/api-response";

type Contact = { id: string; firstName: string | null; lastName: string | null; email: string; status: string };
type List = { id: string; name: string; count: number };
type Props = { campaignId: string; status: string; lists: List[]; onSaved: (count: number) => void; onDirtyChange: (dirty: boolean) => void };

export function CampaignRecipients({ campaignId, status, lists, onSaved, onDirtyChange }: Props) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [listId, setListId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectionRetry, setSelectionRetry] = useState(0);
  const editable = status === "DRAFT";
  const dirty = selection.size !== saved.length || saved.some((id) => !selection.has(id));

  useEffect(() => { onDirtyChange(dirty || saving || !initialized); }, [dirty, saving, initialized, onDirtyChange]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/campaigns/${campaignId}/recipients`, { signal: controller.signal })
      .then((response) => readApiResponse<{ contactIds: string[] }>(response))
      .then((data) => { setSaved(data.contactIds); setSelection(new Set(data.contactIds)); setInitialized(true); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [campaignId, selectionRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "50", page: String(page) });
      if (listId) params.set("listId", listId);
      if (search.trim()) params.set("search", search.trim());
      void fetch(`/api/contacts?${params}`, { signal: controller.signal })
        .then((response) => readApiResponse<{ contacts: Contact[]; pages: number }>(response))
        .then((data) => { setContacts(data.contacts); setPages(Math.max(1, data.pages)); })
        .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [listId, search, page, refresh]);

  async function save(entireList = false) {
    if (!entireList && !selection.size) {
      setError("Please select at least one contact before saving recipients.");
      return;
    }
    if (!entireList && !dirty) {
      setNotice("Recipients are already saved and up to date.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/recipients`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(entireList ? { listId } : { contactIds: [...selection] }) });
      const data = await readApiResponse<{ contactIds: string[]; recipientCount: number }>(response);
      setSelection(new Set(data.contactIds)); setSaved(data.contactIds); onSaved(data.recipientCount);
      setNotice(`${data.recipientCount} recipients saved. Review the email, then start automation.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save recipients. Please try again."); }
    finally { setSaving(false); }
  }

  function toggle(id: string, checked: boolean) {
    setNotice(""); setSelection((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  return <section aria-label="Campaign recipients" className="space-y-5 self-start rounded-2xl border border-line bg-panel p-5">
    <div><p className="text-xs font-semibold text-signal">1. Choose who receives this email</p><h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Users size={20} /> Campaign recipients</h2><p className="mt-2 text-sm leading-6 text-muted">Choose one client or several contacts below. Contacts added after this campaign was created can be selected here.</p></div>
    {!editable && <p className="rounded-xl bg-canvas p-3 text-sm text-muted">Automation has already started or finished. Recipient selection is locked; create a new draft for a different group.</p>}
    <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="recipient-search">Find a client</Label><Input id="recipient-search" placeholder="Name or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><div><Label htmlFor="recipient-list">Filter by contact list</Label><select id="recipient-list" className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm" value={listId} onChange={(event) => { setListId(event.target.value); setPage(1); }}><option value="">All contacts</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.count})</option>)}</select></div></div>
    <p className="text-xs leading-5 text-muted">Filters only change the contacts shown. Your selections on other pages stay selected.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Refresh contacts</Button>{editable && <><Button type="button" variant="secondary" size="sm" disabled={loading || saving || !initialized} onClick={() => { setNotice(""); setSelection((current) => new Set([...current, ...contacts.map((contact) => contact.id)])); }}>Select this page</Button><Button type="button" variant="ghost" size="sm" disabled={saving || !initialized} onClick={() => { setNotice(""); setSelection(new Set()); }}>Clear selection</Button></>}</div>
    {editable && listId && <div className="rounded-xl border border-line bg-canvas p-3"><p className="mb-2 text-xs text-muted">Use every contact in this list, including contacts hidden by search. This replaces and saves the campaign recipient selection.</p><Button type="button" variant="secondary" disabled={saving || !initialized} onClick={() => void save(true)}>Use entire list</Button></div>}
    <div className="max-h-80 overflow-y-auto rounded-xl border border-line" aria-busy={loading}>{loading ? <p className="p-4 text-sm text-muted">Loading contacts...</p> : !contacts.length ? <p className="p-4 text-sm text-muted">No contacts found. <a className="text-signal underline" href="/contacts">Add a client or import Excel in Contacts</a>, then refresh this selection.</p> : contacts.map((contact) => <label key={contact.id} className={`flex cursor-pointer items-start gap-3 border-b border-line p-3 last:border-0 ${selection.has(contact.id) ? "bg-signal/10" : "hover:bg-canvas"}`}><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-signal" checked={selection.has(contact.id)} disabled={!editable || saving || !initialized} onChange={(event) => toggle(contact.id, event.target.checked)} aria-label={`Select ${contact.email}`} /><span className="min-w-0"><span className="block text-sm font-semibold">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed client"}</span><span className="block break-all text-xs text-muted">{contact.email}</span><span className="mt-1 block text-xs capitalize text-muted">{contact.status.replaceAll("_", " ")}</span></span></label>)}</div>
    <div className="flex items-center justify-between gap-2"><Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted">Page {page} of {pages}</span><Button variant="secondary" size="sm" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-sm font-semibold">{selection.size} selected {dirty && <span className="text-amber">(unsaved)</span>}</p>{editable && <Button disabled={saving || !initialized} onClick={() => void save()}>{saving ? "Saving..." : "Save recipients"}</Button>}</div>
    <p className="text-xs leading-5 text-muted">Unsubscribed, bounced, replied and other stopped contacts will be skipped when sending.</p>
    {error && <p role="alert" className="text-sm text-coral">{error}</p>}{!initialized && error && <Button variant="secondary" onClick={() => { setError(""); setSelectionRetry((value) => value + 1); }}>Retry recipient selection</Button>}{notice && <p role="status" className="text-sm text-signal">{notice}</p>}
  </section>;
}
