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

Vercel is the natural fit for a Next.js App Router app with Server Actions and Route
Handlers — no proxy/rewrite tricks needed the way v1's split frontend/API required,
since everything (pages, actions, the `/api/letters` binary download route) is one
deployment on one domain. Session cookies are first-party by construction.

**Build settings** (mostly Vercel's Next.js defaults; called out only where this repo
needs something explicit):

- **Framework preset**: Next.js.
- **Build command**: `next build` (default). Prisma Client generation runs automatically
  via the `postinstall` script Prisma adds — if it's ever missing, add
  `"postinstall": "prisma generate"` to `package.json`.
- **Environment variables** (see the table below).
- **Node runtime, not Edge**, for anything touching Prisma or `argon2` — this is already
  the default for Route Handlers and Server Actions; `next.config.ts`'s
  `serverExternalPackages: ["argon2", "pdfkit", "nodemailer"]` is what keeps these native/
  CJS-heavy packages out of any bundling step that would break them.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Postgres connection string |
| `WEB_ORIGIN` | the deployed domain, e.g. `https://astu-feedback.vercel.app` — used to build links inside emails (invitations, campaign invites) |
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

**Seed data**: `npx prisma db seed` populates the full ASTU demo fixture (~335 fake
accounts, `astu1234` password for all). Fine for a staging/demo deploy — **never run it
against a database real users are on**, since it wipes all existing data first (see
`seed.ts`'s `clearAll()`). For real production use, create the root admin account by hand
instead (there is no self-service admin registration path — the seed script's
`makeUser()` is the only place that pattern lives today).

## Gotchas carried over from local dev

- **`argon2` is a native compiled module.** It needs to build on whatever OS the deploy
  container runs (Linux, for Vercel) — automatic as long as `npm install` runs fresh on
  the platform. Don't vendor `node_modules` into the repo.
- **Prisma Client must be generated wherever the app actually runs** — Vercel's build
  pipeline runs `npm install` (triggering Prisma's `postinstall`) before `next build`,
  so this is normally automatic; only worth checking if a build ever shows a stale-client
  error.
- **`docx`/`pdfkit`** (evaluation letters) are pure-JS/native-free npm packages — no
  special handling beyond the `serverExternalPackages` entry already in
  `next.config.ts`.
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
4. Confirm `WEB_ORIGIN` matches the real deployed URL — a wrong value here puts broken
   links in every email without causing any visible error elsewhere.
5. Generate an evaluation letter (Word or PDF) from `/manage/letters` for a department
   with at least one fully-closed round, to confirm `docx`/`pdfkit` work in the deploy
   container (they're pure JS, but worth confirming once per environment).
