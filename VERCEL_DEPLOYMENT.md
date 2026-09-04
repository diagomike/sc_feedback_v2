# Running ASTU Feedback on Vercel (git-connected to `main`)

This is the deploy-side guide: getting the app onto Vercel, wired to this repository's
`main` branch, with a real Postgres and real SMTP behind it. It stops where
[`OPERATOR_GUIDE.md`](OPERATOR_GUIDE.md) starts — that document covers what a human does
*inside* the running app (invite personnel, import CSVs, launch campaigns).

Read [`DEPLOYMENT.md`](DEPLOYMENT.md) for the host-agnostic background. This file is
Vercel-specific and assumes you are deploying from `https://github.com/diagomike/sc_feedback_v2`.

---

## 0. What "git-connected to main" actually means here

Once the project is linked, Vercel watches the repository and:

| Event | What Vercel does | URL |
| --- | --- | --- |
| Push to `main` | Builds and promotes to **Production** | your production domain |
| Push to any other branch | Builds a **Preview** deployment | a generated `*.vercel.app` URL |
| Pull request opened | Builds a Preview and comments the link on the PR | a generated `*.vercel.app` URL |

Two consequences specific to this app:

- **Every Preview deployment shares whatever `DATABASE_URL` you gave the Preview scope.**
  If you point Preview at the production database, a preview branch can write to real
  data. Give Preview its own database, or leave its `DATABASE_URL` unset so previews fail
  loudly instead of quietly writing to production.
- **Links in emails are self-correcting.** `getWebOrigin()` ([src/lib/config.ts](src/lib/config.ts))
  derives the origin from the incoming request's `Host` header, so an invitation sent from
  a preview deployment links back to that preview, and one sent from production links to
  production — with no env var to keep in sync. `WEB_ORIGIN` is only the fallback for call
  sites with no request in scope.

**Vercel never runs your migrations or your bootstrap.** Both are manual, one-time steps
you run from your own machine against the production database (§4). Vercel has no shell.

---

## 1. Prerequisites

### 1a. A Postgres database with a pooled connection string

There is no SQLite fallback — `provider = "postgresql"` is a static string in
[prisma/schema.prisma](prisma/schema.prisma).

Serverless functions each open their own connection, so an unpooled Postgres will exhaust
`max_connections` under any real load. Use a provider that offers a **pooler**:

| Provider | Pooled string looks like | Direct string looks like |
| --- | --- | --- |
| Neon (recommended) | `...-pooler.<region>.aws.neon.tech/...` | `...<region>.aws.neon.tech/...` |
| Supabase | port `6543`, `?pgbouncer=true` | port `5432` |
| Vercel Postgres | `POSTGRES_PRISMA_URL` | `POSTGRES_URL_NON_POOLING` |

You need **both**:

- the **pooled** string → goes in Vercel's `DATABASE_URL` (what the app runs on)
- the **direct** string → used only from your laptop for `prisma migrate deploy` (§4).
  Migrations issue DDL and advisory locks that a transaction-mode pooler cannot carry;
  running `migrate deploy` through the pooler will fail.

Neon's Vercel integration sets `DATABASE_URL` automatically — check that it set the
**pooled** variant, and add `?connection_limit=1` if you see connection-exhaustion errors
under load.

### 1b. SMTP credentials

The app sends invitations, campaign invites, and reminders. Without working SMTP the
entire operator flow stalls at step one. `mail.ts` branches on whether `SMTP_USER` is set.

Verify your provider allows SMTP from a serverless IP — some block or rate-limit
datacenter ranges, and it will look like silent non-delivery.

---

## 2. Create and link the Vercel project

1. **Vercel → Add New → Project → Import Git Repository**, pick `diagomike/sc_feedback_v2`.
2. Vercel detects **Next.js**. Leave the framework preset alone.
3. **Root Directory**: `./` (repository root — this is not a monorepo).
4. **Production Branch**: `main`. This is the git connection you asked about; everything
   in the table in §0 follows from it.
5. **Build & Output Settings** — leave all three on their defaults:
   - Build Command → `npm run build`, which this repo defines as
     `prisma generate && next build`. **Do not shorten it to `next build`.** Vercel
     restores a cached `node_modules` between builds, which can skip `postinstall` and
     leave you with a stale or missing Prisma Client. Running `prisma generate` in the
     build script makes that impossible.
   - Install Command → `npm install` (default).
   - Output Directory → default.
