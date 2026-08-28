# Design Constraints & Technical Context

## Stack

| Layer | Choice |
| --- | --- |
| Framework | **React 18** + TypeScript |
| Build | **Vite 5** |
| Routing | **react-router-dom 6** |
| Styling | **Tailwind CSS 3** |
| Component library | **shadcn/ui** — chosen, not yet installed |
| Charts | Not yet chosen — Recharts is the assumption |
| Backend | NestJS + Prisma, REST, cookie session auth |

## What exists today

Almost nothing, deliberately — the built screens prove data flow, not design.

- `tailwind.config.js` is **stock**. No custom colours, type scale, or spacing.
- `index.css` contains **only** the three `@tailwind` directives. Zero custom CSS.
- No component library installed yet, no design tokens, no theme.
- Current screens use ad-hoc Tailwind utilities (`bg-slate-50`, `rounded-lg shadow`).
  This is placeholder styling, **not a system to extend**.

**This is a clean slate.** A proposed design system — colour, type, spacing, component
inventory — is genuinely wanted, not a nice-to-have.

## Constraints that actually bind

**Must work:**
- **Mobile-first for the feedback form.** Students are on phones. This is the
  highest-volume screen in the system and the current implementation fails on mobile.
- Desktop-first is acceptable for admin/manager screens (hierarchy builder, campaign
  builder, dashboards) — those are done sitting down.
- **Accessible.** A university system will face accessibility requirements. The grid
  form especially: radio matrices are a classic screen-reader failure. Keyboard
  navigation through a 5×3 rating grid needs deliberate thought.
- **Light-touch bandwidth.** Assume some users on poor connections.

**No constraint on:**
- Brand colours — none exist. Propose something.
- Dark mode — not required, welcome if it comes free.
- Browser support — modern evergreen is fine.

## Existing patterns worth keeping

From `current-implementation/lib/`:

- **`api.ts`** — thin fetch wrapper, `credentials: "include"` for the session cookie,
  throws typed `ApiError` with status + message. All API errors surface as
  `{ status, message }`.
- **`auth-context.tsx`** — React context providing `{ user, loading, login, logout }`.
  The `loading` state exists because session validation is async on mount — **every
  authenticated screen has an initial indeterminate state** that needs designing, not
  just a spinner.
- **`ProtectedRoute.tsx`** — redirects to `/login` when unauthenticated.

## Routing today

```
/                       → redirect to /dashboard
/login                  → LoginPage
/respond/:token         → ResponseFormPage   (no auth — token is the credential)
/dashboard              → DashboardPage      (auth required)
```

Note `/respond/:token` sits **outside** the authenticated shell entirely. Guest instant
campaigns and emailed private links both land here with no account. It likely needs its
own minimal chrome rather than the full application shell.

## A note on the built screens

`LoginPage`, `ResponseFormPage`, and `DashboardPage` work correctly against real data —
they were verified end-to-end with real submissions. But they were written to prove the
architecture, with zero design intent. Their layout choices carry no weight.

Read them for: what data each screen receives, what states exist, what interactions are
wired. Ignore them for: visual design, hierarchy, spacing, colour, component structure.
