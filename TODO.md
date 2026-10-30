
## Phase 5 — Replies and follow-ups

- [x] Poll IMAP every 90 seconds, parse MIME messages, and match replies via In-Reply-To, References, and sender email.
- [x] Set replied status and cancel pending contact jobs immediately; classify bounces and out-of-office separately.
- [x] Persist configurable Email 1 and follow-up sequence steps with gaps, contextual AI drafting, and mailbox rotation.
- [x] Run a safety check immediately before every initial and follow-up send for replies, unsubscribes, bounces, not-interested contacts, and suppression.
- [x] Mark bounced contacts and add them to the workspace suppression list.

## Phase 6 — Inbox and AI deal closer

- [x] Provide a unified thread inbox with search, intent tags, AI drafts, manual reply, and manual-reply stop guard.
- [x] Provide Knowledge Base editing for identity, services, work, FAQs, pricing range, packages, discounts, timelines, and payment terms.
- [x] Classify inbound messages and draft constrained AI replies from Knowledge Base only; escalate uncertain, angry, custom, or unsafe requests.
- [x] Support Approval and Auto campaign reply modes with guarded auto-reply queueing.
- [x] Track deals, qualify interested leads, support deal stages, and notify on confirmed wins.

## Phase 8 — Public paid SaaS launch (implemented in code 2026-10-30, migration 0005_saas_launch; live acceptance still required)

- [x] Stripe billing: Free/Pro/Scale plans, checkout, customer portal, webhook signature verification and subscription updates, and server-enforced plan limits on mailboxes, contacts, active campaigns, monthly sends and AI usage (API routes and worker).
- [x] Email verification and password reset with signed, expiring, single-use tokens; optional hard verification gate via EMAIL_VERIFICATION_REQUIRED.
- [x] Gmail and Outlook OAuth mailbox connection with encrypted, refreshed tokens (XOAUTH2 SMTP/IMAP); SMTP/IMAP remains the fallback.
- [x] Distributed Redis rate limits for auth and AI calls, with in-memory fallback when Redis is unavailable.
- [x] Operational monitoring: /api/health (DB/Redis/queue/worker heartbeat), /api/ready, worker heartbeat, and FailedJob dead-letter visibility with owner resolve/retry.
- [x] IMAP UIDVALIDITY reset handling and a per-mailbox distributed sync lock for multiple workers.
- [x] Replaced decorative shell controls/status badges with measured status or removed them.
- [ ] Live acceptance with real keys: Stripe test checkout + webhook + portal; real Gmail/Outlook OAuth send/receive; Redis-backed delivery, imports, follow-ups and reply sync across two workers; UIDVALIDITY reset on a real mailbox.
- [ ] Re-run npm audit on a normal network and resolve the remaining development-tool findings from the October review.
- [ ] Apply migration 0005 to the hosted database and deploy (see README "Before a public paid SaaS launch").

## Phase 7 — Compliance and analytics

- [x] Add unsubscribe footer, public unsubscribe page, global suppression, auto-honor opt-out replies, List-Unsubscribe, and one-click header.
- [x] Add SPF/DKIM/DMARC checker and deliverability setup guide.
- [x] Add live sent/reply/interested/deal/reply-rate/bounce-rate analytics and campaign/activity data.
- [x] Add in-app notifications for interested leads, confirmed deals, and needs-attention events.