6. **Node version**: 20.x or 22.x. `argon2` is a native module and must build or fetch a
   prebuilt binary for the runtime — do not vendor `node_modules` into the repo.
7. **Do not deploy yet.** Add the environment variables first (§3), or the first build
   will fail at `prisma generate` with no `DATABASE_URL`.

---

## 3. Environment variables

Set these under **Settings → Environment Variables**. Mind the scope column — several are
actively dangerous in the wrong scope.

| Variable | Scope | Value | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Production | **pooled** Postgres string | The app's runtime connection. |
| `DATABASE_URL` | Preview | a *separate* database, or leave unset | See §0 — do not point this at production. |
| `SMTP_HOST` | Production | e.g. `smtp.gmail.com` | |
| `SMTP_PORT` | Production | `587` (STARTTLS) or `465` (TLS) | |
| `SMTP_SECURE` | Production | `false` for 587, `true` for 465 | |
| `SMTP_USER` | Production | SMTP username | Its presence is what switches `mail.ts` into authenticated mode. |
| `SMTP_PASS` | Production | SMTP password / app password | |
| `MAIL_FROM` | Production | e.g. `ASTU Feedback <noreply@astu.edu.et>` | |
| `WEB_ORIGIN` | Production | your production URL | Fallback only — see §0. Harmless to set, worth setting. |
| `SESSION_COOKIE_NAME` | Production | optional | Defaults in code. |
| `SESSION_TTL_DAYS` | Production | optional | Defaults in code. |
| `ETHIOPIC_FONT_PATH` | Production | optional — see §7 | Enables the Amharic line on PDF letters. |

`NODE_ENV` is set to `production` by Vercel automatically; `session.ts` reads it to decide
whether the session cookie gets the `secure` flag. Do not set it yourself.

### Never set these in any Vercel scope

| Variable | Why |
| --- | --- |
| `E2E_TEST_MODE` | Puts the app in test mode. |
| `E2E_MAIL_OUTBOX` | **Diverts all outgoing mail to a local file with no delivery error.** Invitations would silently vanish. |
| `TEST_DATABASE_URL`, `DEVELOPMENT_DATABASE_URL` | Local test-harness guards only. |
| `PRIVATE_REGISTRY_ROOT`, `PRIVATE_REGISTRY_SEMESTER` | Local CSV conversion only. |

These two together are the worst failure mode this app has: mail appears to send, nothing
is delivered, and nothing errors.

---

## 4. First deploy: schema, then bootstrap

Run these **from your own machine**, pointed at the production database. Vercel gives you
no shell, and neither step should ever run automatically on every deploy.

### 4a. Apply the schema — with the *direct* (non-pooled) URL

```bash
DATABASE_URL="<DIRECT non-pooled production string>" npx prisma migrate deploy
```

`migrate deploy` is non-interactive and applies only what is pending. It never resets and
never seeds. Use the direct string, not the pooler (§1a).

### 4b. Deploy the app

Push to `main`, or hit **Deploy** in the Vercel dashboard. Confirm the build log shows
`prisma generate` running before `next build`.

### 4c. Create the first administrator and the official templates

```bash
DATABASE_URL="<DIRECT production string>" \
BOOTSTRAP_ADMIN_NAME="<full name>" \
BOOTSTRAP_ADMIN_EMAIL="<real address>" \
BOOTSTRAP_ADMIN_PASSWORD="<strong password, 8+ chars>" \
npm run bootstrap
```

This creates only what the UI cannot: the first admin, the unoccupied `ASTU · Academic VP`
root, its closure row, the official Likert scales, and the three published default
templates (Student, Peer, Head).

It is **idempotent and non-destructive** — safe to re-run. It never resets an existing
admin's password, and it aborts rather than proceeding if it finds a conflicting root or
conflicting official templates. It deliberately creates no College, no departments, no
semester, and no people; those are the operator's job in `OPERATOR_GUIDE.md` §4.

### 4d. ⛔ Never run the demo seed against this database

```bash
npx prisma db seed     # DESTRUCTIVE — clearAll() wipes everything first
```

`prisma/seed.ts` calls `clearAll()` before inserting ~335 fake accounts. It is for a
throwaway demo database only. On a database with real staff and students it is
unrecoverable without a backup. Take a snapshot before any destructive command.

---

## 5. Verify the deployment

1. **`/login` renders.** Confirms the app booted and static assets serve.
2. **Sign in as the bootstrap admin.** Confirms Postgres connectivity, `argon2` built
   correctly on the deploy container, and the session cookie round-trips first-party.
