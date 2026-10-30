# MailPilot

A personal and multi-workspace outreach app built with Next.js, Prisma/PostgreSQL and a BullMQ worker.

## What works

1. Sign up and connect an SMTP/IMAP mailbox in **Mailboxes**. Test the connection.
2. Describe your business and services in **Knowledge Base**.
3. Create a list in **Contacts**. Add one person for a single email, or import a CSV/Excel file for a bulk campaign.
4. Open **Campaigns**. Business details prefill from Knowledge Base. Request a suggested description, audience and templates.
5. Choose a template, edit it, create the campaign, preview a recipient, optionally send a test to your own address, and launch.
6. The worker sends each recipient separately, applies timing/limits, polls replies and stops outreach for replies and opt-outs.

AI requires a configured provider key. Without a key the app explicitly offers a **starter template**. That template can be edited and sent with AI follow-ups disabled. Google sign-in is currently account login only; mailbox sending/receiving uses SMTP/IMAP credentials.

## Setup

Use Node.js **22.12+** and npm. Keep the existing `.env`; only copy `.env.example` for a new installation.

```sh
npm install
npm run db:generate
```

For a new environment, generate a 32-byte encryption key and put it in `ENCRYPTION_KEY`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Preserve the key after connecting mailboxes: saved passwords are encrypted with it.

### Database

For an existing Neon/hosted PostgreSQL database, configure `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then apply committed migrations:

```sh
npm run db:deploy
```

The app uses the runtime URL; Prisma migration commands use the direct URL. See [Neon's Prisma guide](https://neon.com/docs/guides/prisma). Do not run `db:local` against a hosted URL.

For local development with the localhost URLs in `.env.example`, this starts embedded PostgreSQL and seeds a demo:

```sh
npm run db:local
```

Keep that terminal open. Seed is optional for hosted installations and creates known demo credentials. Set `DEMO_LOGIN_ENABLED=false` outside a local demo; both the demo button and normal password login for that account then reject access.

### Redis and worker

Set `REDIS_URL` to a running Redis service. If Docker is installed, `docker compose up -d redis` starts one locally. The worker is required for **contact imports, campaign delivery, follow-ups and reply synchronization**.

```sh
npm run dev:all
```

Or use separate terminals:

```sh
npm run dev
npm run dev:worker
```

The web app runs at http://localhost:3000. Without Redis, browsing, signup, manually adding contacts, Knowledge Base and template previews work; queue actions return a setup error.

### Email and AI

- Enter mailbox credentials in the **Mailboxes** page; the `SMTP_*`/`IMAP_*` environment variables from older versions are not used.
- SMTP 587 uses STARTTLS (`secure=false`); SMTP 465 uses implicit TLS (`secure=true`). IMAP commonly uses TLS on 993.
- Use credentials supported by your mailbox provider. Changing connection credentials resets mailbox health until tested again.
- Mail hosts must resolve to public IP addresses. Local testing can set `ALLOW_PRIVATE_MAIL_SERVERS=true` outside production.
- Set `AI_PROVIDER=openai` plus `OPENAI_API_KEY`, or `AI_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY`. Set the corresponding model variable to a model available to your account.
- Set a public HTTPS `APP_URL` before real outreach so recipients can use unsubscribe links. Configure your sending domain and business address in Mailboxes/Settings.
- Optional `UNSUBSCRIBE_SIGNING_KEY` separates unsubscribe signing from mailbox encryption; otherwise the encryption key is used.

## Database connection recovery

Neon runtime connections use a maximum of 5 connections per process, a 30-second pool wait, a 20-second connection timeout and a 60-second idle connection lifetime. Explicit query parameters in `DATABASE_URL` override these defaults; local PostgreSQL keeps its existing pool defaults. Restart the web and worker processes after changing connection settings so the old Prisma pool is released.

Concurrent session checks share their pending lookup, and session activity timestamps update at most once per 15 minutes under normal operation. A closed session-read connection is retried once; pool exhaustion and writes are not automatically replayed. Contacts/list endpoints return a clear 503 response when authentication or another database query hits a recognized connection failure. Persistent remote resets still require checking database availability and the network path; increasing a timeout cannot repair an unavailable server.

Reference: [Neon connection troubleshooting](https://neon.com/docs/guides/prisma#troubleshooting) and [Prisma v6 connection pooling](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool).

## Sending behavior

To send an existing campaign to clients added later:

1. Add the client in Contacts, or import Excel/CSV into a contact list.
2. In Campaigns, use **Open an existing campaign** to choose a draft.
3. Under **Campaign recipients**, tick individual clients and click **Save recipients**. Alternatively, choose a list and click **Use entire list**, which replaces and saves the selection.
4. Review the personalized email, then click **Start automation**. Unsaved recipient edits block starting.

Different emails for different groups require separate campaigns. Recipients are a saved selection, so adding more contacts to a list later does not silently enroll them. Selection is locked after launch. Redis and the worker must be running for queued emails to be delivered; delivery also follows the saved sending window and delays.

Initial emails and follow-ups share the same timezone/weekend window, mailbox spacing, rolling 24-hour limits and suppression checks. A campaign also has a default 50-message daily cap. Pause defers queued work; resume preserves it; stop prevents further campaign processing.

A template subject/body is stored on the campaign's first sequence step. Supported tokens: `{{firstName}}`, `{{company}}`, `{{email}}`. Empty template fields request AI generation per contact. Follow-ups use AI and are disabled by default in the UI.

Each campaign/contact/step gets a durable delivery reservation. A worker retry does not repeat a confirmed delivery. If SMTP delivery cannot be confirmed, the reservation blocks automatic resend; inspect the sending mailbox and the recipient's `lastError` before any manual recovery. SMTP itself does not provide an exactly-once delivery guarantee.

Unsubscribe links are signed and scoped to the sending workspace. The one-click header points at a POST endpoint. Sender-side DKIM setup must also cover the unsubscribe headers for mailbox providers' full one-click requirements; see [RFC 8058](https://www.rfc-editor.org/info/rfc8058/).

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:integration
npm audit --omit=dev
```

Integration checks create and remove a separate temporary PostgreSQL database and run the production web build on an unused local port. They do not use your configured database. SMTP and AI are mocked where required; no external email is sent. A production build must exist first.

For a disposable browser preview after those checks:

```sh
node --import tsx scripts/integration-test.mts --serve
```

Use the test login printed by the command. Type anything in its terminal to stop and clean up.

Development uses `apps/web/.next`; production uses `apps/web/.next-production`, allowing a build while the development server is running. Restart an already-running dev server after updating Prisma/configuration.

## Before a public paid SaaS launch

The core outreach flow is implemented, but public paid-SaaS launch is a separate milestone. Billing/webhooks, enforced subscription entitlements, email verification/reset, distributed authentication/AI rate limits, operational monitoring and live provider acceptance testing remain. IMAP UIDVALIDITY resets and long-running/multiple-worker reply-sync recovery need further hardening. Review [PROJECT-REVIEW.md](PROJECT-REVIEW.md) for the tested scope and limitations.

## Project structure

- `apps/web`: UI and authenticated API routes
- `apps/worker`: imports, campaign delivery and reply polling
- `packages/shared`: database, mail, AI, auth and sending policies
- `prisma`: schema and committed migrations; client generated into `node_modules`
- `tests`, `scripts/integration-test.mts`: regression and isolated integration checks
