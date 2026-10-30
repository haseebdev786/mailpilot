"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  StopCircle,
  Users,
  WandSparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignRecipients } from "@/components/campaign-recipients";
import { OutreachAdvisor } from "@/components/outreach-advisor";
import { Input, Label } from "@/components/ui/input";

type Campaign = {
  id: string;
  name: string;
  status: string;
  businessDescription: string | null;
  services: string | null;
  offer: string | null;
  tone: string | null;
  cta: string | null;
  signature: string | null;
  sendingDelayMin: number;
  sendingDelayMax: number;
  sendingStartHour: number;
  sendingEndHour: number;
  timezone: string;
  skipWeekends: boolean;
  recipientCount: number;
};

type List = { id: string; name: string; count: number };
type Mailbox = { id: string; name: string; email: string; healthStatus: string };
type Contact = { id: string; email: string; firstName: string | null; company: string | null };
type Draft = { subject: string; subjectVariants: string[]; text: string; html: string } | null;

const initial = {
  name: "",
  listId: "",
  mailboxIds: [] as string[],
  businessDescription: "",
  services: "",
  offer: "",
  tone: "clear, thoughtful, conversational",
  cta: "Would it be useful to compare notes?",
  signature: "",
  templateSubject: "",
  templateText: "",
  useFollowUps: false,
  replyMode: "APPROVAL",
  followUps: [
    { delayHours: 24, instruction: "Ask if they are interested in our service." },
    { delayHours: 72, instruction: "Follow up with a concise, helpful reminder." }
  ],
  sendingDelayMin: "120",
  sendingDelayMax: "180",
  sendingStartHour: "9",
  sendingEndHour: "18",
  timezone: "UTC",
  skipWeekends: true
};