3. **Open `/manage/structure`.** The `ASTU · Academic VP` root should be present and
   unoccupied. Confirms the bootstrap landed on the database the app is actually reading.
4. **Send one real invitation.** Confirms SMTP. Check the link in the received email points
   at your production domain, not `localhost:4300`.
5. **Download one PDF letter** from `/manage/letters` for any department with a closed
   round. This is the check that `outputFileTracingIncludes` did its job — see §7.

If step 5 fails with `ENOENT ... Helvetica.afm`, the pdfkit font data did not make it into
the bundle; re-check [next.config.ts](next.config.ts).

---

## 6. Ongoing operation

**Application code changes** — push to `main`; Vercel builds and promotes automatically.

**Schema changes** — Vercel does *not* run migrations. The order matters:

```bash
# 1. locally, against your dev database
npx prisma migrate dev --name <change>
# 2. commit the generated prisma/migrations/ folder
# 3. apply to production BEFORE the code that needs it goes live
DATABASE_URL="<DIRECT production string>" npx prisma migrate deploy
# 4. push to main
```

Applying the migration before pushing avoids a window where new code queries columns that
do not exist yet.

**Rollback** — Vercel's dashboard can instantly promote a previous deployment. Note this
rolls back *code only*; a migration already applied stays applied. Prefer additive,
backward-compatible migrations so a code rollback is always safe.

---

## 7. Known limits on Vercel

These are real and specific to serverless. None block the release; all are worth knowing
before the first real campaign.

### Campaign launch is bounded by function duration

`launchCampaign` and `remindCampaign` send SMTP **sequentially** — deliberately, because
concurrent sends open one connection each and time a chunk out silently
([campaigns.ts:647](src/server/campaigns/campaigns.ts:647)). Total time is therefore
`recipients × per-send latency`, and there is no resume-from-partial.

`maxDuration = 300` is set on the campaign pages, which is the Vercel **Pro** ceiling.
**Hobby caps lower**, so on Hobby a large campaign can be cut off mid-send — some
recipients invited, some not, with no error surfaced to the operator.

Practical guidance: at a typical ~0.3–1s per SMTP send, budget roughly 300–900 recipients
per launch on Pro. For a department larger than that, split the campaign across several
smaller ones (fewer offerings each) and launch them one after another. Chunked/queued
sending is the proper fix and is next-pass work.

### Amharic on PDF letters needs a bundled font

PDFs embed their glyphs at generation time. `findEthiopicFont()` searches for a system
Ethiopic font; a Vercel container has none, so **the Amharic university name is silently
omitted** and only the English name appears. The letter is still valid.

To enable it: commit an OFL-licensed font (Noto Sans Ethiopic, Abyssinica SIL) into the
repo — e.g. `public/fonts/NotoSansEthiopic-Regular.ttf` — and set
`ETHIOPIC_FONT_PATH=public/fonts/NotoSansEthiopic-Regular.ttf`. A relative path resolves
against the working directory; an absolute path is used as-is. If the variable is set but
the file is missing, the app logs a warning rather than failing silently.

### PDF content verification is deferred

PDF generation works and the download is verified end to end, but automated
*text-extraction* assertions were removed from the release gate (the old `pdf-parse`
dependency is obsolete). Visual rendering, pagination, Unicode/Amharic text, and physical
printing behaviour are next-pass work. Check one PDF by eye after the first deploy.

### Cold starts

Low-traffic deployments cold-start, which adds a second or two to the first request and to
the first Prisma connection after idle. Normal; not a misconfiguration.

---

## 8. Quick reference

```bash
# apply schema to production (direct, non-pooled URL)
DATABASE_URL="<direct>" npx prisma migrate deploy

# create first admin + official templates (idempotent, safe to re-run)
DATABASE_URL="<direct>" BOOTSTRAP_ADMIN_NAME="..." BOOTSTRAP_ADMIN_EMAIL="..." BOOTSTRAP_ADMIN_PASSWORD="..." npm run bootstrap

# local release gate before pushing to main
npm ci && npx prisma generate && npx tsc --noEmit --incremental false && npm run test:unit && npm run build
```

Once §4 and §5 pass, continue with [`OPERATOR_GUIDE.md`](OPERATOR_GUIDE.md) §4 — invite the
Academic VP, the College manager, and the two department heads, in that order — and record
evidence in [`CSV_RUN_REPORT_TEMPLATE.md`](CSV_RUN_REPORT_TEMPLATE.md).
