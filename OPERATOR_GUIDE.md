# ASTU Feedback — CSV-Only Deployment and Operator Guide

This is the release runbook for bringing up a clean system, registering the management
chain, importing CSE and SWE registry data, running one combined campaign per department,
and proving that analysis reaches the department, College, and Academic VP.

The first release deliberately has no manual offering/enrolment editor and no
carry-forward-from-last-semester tool. Those are the next pass. PDF download is checked;
full PDF text and physical-print verification are also deferred. Word-letter content is
the authoritative content check in this release.

## 1. Before you start

> Deploying to Vercel? Do [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) §1–§5 first —
> it ends exactly where §4 of this guide begins. Everything below assumes the app is
> already reachable and bootstrapped.

You need:

- PostgreSQL and the deployed application;
- working production SMTP credentials;
- `WEB_ORIGIN` set to the public application URL (a fallback — email links are normally
  derived from the request host automatically);
- four reviewed CSVs for each department;
- the following real personnel details.

| Personnel | Name | Email | Completed registration |
| --- | --- | --- | --- |
| 1 — Academic VP |  |  | ☐ |
| 2 — College manager |  |  | ☐ |
| 3 — CSE department head |  |  | ☐ |
| 4 — SWE department head |  |  | ☐ |

Production must **not** define `E2E_TEST_MODE` or `E2E_MAIL_OUTBOX`. Either variable is
harmless alone, but together they intentionally divert mail to a test file instead of SMTP.

## 2. Database setup, reset, and demo seed

These are different operations. Pick exactly one.

### Fresh production database

Set `DATABASE_URL` and the three bootstrap variables, then run:

```bash
npx prisma migrate deploy
npm run bootstrap
```

Required bootstrap variables:

```text
BOOTSTRAP_ADMIN_NAME=<initial administrator name>
BOOTSTRAP_ADMIN_EMAIL=<initial administrator email>
BOOTSTRAP_ADMIN_PASSWORD=<at least 8 characters>
```

`npm run bootstrap` is non-destructive and safe to run again. It never changes an
existing administrator password. It creates the initial administrator, an unoccupied
`ASTU · Academic VP` root, the official scale, and the three official default templates.

### Clean test or staging database

Back up anything you need first. This command destroys every row in the selected database:

```bash
npx prisma migrate reset --force --skip-seed
npm run bootstrap
```

### Full demo dataset

Use this only when you want the synthetic 335-user demonstration system:

```bash
npx prisma migrate reset --force
```

The configured Prisma seed deletes all existing data before writing the demo. Never run it
against a production database containing real data.

On Windows, stop the running Next.js server before a migration or reset; it can hold the
Prisma query-engine DLL open. Every reset/reseed also invalidates all browser sessions.

## 3. Produce and review the private CSVs

On the private workstation that holds `D:\py_yaddessa\real_data`:

```bash
npm run registry:convert -- D:\py_yaddessa\real_data all
```

The ignored output is under:

```text
prisma/real-data-private/<first_sem|second_sem>/<cse|swe>/
```

Each department directory contains `staff.csv`, `students.csv`, `offerings.csv`, and
`enrollments.csv`. Do not commit, email, or upload the directory as a test artifact.

The source export does not contain staff email addresses. The converter proposes them from
instructor names. Before upload:

1. Open `staff.csv` and verify every instructor email.
2. If an email changes, make the identical replacement in every matching row of
   `offerings.csv`.
3. Confirm the selected semester directory is the semester you will create in the system.
4. Keep the files on an encrypted/private operator machine.

Expected counts from the current source export are:

| Semester | Department | Staff | Students | Sections | Offerings | Enrolments |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| first_sem | CSE | 40 | 552 | 18 | 89 | 2,361 |
| first_sem | SWE | 45 | 563 | 18 | 115 | 2,525 |
| second_sem | CSE | 42 | 552 | 18 | 127 | 3,129 |
| second_sem | SWE | 46 | 563 | 18 | 138 | 3,520 |

If a later registry export changes, use the converter's printed counts rather than these
historical numbers and explain the difference in the run report.

## 4. Admin setup — create and invite personnel in this order

1. Sign in with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
2. Open **Manage → Structure**.
3. Select the existing **ASTU · Academic VP** root.
4. Choose **Assign a head** and enter Personnel 1, the Academic VP. Send the invitation.
5. Create **College of Electrical Eng. & Computing** with:
   - level: `1`;
   - type: `COLLEGE`;
   - parent: `ASTU · Academic VP`;
   - head: Personnel 2, the College manager.
6. Create **Computer Science & Engineering** with:
   - level: `2`;
   - type: `DEPARTMENT`;
   - parent: `College of Electrical Eng. & Computing`;
   - head: Personnel 3, the CSE department head.
7. Create **Software Engineering** with:
   - level: `2`;
   - type: `DEPARTMENT`;
   - parent: `College of Electrical Eng. & Computing`;
   - head: Personnel 4, the SWE department head.
8. Open **Manage → Semesters** and create the target academic year, term, opening date,
   and closing date. Leave it active.
