# ASTU Teaching Feedback v2 — End-to-End Testing Flow

A walkthrough that touches every screen and role in the system, using the data
already in the seeded database. Password for **every** staff/student account
is `astu1234`.

---

## 1. Start the server

```bash
npm run dev
```

Runs on **http://localhost:4300** (`.claude/launch.json` → `web`). If the DB
was just re-seeded, everyone's session is wiped — you'll need to log in again
even if you were logged in before.

---

## 2. Accounts

### Staff / manager / teacher logins (`/login`)

| Email | Role | Scope | Good for testing |
| --- | --- | --- | --- |
| `admin@astu.edu.et` | ADMIN | root | Structure editor, Semesters admin, full nav |
| `miftah.shifera@astu.edu.et` | MANAGER | ASTU · Academic VP (L0, root) | Scope Overview / Compare at the widest scope |
| `kebede.alemu@astu.edu.et` | MANAGER | College of EE & Computing (L1) | Mid-level rollup, no roster of its own (Office/College) |
| `rahel.mekonnen@astu.edu.et` | MANAGER | Quality Assurance (L1, cross-cutting) | Confirms CSE is reachable via two paths without double-counting in rollups |
| `meron.assefa@astu.edu.et` | MANAGER + TEACHER | CSE Department (L2, leaf) | **Primary account** — has a roster, so People/Groups/Import/Templates/Campaigns all work; also a teacher, so Me/Letters work on the same login |
| `amanuel.bekele@astu.edu.et` | TEACHER | CSE | Composite (52.7) vs. self-rating (38.6) gap on the Me screen |
| `bekele.dinku@astu.edu.et` | TEACHER | CSE | Below min-N — Me screen should show a suppressed/insufficient-data state |
| `almaz.tadesse@astu.edu.et` | MANAGER | College of Applied Natural Science | Seeded with `invite: "invited"` — never completed registration, useful for testing "resend invite" |
| `dawit.haile@astu.edu.et` | MANAGER | Software Engineering | Seeded with `invite: "expired"` — useful for testing an expired invite link |

### Student login (task-list / in-shell respond flow)

| Email | Role | Notes |
| --- | --- | --- |
| `samuel.wolde1@astu.edu.et` | STUDENT | Has **19 pending response tasks** right now — logs into the shell and hits `/respond/tasks` with a real queue to work through |

(All other student accounts are auto-generated as `firstname.lastnameN@astu.edu.et`
at seed time with random names — this one was looked up directly in the DB because
it has pending, unsubmitted tasks. Any account under `/manage/people` → CSE roster
also works, just may already be fully responded.)

### No-login flows

| Flow | URL | Notes |
| --- | --- | --- |
| **Guest instant campaign** | `http://localhost:4300/guest/c68f1532393b2d5714` | "Guest Lecture Series — instant" — `audienceMode: GUEST_ALLOWED`, no account or token needed, anyone with the link can submit |
| **Standalone token form** | `http://localhost:4300/respond/[token]` | Per-respondent link, e.g. sent by email when a campaign is launched/reminded. Tokens are **SHA-256 hashed at rest** (by design — see project `CLAUDE.md`), so a real one can only be captured off an actual outgoing email, not read out of the DB. See §7 below for how to get one. |
| **Invite registration** | `http://localhost:4300/register/[token]` | Same hashing story as above — capture off the invite email. |

---

## 3. Admin pass — Structure & Semesters

Log in as `admin@astu.edu.et`.

- [ ] **Structure** (`/manage/hierarchy`) — confirm the DAG renders (CSE should
      show under *both* College of EE & Computing and Quality Assurance).
      Drag a node to reparent it, then undo/revert.
- [ ] Add a new node (any type/level), then deactivate it, then reactivate it —
      confirms the archive-not-delete convention.
- [ ] Try `deleteNode()` on a node that owns content (should be blocked with
      collected blockers) and on an empty leaf (should succeed).
- [ ] **Semesters** (`/manage/semesters`) — create a new `Semester`
      (e.g. Spring 2027/28), confirm it's the only place `Term`/`academicYear`
      are edited.
- [ ] **Personnel** (`/manage/personnel`) — browse the full roster across
      departments (admin-only cross-department view).

---

## 4. Manager pass (CSE / `meron.assefa`) — the full content lifecycle

Log in as `meron.assefa@astu.edu.et` (MANAGER + TEACHER on CSE — the one
account that can drive every Manage-mode screen).

### People / Groups / Import
- [ ] `/manage/people` — view CSE roster, add a person manually.
- [ ] `/manage/groups` — view Weekend/Extension/Regular groups, create a new
      `StudentGroup` (any `StudentProgram` — remember it's descriptive only,
      **no validation is gated on it**, see project `CLAUDE.md`).
- [ ] `/manage/import` — CSV import: run a **dry run** first (check the
      preview/diff), then commit.

### Templates & Scales
- [ ] `/manage/scales` — view existing Likert scales, create a new one with
      custom points.
