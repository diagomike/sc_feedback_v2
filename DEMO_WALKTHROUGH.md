# ASTU Feedback — demo walkthrough

A linear script for demonstrating the whole system on a clean database, organised by **who
is signed in**. Every act says who you are, where you go, what you click, and what proves
it worked.

This is the narrative version. [`OPERATOR_GUIDE.md`](OPERATOR_GUIDE.md) is the same ground
as a verification checklist, and [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) covers
getting the app deployed in the first place. Record evidence in
[`CSV_RUN_REPORT_TEMPLATE.md`](CSV_RUN_REPORT_TEMPLATE.md).

**Time:** ~45 min at Min-N 5, ~20 min using the fast-demo setting in Act 5.

---

## Cast — fill this in before you start

Every one of these needs a mailbox **you can actually open**, because each person receives
an invitation link and sets their own password. For a demo, `you+vp@gmail.com`,
`you+cse@gmail.com` style aliases work if your provider supports them.

| # | Role | Name | Email | Registered |
| --- | --- | --- | --- | --- |
| 0 | System administrator | | | (bootstrap) |
| 1 | Academic VP | | | ☐ |
| 2 | College manager | | | ☐ |
| 3 | CSE department head | | | ☐ |
| 4 | SWE department head | | | ☐ |

You will also need, from the CSVs you import in Act 3:

| Slot | Value | Where it comes from |
| --- | --- | --- |
| Anchor teacher | | a CSE instructor with a course of 5+ students |
| Anchor offering | | that teacher's course |
| 5 student mailboxes | | students enrolled in that offering |
| 5 peer teachers | | any other CSE instructors |

> On a demo the student and peer invitations go to the **real addresses in your CSVs**.
> If you don't want that, edit those rows to mailboxes you control before importing.

---

## Act 0 — Terminal: clean database and first admin

Run from the project folder. Use the **unpooled** Neon URL (host without `-pooler`).

```bash
DATABASE_URL="<UNPOOLED neon url>" npx prisma migrate reset --force --skip-seed
```

This drops every table, re-applies all three migrations, and seeds nothing. Then create the
one account that cannot be created through the UI:

```bash
DATABASE_URL="<UNPOOLED neon url>" BOOTSTRAP_ADMIN_NAME="System Administrator" BOOTSTRAP_ADMIN_EMAIL="<your admin address>" BOOTSTRAP_ADMIN_PASSWORD="<choose a strong password>" npm run bootstrap
```

That creates the admin, the unoccupied `ASTU · Academic VP` root, the official Likert
scales, and three published templates: *ASTU Staff Evaluation - Students*, *- Colleagues*,
*- Head of Department*.

**Proves it worked:** `npm run bootstrap` again — it reports everything already present and
changes nothing. It is idempotent by design.

> Never run `npx prisma db seed` here. It calls `clearAll()` and wipes the database before
> inserting 335 fake accounts.

---

## Act 1 — As the **administrator**: build the org chart

Sign in at `/login` with the bootstrap credentials. You land in **Manage** mode with
"Entire university" scope.

### 1a. Give the root a head — `Manage → Org structure`

The map shows one node: `ASTU · Academic VP`, marked *unassigned*. Select it, choose
**Assign a head**, enter **Personnel 1 (Academic VP)**, and send the invitation.

### 1b. Create three more nodes

Use **+ New node** three times. Names are **load-bearing** — course-code prefixes resolve
course ownership by department name, so type them exactly:

| Name | Level | Type | Parent | Head |
| --- | --- | --- | --- | --- |
| `College of Electrical Eng. & Computing` | 1 | COLLEGE | ASTU · Academic VP | Personnel 2 |
| `Computer Science & Engineering` | 2 | DEPARTMENT | College of Electrical Eng. & Computing | Personnel 3 |
| `Software Engineering` | 2 | DEPARTMENT | College of Electrical Eng. & Computing | Personnel 4 |

**Proves it worked:** the toolbar reads `4 assigned · 0 vacant · 4 nodes`, and the map draws
a VP → College → two departments tree.

