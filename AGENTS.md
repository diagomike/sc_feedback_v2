# ASTU Teaching Feedback (v2) — Context

Status file for picking this project back up cold. Update it at the end of every phase
or significant change.

## What this is

A rebuild of `D:\py_yaddessa\sc_feedback` (the "v1" NestJS+Vite app) as a single Next.js
15 fullstack app — App Router, Server Components + Server Actions, Tailwind v4, Prisma/
Postgres. Same domain (university lecturer feedback: students/peers/managers rate
teachers via campaigns, scored with weighted competency composites and a min-N privacy
gate), same dense visual design (IBM Plex Sans/Mono, flush panels, 1px rules, no
shadows), one real domain change: **campaigns now belong to a Semester** (Fall/Spring/
Summer) instead of v1's date-guessing `seasonLabel()`/offset mechanism.

**The design is still the spec.** `design/building-web-application-screens/project/ASTU
Feedback.dc.html` (copied verbatim from v1) is the Codex Design handoff — 16 screens.
`design/design-context/` has the product brief, roles/journeys, screen list, and UX
notes. Read the relevant screen before changing its layout — most UX questions are
already answered there.

**Full plan**: `C:\Users\pc\.Codex\plans\i-want-to-rebuild-shimmying-spring.md` (this
machine only) — has the phase-by-phase build plan and the semester-change rationale in
detail. This file is the compact, portable status summary.

## Status: all 10 phases complete and browser-verified

