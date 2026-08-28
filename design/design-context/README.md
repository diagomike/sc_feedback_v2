# Design Context — University Lecturer Feedback System

This folder is a self-contained briefing pack for designing the frontend. Everything
needed to understand the system is here; you do not need to read the backend code.

## What this system is, in one paragraph

A university-wide platform for collecting and analysing feedback on lecturers. Students,
peer teachers, and department heads each fill in a **different** questionnaire about a
teacher. Above the departments sits a nested management hierarchy, and every manager can
see aggregated analysis for everything beneath them. Feedback is **anonymous to viewers**
and results stay hidden until enough responses exist that nobody can be identified by
elimination.

## Read in this order

| File | What it covers |
| --- | --- |
| `01-product-brief.md` | Domain concepts, vocabulary, the rules that constrain the UI |
| `02-roles-and-journeys.md` | The five user types and what each actually does day to day |
| `03-screens-to-design.md` | **The main deliverable.** Every screen, prioritised, with requirements |
| `04-data-contracts.md` | Real API response shapes, so designs are grounded in actual data |
| `05-design-constraints.md` | Tech stack, existing patterns, what's available to build with |
| `06-ux-challenges.md` | The genuinely hard problems worth solving deliberately |

## What's already built vs. what needs design

Milestone 1 (a thin end-to-end slice) is **built and working**: login, the feedback grid
form, and a basic results dashboard. Those three screens exist as functional-but-plain
React — they prove the data flows, they are not a design reference. Treat them as
**wireframes to be replaced**, not a style to match.

Everything else in `03-screens-to-design.md` is unbuilt and needs design.

## Current code

`current-implementation/` is a snapshot of the working frontend, copied here so you can
see real component structure, real API calls, and the exact TypeScript types the screens
receive. It is a snapshot — the live source is at `apps/web/src/`.

```
current-implementation/
├── App.tsx                    routing
├── main.tsx                   entry point
├── index.css                  Tailwind directives (no custom CSS yet)
├── tailwind.config.js         default config, nothing extended yet
├── pages/                     the 3 built screens
├── components/                ProtectedRoute only
├── lib/                       api client + auth context
└── shared-types/              the TypeScript contracts shared with the backend
```

`shared-types/` matters most — those types are the actual shape of every API payload,
generated from the same zod schemas the server validates against. Designs should assume
this data and no more, or flag clearly where new backend fields are needed.

---

## Handing the design back for implementation

Most useful, roughly in order:

1. **A design system first** — colour, type scale, spacing, and a component inventory.
   Everything else inherits it, and it's the thing currently most absent.
2. **Screen designs**, ideally as React + Tailwind so they drop straight into
   `apps/web/src/`. Static markup with placeholder data is fine — wiring to the real
   API is my job.
3. **Notes on states**, not just the happy path: loading, empty, error, and the min-N
   suppressed state matter as much as the populated view.
4. **Flag any new data a design needs.** If a screen wants a "department average" or a
   "trend over time", say so — those are backend endpoints I'll need to add, and it's
   much cheaper to know before I build the API than after.

Don't worry about matching the existing code's styling — it's placeholder and will be
replaced wholesale.
