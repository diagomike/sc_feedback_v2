# Deploying to production

This is a single Next.js app (App Router, Server Actions, Postgres via Prisma) — there is
no separate API to host and no cross-origin cookie problem to design around, unlike v1's
NestJS+Vite split. Deploying it is close to a standard Next.js deploy with one real
prerequisite: a Postgres database, since there is no SQLite fallback (see
`schema.prisma`'s datasource comment).

## Prerequisite: a hosted Postgres

`DATABASE_URL` must point at a real Postgres instance in every environment, including
local dev — Prisma's `provider` is a static string in `schema.prisma`, not something
that branches on an env var. [Neon](https://neon.tech) has a generous free tier,
serverless Postgres, and a one-click Vercel integration that sets `DATABASE_URL`
automatically. Supabase and Vercel Postgres (also Neon under the hood) work identically
for Prisma's purposes.

## Recommended host: Vercel

> **For a step-by-step Vercel walkthrough** - linking the repo to `main`, the full
> environment-variable table with scopes, first-deploy migrate/bootstrap, and the
> serverless limits that actually bite - see **[`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md)**.
> This section is the summary.

Vercel is the natural fit for a Next.js App Router app with Server Actions and Route
Handlers — no proxy/rewrite tricks needed the way v1's split frontend/API required,
since everything (pages, actions, the `/api/letters` binary download route) is one
deployment on one domain. Session cookies are first-party by construction.

**Build settings** (mostly Vercel's Next.js defaults; called out only where this repo
needs something explicit):

- **Framework preset**: Next.js.
- **Build command**: `npm run build`, which this repo defines as
  `prisma generate && next build`. Do not shorten it to `next build`: Vercel restores a
  cached `node_modules` between builds, which can skip `postinstall` and leave a stale or
  missing Prisma Client.
- **Environment variables** (see the table below).
- **Node runtime, not Edge**, for anything touching Prisma or `argon2` — this is already
  the default for Route Handlers and Server Actions; `next.config.ts`'s
  `serverExternalPackages: ["argon2", "pdfkit", "nodemailer"]` is what keeps these native/
  CJS-heavy packages out of any bundling step that would break them.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Postgres connection string |
| `WEB_ORIGIN` | the deployed domain, e.g. `https://astu-feedback.vercel.app`. **Fallback only** — `getWebOrigin()` derives the origin from the request's `Host` header first, so email links are correct on production, previews and custom domains without this staying in sync. Still worth setting, for the rare call site with no request in scope. |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS` | same as local, or leave at the code's defaults |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | real SMTP credentials — `mail.ts` already branches on whether `SMTP_USER` is set, same code path as local dev |
| `NODE_ENV` | set automatically by Vercel to `production` — gates the session cookie's `secure` flag in `session.ts` |

## Applying the schema

```bash
npx prisma migrate deploy
```

`migrate deploy` is non-interactive and just applies whatever's pending — this is the
command a deploy pipeline should run (as a Vercel "Deploy Hook" build step, or manually
against the production `DATABASE_URL` before the first deploy). Any *future* schema
change goes through a normal `npx prisma migrate dev` locally against your dev database
first, same as this project's history so far.

**Production bootstrap**: after migrations, set `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD`, then run:

```bash
npm run bootstrap
```

The bootstrap is idempotent and non-destructive. It creates only the first administrator,
the unoccupied ASTU root, the official scale, and the three published default templates.
The administrator then creates the College/departments and invites their managers through
the Structure screen. See `OPERATOR_GUIDE.md` for the exact order.

**Demo seed**: `npx prisma db seed` populates the full ASTU demo fixture (~335 fake
accounts, `astu1234` password for all). It is fine for a disposable demo — **never run it
against a database real users are on**, since it wipes all existing data first (see
`seed.ts`'s `clearAll()`).

## Gotchas carried over from local dev

- **Never set `E2E_TEST_MODE` and `E2E_MAIL_OUTBOX` in production.** Together they divert
  outgoing mail to a local test outbox instead of SMTP, with no delivery error by design.

- **`argon2` is a native compiled module.** It needs to build on whatever OS the deploy
  container runs (Linux, for Vercel) — automatic as long as `npm install` runs fresh on
  the platform. Don't vendor `node_modules` into the repo.
- **Prisma Client must be generated wherever the app actually runs.** Relying on
  `postinstall` alone is not safe on Vercel, which restores a cached `node_modules` and
  can skip the install step entirely; that is why `prisma generate` is in the `build`
  script rather than only in `postinstall`.
- **`pdfkit` needs its font metrics pinned into the bundle.** It resolves standard fonts
  as `__dirname + '/data/Helvetica.afm'` — a dynamic path static file tracing cannot see,
  so a serverless deploy can ship without them and fail every PDF download with `ENOENT`.
  `next.config.ts`'s `outputFileTracingIncludes` pins `pdfkit/js/data/**` onto the
  `/api/letters` route. `docx` is pure JS and needs nothing beyond `serverExternalPackages`.
- **Amharic is dropped from PDF letters unless a font is supplied.** PDFs embed glyphs at
  generation time and a Linux deploy container has no Ethiopic font, so the Amharic
  university name is silently omitted (the letter is still valid). Commit an OFL font and
  set `ETHIOPIC_FONT_PATH` to re-enable it — see `VERCEL_DEPLOYMENT.md` §7.
- **Campaign launch is bounded by function duration.** Mail is sent sequentially by
  design, so a large campaign can exceed the serverless limit mid-send with no error
  surfaced. `maxDuration` is set to the Vercel Pro ceiling on the campaign pages; see
  `VERCEL_DEPLOYMENT.md` §7 for the practical recipient ceiling.
- **Re-seeding wipes every session**, same as locally.
- **Windows-only local dev note** (doesn't apply to the Linux deploy container): stop the
  dev server before `prisma migrate dev` — it holds the query-engine `.dll.node` open and
  the regenerate step fails with EPERM otherwise.

## Post-deploy checklist

1. Visit the deployed URL — `/login` should render (confirms the app booted and static
   assets serve correctly).
2. Sign in with a seeded account (if you seeded) and confirm the session cookie round-
   trips (dev tools → Application → Cookies — first-party on the deployed domain, no
   proxy involved).
3. Trigger one real email (an invite, or a campaign launch) and confirm it actually
   arrives — SMTP config is per-environment; re-verify it wasn't only working locally.
4. Confirm a link inside a received email points at the real deployed domain, not
   `localhost:4300`. The origin is derived from the request host, so this normally just
   works; `WEB_ORIGIN` only covers call sites with no request in scope.
5. Generate an evaluation letter (Word **and** PDF) from `/manage/letters` for a
   department with at least one fully-closed round. The PDF is the real check: a failure
   with `ENOENT ... Helvetica.afm` means pdfkit's font data did not make it into the
   bundle. Expect the Amharic header line to be absent unless `ETHIOPIC_FONT_PATH` is set.