export function CampaignsManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(initial);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [previewContact, setPreviewContact] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "info" | "success" } | null>(null);
  const [recipientRevision, setRecipientRevision] = useState(0);
  const [recipientsDirty, setRecipientsDirty] = useState(true);

  async function load() {
    const [campaignResponse, listResponse, mailboxResponse, contactResponse] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/contact-lists"),
      fetch("/api/mailboxes"),
      fetch("/api/knowledge-base")
    ]);
    const campaignData = (await campaignResponse.json()) as { campaigns?: Campaign[] };
    const listData = (await listResponse.json()) as { lists?: List[] };
    const mailboxData = (await mailboxResponse.json()) as { mailboxes?: Mailbox[] };
    const knowledgeData = (await contactResponse.json()) as {
      knowledge?: { aboutMe?: string; services?: string };
    };

    const fetchedLists = listData.lists ?? [];
    const connectedMailboxes = (mailboxData.mailboxes ?? []).filter((m) => m.healthStatus === "CONNECTED");

    setCampaigns(campaignData.campaigns ?? []);
    setLists(fetchedLists);
    setMailboxes(connectedMailboxes);

    setForm((current) => ({
      ...current,
      businessDescription: current.businessDescription || knowledgeData.knowledge?.aboutMe || "",
      services: current.services || knowledgeData.knowledge?.services || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      listId: current.listId || (fetchedLists[0]?.id ?? ""),
      mailboxIds: current.mailboxIds.length ? current.mailboxIds : connectedMailboxes[0] ? [connectedMailboxes[0].id] : []
    }));
  }

  useEffect(() => {
    void load().catch(() => setMessage({ text: "Unable to load your workspace. Please refresh.", type: "error" }));
  }, []);

  useEffect(() => {
    setContacts([]);
    setPreviewContact("");
    setDraft(null);
    if (!selected?.id) return;
    const controller = new AbortController();
    void fetch(`/api/campaigns/${selected.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load campaign recipients");
        const data = await response.json();
        const recipients: Contact[] = data.campaign.recipients.map((item: { contact: Contact }) => item.contact);
        setContacts(recipients);
        setPreviewContact(recipients[0]?.id || "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMessage({ text: error.message, type: "error" });
      });
    return () => controller.abort();
  }, [selected?.id, recipientRevision]);

  function setField(key: string, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function recipientsSaved(count: number) {
    if (!selected) return;
    setSelected((current) => (current ? { ...current, recipientCount: count } : current));
    setCampaigns((current) =>
      current.map((campaign) => (campaign.id === selected.id ? { ...campaign, recipientCount: count } : campaign))
    );
    setRecipientRevision((value) => value + 1);
    setRecipientsDirty(false);
  }

  function chooseCampaign(id: string) {
    if (id === selected?.id) return;
    setSelected(campaigns.find((campaign) => campaign.id === id) ?? null);
    setRecipientsDirty(true);
    setDraft(null);
    setMessage(null);
  }

  function validateCreateForm(): string | null {
    if (!form.name.trim()) return "Please enter a Campaign name.";
    if (!form.listId) return "Please choose a Contact list.";
    if (!form.mailboxIds.length) {
      if (!mailboxes.length) {
        return "No connected mailbox found. Please connect and verify a mailbox in the Mailboxes tab first.";
      }
      return "Please select at least one connected mailbox under 'Mailbox rotation'.";
    }
    if (!form.businessDescription.trim()) return "Please provide a Business description.";
    if (!form.services.trim()) return "Please provide the Services you offer.";

    const minDelay = Number(form.sendingDelayMin);
    const maxDelay = Number(form.sendingDelayMax);
    if (isNaN(minDelay) || isNaN(maxDelay) || maxDelay < minDelay) {
      return "Maximum delay (sec) must be at least the Minimum delay (sec).";
    }

    const startHour = Number(form.sendingStartHour);
    const endHour = Number(form.sendingEndHour);
    if (isNaN(startHour) || isNaN(endHour) || endHour <= startHour) {
      return "Sending End hour must be greater than Start hour.";
    }

    const hasSubject = Boolean(form.templateSubject.trim());
    const hasText = Boolean(form.templateText.trim());
    if (hasSubject !== hasText) {
      return "When using a custom template, provide both Subject and Email body (or leave both blank for AI-generated drafts).";
    }

    return null;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const error = validateCreateForm();
    if (error) {
      setMessage({ text: error, type: "error" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          followUps: form.useFollowUps ? form.followUps : [],
          sendingDelayMin: Number(form.sendingDelayMin),
          sendingDelayMax: Number(form.sendingDelayMax),
          sendingStartHour: Number(form.sendingStartHour),
          sendingEndHour: Number(form.sendingEndHour)
        })
      });
      const data = (await response.json()) as { campaign?: Campaign; error?: string };
      if (!response.ok || !data.campaign) throw new Error(data.error ?? "Unable to create campaign");
      setCampaigns((current) => [data.campaign!, ...current]);
      setSelected(data.campaign);
      setMessage({ text: `Campaign created with ${data.campaign.recipientCount} recipients.`, type: "success" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Unable to create campaign", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function perform(action: () => Promise<void>) {
    setWorking(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Unable to connect. Please try again.", type: "error" });
    } finally {
      setWorking(false);
    }
  }

  async function campaignRequest(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to update campaign");
    return data;
  }

  async function preview() {
    if (!selected) return;
    if (!previewContact) {
      setMessage({ text: "Please select a contact from the dropdown to preview the email.", type: "error" });
      return;
    }
    await perform(async () => {
      const data = await campaignRequest(`/api/campaigns/${selected.id}/preview`, { contactId: previewContact });
      setDraft(data.draft ?? null);
    });
  }

  async function sendTest() {
    if (!selected) return;
    if (!testEmail.trim()) {
      setMessage({ text: "Please enter your test email address first.", type: "error" });
      return;
    }
    await perform(async () => {
      await campaignRequest(`/api/campaigns/${selected.id}/test`, {
        testEmail: testEmail.trim(),
        contactId: previewContact || undefined,
        subject: draft?.subject,
        text: draft?.text
      });
      setMessage({ text: "Test email sent. Check your inbox before launching.", type: "success" });
    });
  }

  function updateStatus(status: string) {
    if (!selected) return;
    setSelected({ ...selected, status });
    setCampaigns((current) =>
      current.map((campaign) => (campaign.id === selected.id ? { ...campaign, status } : campaign))
    );
  }

  async function launch() {
    if (!selected) return;
    if (selected.status === "ACTIVE") {
      setMessage({ text: "This campaign is already active and currently sending.", type: "info" });
      return;
    }
    if (selected.status === "COMPLETED") {
      setMessage({ text: "This campaign has already completed sending to all recipients.", type: "info" });
      return;
    }
    if (recipientsDirty) {
      setMessage({
        text: "You have unsaved recipient changes. Please click 'Save recipients' on the left before starting automation.",
        type: "error"
      });
      return;
    }
    if (selected.recipientCount === 0) {
      setMessage({
        text: "This campaign has 0 recipients. Please select and save at least one contact on the left before starting.",
        type: "error"
      });
      return;
    }

    await perform(async () => {
      const data = await campaignRequest(`/api/campaigns/${selected.id}/launch`);
      if (data.windowDelay > 0) {
        const hours = Math.max(1, Math.round(data.windowDelay / 3_600_000));
        setMessage({
          text: `Automation started for ${data.queued} recipients. The sending window is closed right now (${data.timezone}), so the first email will go out in about ${hours} hour${hours === 1 ? "" : "s"}.`,
          type: "success"
        });
      } else {
        setMessage({
          text: `Automation started for ${data.queued} recipients. Emails will follow your sending delays. Keep the worker running.`,
          type: "success"
        });
      }
      updateStatus("ACTIVE");
    });
  }

  async function control(action: "pause" | "resume" | "stop") {
    if (!selected) return;
    await perform(async () => {
      const data = await campaignRequest(`/api/campaigns/${selected.id}/control`, { action });
      setMessage({
        text: action === "pause" ? "Campaign paused." : action === "resume" ? "Campaign resumed." : "Campaign stopped.",
        type: "info"
      });
      updateStatus(data.status);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">Outbound / campaigns</p>
          <h1 className="text-4xl font-bold tracking-[-0.065em] text-ink">Campaigns</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Choose your campaign, select its recipients, review the email, then start automation.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-2 text-[10px] font-semibold text-ink">
          <Sparkles size={14} /> AI drafts stay under 120 words
        </div>
      </div>

      {message && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-5 ${
            message.type === "error"
              ? "border-coral/40 bg-coral/10 text-coral"
              : message.type === "success"
                ? "border-mint/40 bg-mint/10 text-mint"
                : "border-signal/40 bg-signal/10 text-ink"
          }`}
        >
          {message.type === "error" ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-coral" />
          ) : message.type === "success" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-mint" />
          ) : (
            <Sparkles size={16} className="mt-0.5 shrink-0 text-signal" />
          )}
          <span className="flex-1 font-medium">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel p-5">
        <div className="min-w-0 flex-1">
          <Label htmlFor="existing-campaign">Open an existing campaign</Label>
          <select
            id="existing-campaign"
            value={selected?.id ?? ""}
            onChange={(event) => chooseCampaign(event.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm"
          >
            <option value="">Create a new campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} ({campaign.status.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={() => chooseCampaign("")}>
          New campaign
        </Button>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.82fr)]">
        {selected ? (
          <CampaignRecipients
            key={selected.id}
            campaignId={selected.id}
            status={selected.status}
            lists={lists}
            onSaved={recipientsSaved}
            onDirtyChange={setRecipientsDirty}
          />
        ) : (
          <form onSubmit={(event) => void create(event)} className="space-y-6 rounded-2xl border border-line bg-panel p-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Campaign / wizard</p>
              <h2 className="mt-2 text-xl font-bold tracking-[-0.04em]">Build a careful first send</h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Choose a starting list and connected mailbox. After creating the draft, you can select individual clients or replace the recipients with another list.
              </p>
            </div>

            <div>
              <Label htmlFor="campaign-name">
                Campaign name <span className="text-coral">*</span>
              </Label>
              <Input
                id="campaign-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Q4 founder outreach"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-list">
                  Contact list <span className="text-coral">*</span>
                </Label>
                <select
                  id="campaign-list"
                  value={form.listId}
                  onChange={(event) => setField("listId", event.target.value)}
                  className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm"
                >
                  <option value="">Choose a list</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} · {list.count} contacts
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>
                  Mailbox rotation <span className="text-coral">*</span>
                </Label>
                <div className="mt-2 space-y-2 rounded-xl border border-line bg-canvas p-3">
                  {mailboxes.length ? (
                    mailboxes.map((mailbox) => (
                      <label key={mailbox.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.mailboxIds.includes(mailbox.id)}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              mailboxIds: event.target.checked
                                ? [...current.mailboxIds, mailbox.id]
                                : current.mailboxIds.filter((id) => id !== mailbox.id)
                            }))
                          }
                          className="accent-signal h-4 w-4"
                        />
                        <span className="font-semibold text-ink">{mailbox.name}</span>
                        <span className="text-muted">({mailbox.email})</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-[11px] leading-5 text-coral">
                      No connected mailbox available. Connect and test a mailbox in Mailboxes first.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="business">
                Business description <span className="text-coral">*</span>
              </Label>
              <textarea
                id="business"
                value={form.businessDescription}
                onChange={(event) => setField("businessDescription", event.target.value)}
                placeholder="We help early-stage teams with outreach automation…"
                className="min-h-20 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/15"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="services">
                  Services <span className="text-coral">*</span>
                </Label>
                <textarea
                  id="services"
                  value={form.services}
                  onChange={(event) => setField("services", event.target.value)}
                  placeholder="What you actually do for clients"
                  className="min-h-20 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/15"
                />
              </div>
              <div>
                <Label htmlFor="offer">Offer (optional)</Label>
                <textarea
                  id="offer"
                  value={form.offer}
                  onChange={(event) => setField("offer", event.target.value)}
                  placeholder="Optional hook or reason to reply"
                  className="min-h-20 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/15"
                />
              </div>
            </div>

            <OutreachAdvisor
              businessDescription={form.businessDescription}
              services={form.services}
              signature={form.signature}
              onApply={(value) => setForm((current) => ({ ...current, ...value }))}
            />

            <div className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="text-sm font-bold">Email template</h3>
              <p className="text-xs leading-5 text-muted">
                Use a recommendation or write your own. Personalize with {"{{firstName}}"}, {"{{company}}"} and {"{{email}}"}. Leave both fields empty for an AI-generated email per recipient.
              </p>
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={form.templateSubject}
                onChange={(event) => setField("templateSubject", event.target.value)}
                placeholder="Quick question about {{company}}"
                maxLength={200}
              />
              <Label htmlFor="template-text">Email body</Label>
              <textarea
                id="template-text"
                className="min-h-40 w-full rounded-xl border border-line bg-canvas p-3 text-sm"
                value={form.templateText}
                onChange={(event) => setField("templateText", event.target.value)}
                placeholder="Hi {{firstName}}, noticed your work at {{company}}..."
                maxLength={6000}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tone">Tone</Label>
                <Input id="tone" value={form.tone} onChange={(event) => setField("tone", event.target.value)} />
              </div>
              <div>
                <Label htmlFor="cta">CTA</Label>
                <Input id="cta" value={form.cta} onChange={(event) => setField("cta", event.target.value)} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.useFollowUps}
                onChange={(event) => setField("useFollowUps", event.target.checked)}
                className="accent-signal h-4 w-4"
              />
              <span>Enable AI follow-ups</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="reply-mode">Reply mode</Label>
                <select
                  id="reply-mode"
                  value={form.replyMode}
                  onChange={(event) => setField("replyMode", event.target.value)}
                  className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm"
                >
                  <option value="APPROVAL">Approval — draft first</option>
                  <option value="AUTO">Auto — guarded send</option>
                </select>
              </div>
              <div>
                <Label htmlFor="followup-one">Follow-up 1 gap (hours)</Label>
                <Input
                  id="followup-one"
                  disabled={!form.useFollowUps}
                  type="number"
                  min="1"
                  value={form.followUps[0].delayHours}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      followUps: [{ ...current.followUps[0], delayHours: Number(event.target.value) }, current.followUps[1]]
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="followup-two">Follow-up 2 gap (hours)</Label>
                <Input
                  id="followup-two"
                  disabled={!form.useFollowUps}
                  type="number"
                  min="1"
                  value={form.followUps[1].delayHours}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      followUps: [current.followUps[0], { ...current.followUps[1], delayHours: Number(event.target.value) }]
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="signature">Signature</Label>
              <textarea
                id="signature"
                value={form.signature}
                onChange={(event) => setField("signature", event.target.value)}
                placeholder="Best regards,&#10;Haseeb"
                className="min-h-16 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/15"
              />
            </div>

            <div className="rounded-xl border border-line p-4">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 size={15} className="text-signal" />
                <p className="text-xs font-bold">Sending schedule</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <Label htmlFor="delay-min">Min delay sec</Label>
                  <Input
                    id="delay-min"
                    type="number"
                    min="0"
                    value={form.sendingDelayMin}
                    onChange={(event) => setField("sendingDelayMin", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="delay-max">Max delay sec</Label>
                  <Input
                    id="delay-max"
                    type="number"
                    min="0"
                    value={form.sendingDelayMax}
                    onChange={(event) => setField("sendingDelayMax", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="start-hour">Start hour (0-23)</Label>
                  <Input
                    id="start-hour"
                    type="number"
                    min="0"
                    max="23"
                    value={form.sendingStartHour}
                    onChange={(event) => setField("sendingStartHour", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-hour">End hour (1-24)</Label>
                  <Input
                    id="end-hour"
                    type="number"
                    min="1"
                    max="24"
                    value={form.sendingEndHour}
                    onChange={(event) => setField("sendingEndHour", event.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={(event) => setField("timezone", event.target.value)}
                    placeholder="Asia/Karachi"
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-3 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.skipWeekends}
                    onChange={(event) => setField("skipWeekends", event.target.checked)}
                    className="accent-signal h-4 w-4"
                  />
                  <span>Skip weekends</span>
                </label>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="animate-spin" size={15} /> : <ChevronRight size={15} />}
              {saving ? "Creating campaign…" : "Create campaign"}
            </Button>
          </form>
        )}

        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2">
              <WandSparkles size={16} className="text-signal" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                2. Review email / 3. Start automation
              </p>
            </div>

            {selected ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{selected.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {selected.recipientCount} recipients ·{" "}
                      <span className="capitalize font-semibold text-ink">{selected.status.toLowerCase()}</span>
                    </p>
                  </div>
                  <span className="rounded-full border border-line px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted">
                    {selected.sendingDelayMin}-{selected.sendingDelayMax}s
                  </span>
                </div>

                <div>
                  <Label htmlFor="preview-contact">Preview for contact</Label>
                  <select
                    id="preview-contact"
                    value={previewContact}
                    onChange={(event) => {
                      setPreviewContact(event.target.value);
                      setDraft(null);
                    }}
                    className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm"
                  >
                    <option value="">Choose a contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.firstName || "Contact"} · {contact.email}
                      </option>
                    ))}
                  </select>
                </div>

                <Button variant="secondary" onClick={() => void preview()} disabled={working}>
                  <WandSparkles size={15} /> {working ? "Working…" : "Generate / regenerate preview"}
                </Button>

                {draft && (
                  <div className="rounded-xl bg-canvas p-4 space-y-3 border border-line">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted">Subject</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{draft.subject}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted">Body</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{draft.text}</p>
                    </div>
                    {draft.subjectVariants.length > 0 && (
                      <p className="text-[10px] text-muted">Variants: {draft.subjectVariants.join(" · ")}</p>
                    )}
                  </div>
                )}

                <div className="border-t border-line pt-4">
                  <Label htmlFor="test-email">Test email to myself</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="test-email"
                      type="email"
                      value={testEmail}
                      onChange={(event) => setTestEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                    <Button variant="secondary" onClick={() => void sendTest()} disabled={working}>
                      <Send size={14} /> Send
                    </Button>
                  </div>
                </div>

                <p className="text-xs leading-5 text-muted">
                  {recipientsDirty
                    ? "Save recipient changes on the left before starting automation."
                    : `${selected.recipientCount} saved recipients. Starting will queue this campaign for delivery using its saved email and sending schedule.`}
                </p>

                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button onClick={() => void launch()} disabled={working}>
                    <Play size={15} /> Start automation
                  </Button>
                  {selected.status === "ACTIVE" ? (
                    <Button variant="secondary" disabled={working} onClick={() => void control("pause")}>
                      <Pause size={15} /> Pause
                    </Button>
                  ) : selected.status === "PAUSED" ? (
                    <Button variant="secondary" disabled={working} onClick={() => void control("resume")}>
                      <RotateCcw size={15} /> Resume
                    </Button>
                  ) : null}
                  {!["ARCHIVED", "COMPLETED"].includes(selected.status) && (
                    <Button variant="secondary" disabled={working} onClick={() => void control("stop")}>
                      <StopCircle size={15} /> Stop
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-10 text-center">
                <Sparkles size={28} className="mx-auto text-signal" />
                <p className="mt-4 text-sm font-semibold">Your campaign workspace will appear here</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Open an existing campaign above, or create a draft. Then select its clients, preview the email and start automation.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Campaign history</p>
                <h3 className="mt-2 text-lg font-bold">Your sequences</h3>
              </div>
              <Users size={17} className="text-muted" />
            </div>
            <div className="mt-4 space-y-2">
              {campaigns.length ? (
                campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => chooseCampaign(campaign.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      selected?.id === campaign.id ? "border-signal bg-signal/5" : "border-line hover:bg-canvas"
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-muted">
                      <Mail size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{campaign.name}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        {campaign.recipientCount} recipients ·{" "}
                        <span className="capitalize">{campaign.status.toLowerCase()}</span>
                      </p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-signal" />
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-muted">No campaigns yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