### 1c. Create the semester — `Manage → Semesters`

Add the academic year and term (e.g. `2026/27`, `FALL`) with an opening and closing date.
Every campaign belongs to a semester, so nothing downstream works without this.

> **Worth demoing here:** the org map is the only screen showing multi-parent structure. If
> you later add a cross-cutting directorate as a second parent of CSE, the edge draws in the
> accent colour and Analyse still counts CSE exactly once.

---

## Act 2 — As **each invited person**: register

Open each invitation email and follow the link, in this order: **VP → College manager → CSE
head → SWE head**. Each sets their own password.

**Proves it worked:** sign in as each and check the sidebar scope —

- **CSE / SWE heads** see People, Groups, CSV import, Offerings, Templates, Campaigns, Letters.
- **College manager and VP** see Analyse for everything below them, but **no** roster editor —
  department-scoped screens require your own node to be a DEPARTMENT.

Tokens are one-use and stored only as SHA-256 hashes. Lost a link? Use **Resend invitation**;
the old one stops working by design — the system cannot re-send the same link.

---

## Act 3 — As the **CSE department head**: import the roster

`Manage → CSV import`. Four tabs, and **the order matters** — each depends on the last.

| Order | Tab | File | Notes |
| --- | --- | --- | --- |
| 1 | `1 · Staff` | `staff.csv` | teachers; nobody is emailed yet |
| 2 | `2 · Students & sections` | `students.csv` | creates sections from class_year + section |
| 3 | `3 · Course offerings` | `offerings.csv` | **pick the semester** |
| 4 | `4 · Enrolments` | `enrollments.csv` | **same semester** |

For each: upload → **dry run** → read the creates/updates/errors → commit **only at zero
errors**.

Files come from `prisma/real-data-private/<semester>/cse/`, generated by
`npm run registry:convert`. That folder is gitignored — real names and addresses never enter
the repository.

**Proves it worked:** `Manage → Course offerings` lists courses with instructor, section and
enrolment totals. Now re-run all four imports unchanged: every row reports as an update, none
as a create. The import is idempotent.

## Act 4 — As the **SWE department head**: same four imports

Identical sequence with `prisma/real-data-private/<semester>/swe/`.

**Proves it worked:** the SWE head sees only SWE people and offerings, and the CSE head sees
only CSE. Department scoping is enforced server-side in every action, not just hidden in the
nav.

---

## Act 5 — As the **CSE head**: one combined campaign

`Manage → New campaign`. One campaign carries **all three** respondent groups — do not create
three separate ones.

| Field | Value |
| --- | --- |
| Campaign name | `Fall 2026/27 Teaching Feedback — CSE` |
| Type | Email |
| Audience | Registered only |
| Semester | the one you imported against |
| Opens / Closes | today / a date inside the semester |
| Min-N | `5` |
| Student template | ASTU Staff Evaluation - Students |
| Peer template | ASTU Staff Evaluation - Colleagues |
| Manager template | ASTU Staff Evaluation - Head of Department |

> **Fast demo:** set **Min-N to 2**. The privacy gate then needs 1 suppressed + 1 opening
> response per group instead of 4 + 1 — four form fills instead of ten. The behaviour you're
> demonstrating is identical; only the threshold changes. Put it back to 5 for real use.

Then, under **Audience — teacher by teacher**:

1. Add the anchor teacher.
2. Select one offering showing **5+ enrolled students**.
3. Select 5 peer teachers individually.
4. Tick **Include department head**.
5. **Save draft** → reload the page → confirm everything persisted.
6. **Launch.**

**Proves it worked:** the Monitor tab shows the campaign ID, tasks created, and per-group
counts. Every enrolled student in the chosen offering got a task.

> **The one thing to say out loud:** students are chosen *through offerings* — pick a course,
> everyone enrolled in it is invited. Peers are picked individually. That's why you never
> hand-select students.