- [ ] `/manage/templates` — open "Student Evaluation 2026" (published,
      immutable — confirm it can't be edited in place). Clone it, edit the
      clone's sections/items, **Publish** it, confirm the old version stays
      untouched and the immutability lifecycle (draft → published → archived)
      holds.

### Campaigns
- [ ] `/manage/campaigns` — open the campaign builder, create a new campaign
      against the CSE department: pick a semester, assign templates per
      target group (STUDENT/PEER/MANAGER), assign teachers/groups.
- [ ] Launch it — confirms the launch guard checks (should succeed cleanly
      now that the Summer/program guardrail was removed; see project
      `CLAUDE.md` note on `weekend_extension_no_guardrail`).
- [ ] Open the monitor view for an already-**OPEN** campaign — try
      `"Fall 2026/27 Student Evaluation — CSE"` — check response-rate
      tracking, then trigger **Remind** (sequential email sends, not
      `Promise.all` — check the terminal doesn't error).
- [ ] Close a campaign, confirm it moves to CLOSED and locks further
      responses.

### Letters
- [ ] `/manage/letters` — generate an evaluation letter (Word) and a PDF for
      a teacher, confirm both download and open correctly (`/api/letters`
      route handler — the one binary-response path that isn't a Server
      Action).

---

## 5. Analyse pass

Still logged in as a manager — try both `meron.assefa` (CSE-scoped) and
`miftah.shifera@astu.edu.et` (root-scoped, AVP) to see scope differences.

- [ ] `/analyse/overview` (Scope Overview) — heatmap across departments.
      Confirm **Offices never get their own scored row** (QA/AVP nodes should
      be absent from the scored rows, only their descendant
      Colleges/Departments show).
- [ ] `/analyse/compare` — compare two teachers or two departments
      side-by-side.
- [ ] `/analyse/results` (Teacher Results) — open `amanuel.bekele@astu.edu.et`
      and confirm the composite-vs-self-rating gap (52.7 vs 38.6) renders.
      Open `bekele.dinku@astu.edu.et` and confirm the below-min-N suppressed
      state renders instead of a score.
- [ ] As `miftah.shifera`, confirm the scope composite is **59.8** with
      **n=465** — this was the number hand-verified against a manual sum of
      the five department composites (dedup check for CSE's two parent
      paths).

---

## 6. Respond pass — student & teacher self-view

### In-shell task queue (logged-in student)
Log in as `samuel.wolde1@astu.edu.et`.
- [ ] `/respond/tasks` — see the list of 19 pending tasks.
- [ ] Open one task (`/respond/task/[id]`), fill out every section (Likert
      items + free-text comments), submit.
- [ ] Confirm you land on `/respond/done` and the task count on the tasks
      list drops by one.
- [ ] Submit two or three more to get comfortable with different
      section/scale combinations.

### Teacher self-view
Log in as `amanuel.bekele@astu.edu.et` (or reuse `meron.assefa`, who is both
manager and teacher).
- [ ] `/me` — self dashboard.
- [ ] `/me/feedback` — composite scores + written comments, confirm the
      min-N privacy gate is respected (no comment shown if it would deanonymize
      a small group).
- [ ] `/me/profile` — update profile fields, change password, confirm the
      "Saved."/"Password changed." message does **not** flash on first load
      (the `useActionState` initial-render gotcha documented in `CLAUDE.md`)
      and only appears after an actual submit.

---

## 7. No-login flows

### Guest ballot (instant campaign, real public link)
- [ ] Open `http://localhost:4300/guest/c68f1532393b2d5714` in an incognito
      window (or just a fresh tab — no session needed).
- [ ] Submit feedback for one of the two guest-lecture teachers (Hanna Girma
      or Yonas Tesfaye). No login, no token — confirm it works purely off the
      public slug.
- [ ] Reload the link and submit again — confirm repeat/anonymous submissions
      are allowed up to `maxResponses` (120) and it stops accepting past that,
      if you want to push it that far.

### Token-based flows (optional — needs a mail catcher)
Response tokens and invite tokens are stored **SHA-256 hashed**, so the raw
token only ever exists in the outgoing email — it can't be read back out of
the database. To exercise `/respond/[token]` and `/register/[token]` for
real:

1. Run a local SMTP catcher, e.g. [MailDev](https://github.com/maildev/maildev):
   ```bash
   npx maildev
   ```
   It listens on `localhost:1025` by default, matching `mail.ts`'s fallback
   host/port — no `.env` changes needed unless you've already set
   `SMTP_HOST`/`SMTP_PORT`.
2. Open MailDev's web UI (`http://localhost:1080`).
3. As admin, resend the invite to `almaz.tadesse@astu.edu.et` (`invite:
   "invited"`) — or trigger **Remind** on an open campaign — and read the
   real link out of the caught email.
4. Without MailDev running, `sendMail()` just logs
   `Failed to send mail to ...` to the server terminal and moves on — the
   token still gets created and hashed in the DB, but the link is
   unrecoverable, so this step is skippable if you don't need it.

---

## 8. Wrap-up checklist

By the end of this pass you will have touched every phase in the project's
status table:

- [x] Auth + RBAC (3 layers: nav filtering, direct-URL block, per-action scope check) — implicitly covered by logging in as each role above and confirming nav/URLs differ
- [x] Structure (DAG, closure table, archive/reactivate)
- [x] Semesters admin
- [x] People / Groups / CSV import
- [x] Templates / Scales (draft → publish → immutable)
- [x] Campaigns (builder → launch → monitor → remind → close)
- [x] Respond (in-shell task queue, guest public link)
- [x] Analyse (Scope Overview, Compare, Teacher Results, min-N gate)
- [x] Me + Letters (self-view, profile/password, Word/PDF generation)

If everything above works without errors in the terminal or browser console,
the full stack is verified end-to-end.