9. Open each email invitation in this order: Academic VP, College manager, CSE head, SWE
   head. Set a password and complete registration.
10. Sign in once as each person and verify the displayed scope. A department head must see
    People, Groups, CSV import, Offerings, Templates, Campaigns, and Letters. College and VP
    managers must see analysis for their downstream scope but no department roster editor.

Invitation tokens are one-use and stored only as hashes. If mail was lost or a link expired,
use **Resend invitation**; the old link intentionally stops working.

The exact department names above are load-bearing: course-code prefixes use them to resolve
course ownership.

## 5. CSE import, then SWE import

Perform the complete sequence as the CSE head, sign out, then repeat it as the SWE head.

1. Open **Manage → CSV import**.
2. Select **1 · Staff**, choose `staff.csv`, and select **Dry run**.
3. Confirm `error = 0`. Review create/update counts and every proposed email, then commit.
4. Select **2 · Students & sections**, choose `students.csv`, dry-run, confirm zero errors,
   and commit.
5. Select **3 · Course offerings**, choose `offerings.csv`, select the target semester,
   dry-run, confirm zero errors, and commit.
6. Select **4 · Enrolments**, choose `enrollments.csv`, select the same semester, dry-run,
   confirm zero errors, and commit.
7. Open **Manage → Offerings**, select the semester, and verify course, teacher, section,
   and enrolled-student totals.
8. Repeat all four imports. The second pass must create no users, sections, offerings, or
   enrolments. Expected updates/skips are acceptable; duplicates are not.
9. Enter every preview, commit, and second-pass count in `CSV_RUN_REPORT_TEMPLATE.md`.

Imports are department-scoped. A CSE head must not be able to view or alter the SWE roster,
and vice versa.

## 6. Create one combined campaign per department

As the CSE head, create this campaign and then repeat as the SWE head.

| Field | CSE value | SWE value |
| --- | --- | --- |
| Name | `<Semester> Teaching Feedback — CSE` | `<Semester> Teaching Feedback — SWE` |
| Type | Email | Email |
| Audience | Registered only | Registered only |
| Semester | Imported semester | Imported semester |
| Opens | Today | Today |
| Closes | Future date inside semester | Future date inside semester |
| Min-N | 5 | 5 |
| Minimum teachers | 1 | 1 |
| Minimum students | 5 | 5 |
| Student template | ASTU Staff Evaluation - Students | same |
| Peer template | ASTU Staff Evaluation - Colleagues | same |
| Manager template | ASTU Staff Evaluation - Head of Department | same |

Then configure one anchor teacher:

1. Under **Audience — teacher by teacher**, add the anchor teacher.
2. Select one course offering that displays at least five enrolled students.
3. Select five peer respondents individually.
4. Check **Include department head**.
5. Select **Save draft**.
6. Reload the page and confirm the three templates, dates, Min-N, teacher, offering, five
   peers, and head checkbox persisted.
7. Select **Launch**.
8. On Monitor, record the campaign ID, number asked, and the Student/Peer/Head counts for
   the anchor teacher.

Students are selected through offerings, not one-by-one. Every enrolled student in a chosen
offering receives a task. Peers are selected individually.

## 7. Submit feedback and verify the privacy gate

For CSE, then SWE:

1. Complete four Student forms for the anchor teacher.
2. As the department head, open the campaign monitor and analysis. Student results must be
   below Min-N/suppressed.
3. Complete four Peer forms. Peer results must also remain suppressed.
4. Sign in as the department head, open **Respond → Tasks**, and complete the Head form.
   Head feedback is identified and therefore visible after this one response.
5. Complete the fifth Student form. Student composite and the selected course breakdown
   must now appear.
6. Complete the fifth Peer form. Peer results must now appear.
7. Record response counts, suppression state, and displayed composites.

One respondent should use the emailed `/respond/<token>` link and another should register
and submit through **Respond → Tasks**, proving both supported paths.

## 8. Verify the hierarchy cascade and close the round

1. As each department head, verify the anchor teacher's Student, Peer, and Head results.
2. Sign in as the College manager. Open **Analyse → Scope overview**, choose the semester,
   and verify CSE and SWE contribute to the College rollup.
3. Sign in as the Academic VP. Verify both department rows, the College row, and the scope
   composite. Each department must contribute once even if it has multiple hierarchy paths.
4. Return as each department head and close that department's campaign.
5. Register/sign in as the anchor teacher and open **Me → My feedback**. The teacher's own
   result must now be visible; self-view is intentionally unavailable before closure.
6. As the department head, open **Manage → Letters**, choose the same combined campaign in
   the Student, Peer, and Head selectors, enter the round label, and preview.
7. Download Word and PDF. Verify the Word file contains the teacher, department, round, and
   expected scores. Confirm the PDF is non-empty and opens. Record PDF text/print fidelity as
   deferred for the next pass.

## 9. Finish the report

Copy `CSV_RUN_REPORT_TEMPLATE.md`, name it for the date/environment, and complete every
section. Do not commit a report containing real names, email addresses, invitation links,
tokens, database credentials, or original CSV rows.