> **Scale caution:** invitations send sequentially over SMTP, so a launch is bounded by
> `recipients × per-send latency`. On Vercel Pro budget roughly 300–900 recipients per
> launch; split a bigger department across several campaigns.

---

## Act 6 — As **students and peers**: submit, and watch the gate hold

Deliberately stop one short of the threshold.

1. Submit **4 student** forms (Min-N 5), or **1** (Min-N 2). Use the emailed
   `/respond/<token>` link for one of them and `Respond → Pending forms` for another —
   both paths are supported and worth showing.
2. Submit **4 peer** forms (or 1).

**Proves it worked:** as the CSE head, open `Analyse → Teacher results`. Student and Peer
are **suppressed** — below Min-N. No score, no comments, no way to infer an individual.

---

## Act 7 — As the **CSE head**: the Head form, and the exemption

`Respond → Pending forms` → complete the *Head of Department* form.

**Proves it worked:** Head feedback is visible immediately after **one** response, while
Student and Peer stay suppressed. That is intentional — Head feedback is identified and has
exactly one respondent by construction, so it can never reach a threshold of five. Pinning
it to 1 is what stops it being suppressed forever in a combined campaign.

---

## Act 8 — Back as **students and peers**: open the gate

Submit the **5th student** form (or 2nd at Min-N 2).

**Proves it worked:** the student composite and the per-course breakdown appear at once.

Then the **5th peer** form — peer results appear the same way.

This is the moment worth pausing on: nothing was hidden by permissions. The data existed the
whole time; the minimum-response gate refused to show it until enough people had answered
that no individual could be identified.

---

## Act 9 — As the **College manager**: the branch rolls up

`Analyse → Scope overview`.

**Proves it worked:** both CSE and SWE appear as scored rows, plus the College's own
composite averaged across them. No roster editor anywhere — this account manages a COLLEGE,
not a DEPARTMENT.

## Act 10 — As the **Academic VP**: the whole university

`Analyse → Scope overview`, then `Analyse → Across campaigns`.

**Proves it worked:** the scope composite covers every department below, and **each
department is counted exactly once**. The hierarchy is a DAG, not a tree — if CSE is
reachable through both its College and a cross-cutting directorate, the rollup dedupes by
node ID rather than summing pre-aggregated child numbers. Add a second parent to CSE in
`Manage → Org structure` and watch the composite stay put; that's the demo.

Note that Offices never get a scored row of their own — an oversight function layered across
departments that already belong to a College isn't a real branch average.

---

## Act 11 — Close the round, then as the **teacher**

As the CSE head, **close** the campaign from `Manage → All campaigns`.

Then sign in as the anchor teacher → `Me → My feedback`.

**Proves it worked:** the teacher can now see their own results — and could not before
closure. Show the composite against their self-rating if they submitted one.

Finally, as the CSE head, `Manage → Evaluation letters` → generate **Word** and **PDF**.

- The **Word** file is the authoritative content check for this release.
- The **PDF** should download and open. Two known gaps, both next-pass: automated PDF text
  verification is deferred, and the Amharic university name is omitted unless
  `ETHIOPIC_FONT_PATH` points at a bundled Ethiopic font (see `VERCEL_DEPLOYMENT.md` §7).

---

## If something looks wrong

| Symptom | Cause |
| --- | --- |
| Org map blank but the toolbar counts nodes | Fixed — undefined `--spacing-330` made the inspector 1320px wide and collapsed the canvas. Make sure you're on a build after that fix. |
| `The column ... does not exist` | Migrations weren't applied. `DATABASE_URL="<unpooled>" npx prisma migrate deploy`. |
| Invitations never arrive | Check `E2E_TEST_MODE` and `E2E_MAIL_OUTBOX` are **unset** in production. Together they divert all mail to a local file with no delivery error. |
| Email links point at `localhost:4300` | The origin is derived from the request host; this means you opened the app on localhost. |
| Campaign launch stops partway | Function timeout mid-send. Fewer recipients per campaign. |
| A department head sees no import screen | Their node isn't a DEPARTMENT. Offices and Colleges have no roster of their own. |