| Phase | What | Verified |
| --- | --- | --- |
| 0 | Scaffold — Next.js, Tailwind v4 tokens mapped onto shadcn, self-hosted fonts | Renders light/dark |
| 1 | Schema + seed — `Semester`/`Term`/`StudentProgram` added, fixtures ported | 6 semesters, 335 users, 1669 responses seeded |
| 2 | Auth + shell — session cookies, 4-mode shell, 3-layer RBAC | Login/RBAC/direct-URL-block all verified per role |
| 3 | Structure — closure algorithm, Offices/Colleges/Departments, Personnel, drag-drop Structure, Semesters admin | DAG multi-parent rendering, deactivate/reactivate round-trip |
| 4 | People/Groups/Import | 315-person roster, Weekend/Extension groups, CSV dry-run/commit |
| 5 | Templates/Scales | Full section/item builder, draft→publish→immutable lifecycle |
| 6 | Campaigns | Builder, launch guards, monitor — Summer-launch-blocks-Regular-group test done **then reverted per user feedback, see below** |
| 7 | Respond | Task list, in-shell form, standalone token form, guest ballot flow — real submission verified with DB writes |
| 8 | Analyse | Semester-based rollup (replaces v1's offset mechanism), Scope Overview, Compare, Teacher Results — AVP dedup/scope-composite math verified exactly |
| 9 | Me + Letters | Self-view, profile/password, Word/PDF letter generation |
| 10 | Close-out | This file + `DEPLOYMENT.md` |

All work is uncommitted at time of writing (no git repo initialized yet in this
directory — v1's `.git` was not carried over).

## The semester change, as actually built

`Semester` (`academicYear` + `term: FALL|SPRING|SUMMER` + `startsAt`/`endsAt`) is a real,
admin-managed row (`/manage/semesters`, ADMIN only). Every `Campaign` has a required
`semesterId`. This replaced v1's whole `offset` mechanism (`resolveNodeCampaign(nodeId,
targetGroup, offset)` with `skip`/`take` over `closesAt`-ordered campaigns) with a direct
lookup (`resolveNodeCampaign(nodeId, targetGroup, semesterId)`), and replaced
`listScopeRounds()`'s anchor-node hack (pick whichever reachable node has the deepest
history, read every label off that one timeline — needed because different departments'
histories aren't the same depth) with `listScopeSemesters()`: a flat query for "which
real Semester rows have a matching campaign in this scope," since there is now one
shared timeline instead of per-node histories to reconcile. The v1 bug class this
removes (duplicate/misaligned season labels across departments) cannot recur.

**`StudentProgram` (`REGULAR`/`WEEKEND`/`EXTENSION`) exists on `StudentGroup` purely as
descriptive metadata — it drives NO validation anywhere.** Weekend and Extension are
just a different class *schedule* (weekend/evening meetings instead of daytime), taught
by the same teachers as Regular sections. The only reason `Term.SUMMER` exists at all is
that Weekend/Extension students have reduced contact hours per regular term and make up
the difference with a summer term — Regular students don't have one. A first pass at
this feature added a `validateSummerAudience` launch guard (blocking a Summer campaign
from assigning a `REGULAR` group) plus colored program badges in the UI; **the user
explicitly corrected this** ("there is no reason to separate weekend and regular
classes... you don't need to make special guardrails... just make it same as its regular
counterpart") and both were removed in the same session. See
`weekend_extension_no_guardrail.md` in this session's memory for the full note — **do
not reintroduce either** if asked to touch anything semester/program-related.

## Architecture

- **No workspaces, no shared DTO package.** `src/lib/schemas/*.ts` (zod) is what
  `packages/shared` was in v1 — same files, but imported directly with full type
  inference, no build step, no CJS-barrel interop problem (v1 hit a real Rollup/
  `cjs-module-lexer` bug from that split; moot here).
- **Server Components read, Server Actions write.** Pages under `src/app/(shell)/...`
  are `async` Server Components calling functions in `src/server/*` directly (no fetch,
  no API layer). Mutations go through `src/actions/*.ts` (`"use server"`), validated by
  the same zod schemas. Route Handlers exist only for the one thing Server Actions can't
  do — binary responses (`src/app/api/letters/route.ts`, Word/PDF downloads).
- **Auth**: `src/server/auth/session.ts` — argon2 password hashes, SHA-256-hashed
  session tokens (raw token only in the httpOnly cookie), same one-way-hash-so-resend-
  always-regenerates-the-link design as v1. `middleware.ts` is Edge-only and does
  nothing but forward the pathname via a request header (`x-pathname`) — it CANNOT reach
  Prisma or argon2 (Edge runtime), so `requireUser()`/`canAccessPath()` in the
  `(shell)` layout are the real auth boundary, not the middleware.
- **RBAC, three independent layers, exactly as v1**: `navFor()/modesFor()` (`src/lib/
  nav.ts`) filters the sidebar; `canAccessPath()` in the `(shell)` layout refuses a
  direct URL; every server action re-asserts scope itself (`ownDepartmentNode()`,
  `ownNode()`, `visibleNodeIds()` in `src/server/scope.ts`). Hiding a nav row is never
  the only thing standing between a role and a screen.
- **Design tokens**: `src/app/globals.css` ports v1's CSS variables verbatim and maps
  them onto shadcn's token names (`--background: var(--bg)`, etc.) so shadcn primitives
  in `src/components/ui/` inherit the ASTU palette and the `data-theme` dark toggle for
  free. The dense ASTU scale (`text-11.5`, `spacing-7`, ...) is added as **extra**
  `@theme` entries, not a wholesale replace of Tailwind's default scale (v1 did that,
  which would have broken every vendored shadcn component here).

## Conventions carried over from v1 (still load-bearing)

- **Department-scoping via `ownDepartmentNode()`**: People, Groups, CSV-import,
  Evaluation-letters, Campaigns all throw unless the caller's own node is a
  `DEPARTMENT` — an Office/College manager has no roster of their own. `ownNode()`
  (unrestricted by type) is the separate pattern Templates use, since templates are
  authored for reuse down the hierarchy.
- **Draft = full-replace-on-save, never a diff.** Template sections, campaign
  assignments/templates, scale points all delete-and-recreate their child rows wholesale
  on each save.
- **Ancestor-visibility ≠ visibleNodeIds.** Templates inherit *down* the hierarchy (an
  ancestor's published template is visible to descendants); `visibleNodeIds()` answers
  the opposite question (what a manager can see *below* them).
- **Pure logic gets extracted and unit tested; thin Prisma wrappers don't.** Every
  `*-logic.ts` file (`campaign-logic.ts`, `semester-logic.ts`, `template-logic.ts`,
  `closure-algorithm.ts`, `scoring.ts`, `rollup-logic.ts`) has zero Prisma imports and a
  matching `.spec.ts`.
- **Tokens are one-way hashed (SHA-256)** — a leaked DB dump reveals no usable secrets;
  "resend the same link" is architecturally impossible by design.
- **Nothing is deleted, only archived/revoked/closed/deactivated** — except
  `hierarchy.ts`'s `deleteNode()` and `semesters.ts`'s `deleteSemester()`, which are real
  deletes but only permitted when the target owns zero content (every check re-verifies
  server-side, blockers collected all at once).
- **Bulk email is sequential, never `Promise.all`** (`campaigns.ts`'s `launchCampaign`/
  `remindCampaign`) — concurrent `sendMail` calls each open their own SMTP connection and
  can time out a chunk of them silently.
- **The hierarchy is a DAG, not a tree.** `rollupBranch()` in `rollup-logic.ts` dedupes
  by `nodeId` from the flattened, already-deduped contributor set — never means a
  parent's *children's* pre-aggregated numbers directly — specifically to survive a
  department (e.g. CSE) reachable from a rolled-up ancestor via two different paths
  (its College, and the cross-cutting QA directorate) without double-counting it. This
  is regression-tested (`rollup-logic.spec.ts`) and was re-verified live against the
  real seeded AVP account (scope composite 59.8, n=465, matching a hand sum of the five
  real department composites with zero double-count).
- **Offices never get a scored row** in Scope Overview (`getScopeRollup` filters
  `rows` to `node.type !== "OFFICE"`) — an oversight function layered across departments
  that already belong to their own College isn't a real "branch" the way a College's
  average is.

## Environment quirks (this machine)

- **Dev server on :4300** — v1's ports (4001 API / 4173 web) are left free;
  `.Codex/launch.json` has one `web` entry.
- **Local Postgres 18**, separate database from v1: `astu_feedback_v2` (v1's
  `astu_feedback` is untouched). `DATABASE_URL` in `.env`.
- **Prisma pinned to 6.19.3**, same reasoning as v1 (7.x forces driver adapters + config
  file migration — unnecessary churn for this project).
- **No egress to Google Fonts in this sandbox** — `next/font/google` hung/failed here;
  switched to `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono` (self-hosted,
  bundled at build time, zero runtime network dependency) — same self-hosting intent as
  v1's own `@fontsource` usage, just via CSS imports in `layout.tsx` instead of
  `next/font`.
- **Windows + `prisma migrate dev` EPERM**: stop the dev server first — it holds the
  query-engine `.dll.node` open, same gotcha v1 documented.
- **Re-seeding wipes sessions** — re-login required after `npx prisma db seed`.
- **`useActionState`'s initial value is a real gotcha**: a bare `state.ok` check renders
  as true on the very first render (before any submission) unless you either include a
  data field that's naturally absent until success (`state.id`, the pattern
  `NewCampaignClient`/`TemplatesClient` use) or compare the state object against the
  literal `initialState` reference (`state !== initialState && state.ok`, the pattern
  `ProfileClient` uses after this was caught as a real bug — a "Saved."/"Password
  changed." message was showing before the user had touched either form).
- **`router.push()` must go in a `useEffect`, never directly in a component's render
  body** — calling it inline (`if (state.ok && state.id) router.push(...)` outside an
  effect) throws real "Cannot update a component while rendering a different component"
  errors under React 19; caught and fixed in the same two components above.

## Verifying changes

```bash
npm run build
npx vitest run
npx prisma migrate dev && npx prisma db seed
```

Browser verification via `preview_start` against `.Codex/launch.json`'s `web` entry
(:4300). Seeded accounts (password `astu1234` for all — same roster as v1):

| Email | Role | Notes |
| --- | --- | --- |
| `admin@astu.edu.et` | ADMIN | root — Structure + Semesters admin |
| `miftah.shifera@astu.edu.et` | MANAGER | Academic VP (L0) — the account the rollup-dedup math was re-verified against |
| `kebede.alemu@astu.edu.et` | MANAGER | College of EE & Computing (L1) |
| `rahel.mekonnen@astu.edu.et` | MANAGER | Quality Assurance (L1, cross-cutting parent) |
| `meron.assefa@astu.edu.et` | MANAGER+TEACHER | CSE Department (L2, leaf) — most Manage-mode work verified against this account |
| `amanuel.bekele@astu.edu.et` | TEACHER | Real composite-vs-self-rated gap (52.7 vs 38.6 in the current round) |
| `bekele.dinku@astu.edu.et` | TEACHER | Deliberately below min-N (suppressed-state fixture) |

`prisma/seed.ts` also creates a Summer 2024/25 campaign against Weekend/Extension CSE
groups (`SUMMER_TEACHING` in `fixtures.ts`) — not because anything requires it to be
those groups, just because that's the realistic seed scenario for a Summer round.
