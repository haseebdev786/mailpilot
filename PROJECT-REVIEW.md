# MailPilot project review

Reviewed: 22 October 2026.

## Addendum — SaaS launch work, 30 October 2026 (code only, uncommitted, not deployed)

The gaps listed under “Before public paid SaaS launch” in the October review were implemented in code in `~/workspace/mailpilot` as uncommitted local changes (migration `0005_saas_launch`): Stripe billing with server-enforced entitlements, email verification/password reset, Gmail/Outlook OAuth mailboxes, Redis rate limits with fallback, health/readiness monitoring, FailedJob dead-letter visibility, IMAP UIDVALIDITY reset handling, and removal/replacement of decorative shell controls. See README “SaaS launch features” for the exact routes and behaviour.

Verification in this sandbox: `npm test` 22 passed / 1 failed (the 1 failure is a pre-existing session test that needs a generated Prisma client); `npm run lint` passes; `npm run typecheck` and `npm run build` compile but fail at the type-check stage for the same reason — `prisma generate` cannot download its engine in this sandbox (network resets on the engine download), so no generated Prisma client exists here at all. That is an environment blocker, not a code regression: on a machine where `npm run db:generate` succeeds, re-run typecheck/build and the integration suite. No migration was run against a hosted database, no real email was sent, and nothing was pushed to GitHub.

Still blocked before a live launch: real Stripe keys/webhook secret and price ids, real Google/Microsoft OAuth credentials, a transactional mail sender for verification/reset, a public HTTPS APP_URL, and live provider acceptance tests (Stripe checkout/webhook/portal, Gmail/Outlook send/receive, two-worker reply sync, UIDVALIDITY reset). The development-tool audit findings were not re-audited because the sandbox registry policy blocks `npm audit`.

The core personal outreach workflow is implemented and tested locally. This is not yet a production acceptance sign-off for a public paid SaaS.

## What now works

- Signup/login and workspace isolation; authenticated imports and ownership checks for lists, contacts, campaigns and deals.
- SMTP/IMAP mailbox configuration with encrypted credentials, mandatory TLS, public-host validation and connection retesting after credential changes. Google account login is separate from mailbox connection; Gmail/Outlook mailbox OAuth is not implemented.
- Business context, recommended description/audience/templates, editable email copy and personalized previews. Without an AI key the UI explicitly offers a starter template. AI calls validate the returned structure and build escaped HTML locally.
- Single manually added contacts and bulk CSV/XLSX imports, campaign templates and optional AI follow-ups.
- Shared delivery windows, timezone/weekend handling, mailbox spacing, rolling daily limits, pause/resume and suppression checks. Stable delivery reservations prevent automatic repeats after confirmed or uncertain SMTP attempts; uncertain attempts require manual investigation.
- Signed workspace-specific unsubscribe links and one-click POST endpoint, reply handling and guarded AI/manual replies. Quoted original email footers no longer trigger false opt-outs.
- Real dashboard counts, clearer errors, worker environment loading, bounded queue connection failures, updated setup instructions and separate development/production build directories.

## Validation

| Check | Result |
| --- | --- |
| Production Next.js build, lint and type checking | Passed |
| Workspace TypeScript checks | Passed |
| Core regression tests | 14 passed |
| Isolated PostgreSQL integration checks | 16 passed |
| Browser smoke checks | Login, campaign loading, starter recommendation, applying a template and personalized preview passed |
| Responsive check | Desktop and 390px mobile inspected; no horizontal overflow |
| Runtime dependency audit | 0 reported vulnerabilities at review time |
| Full dependency audit | 9 development-tool vulnerabilities remain (7 high, 2 moderate) |

Integration tests apply all committed migrations to a new temporary PostgreSQL database. SMTP is mocked, Redis is intentionally unavailable for failure-path checks, and AI provider network calls are not exercised. Tests cover ownership, demo-login restrictions, cross-site mutation protection, quotas, paused/replied recipients, duplicate prevention, uncertain delivery, credential invalidation and unsubscribe isolation. No external email was sent and existing contacts were not used for testing.

## Current setup requirements

1. Restart the existing development server after the Prisma/configuration changes. Run `npm run db:generate` after installing dependencies.
2. Configure reachable Redis and run the worker. Local Redis was unreachable during this review; live BullMQ delivery and import processing still need acceptance testing with Redis running.
3. Configure an OpenAI or Anthropic API key for AI recommendations, per-contact AI drafting and AI follow-ups. The existing provider keys were empty; starter templates work without them.
4. Test mailbox credentials through Mailboxes, then run a controlled send to your own account. Existing saved mailbox status is not evidence of a new successful SMTP/IMAP test.
5. Before real outreach, configure public HTTPS `APP_URL`, sending-domain authentication and your business address. Follow [README.md](README.md) for setup. The existing `.env` was not rewritten.

## Before public paid SaaS launch

- Implement billing/webhooks and enforce plan limits on the server.
- Add email verification and password recovery; distributed auth/AI request throttling.
- Add operational monitoring, queue/error recovery tooling and live provider acceptance tests, including imports, follow-ups and reply synchronization.
- Harden IMAP UIDVALIDITY changes and recovery across multiple worker processes.
- Resolve the remaining development-tool audit findings through tested tooling upgrades.
- Replace remaining decorative shell controls/status badges with actual behavior or measured status.

No production deployment or live database migration was performed. Automated checks establish the behavior described above, not guaranteed email delivery or unrestricted production readiness.

Two stopped preview runs left temporary folders after Windows locking/policy restrictions prevented cleanup: `C:/Users/Dell/AppData/Local/Temp/mailpilot-integration-z5Rnic` and `C:/Users/Dell/AppData/Local/Temp/mailpilot-integration-0Ui5cF`. These contain only disposable test data.
