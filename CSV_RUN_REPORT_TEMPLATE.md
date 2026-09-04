# CSV-Only Release Run Report

Copy this file for each run. Redact personal data, credentials, invitation links, response
tokens, and original CSV content before sharing or committing a completed report.

## Release and environment

| Field | Actual |
| --- | --- |
| Date/time and timezone |  |
| Operator |  |
| Environment | local / staging / production |
| Deployment URL |  |
| Database name (no credentials) |  |
| Git commit |  |
| Release tag |  |
| Browser(s) |  |
| `WEB_ORIGIN` verified | ☐ |
| Production SMTP verified | ☐ |
| E2E mail variables absent | ☐ |
| Backup completed before reset/migration | ☐ / not applicable |

## Bootstrap

| Check | Expected | Actual | Pass |
| --- | --- | --- | --- |
| Migrations | All deployed |  | ☐ |
| Administrator | Active |  | ☐ |
| ASTU root | Level 0, Office, initially unoccupied |  | ☐ |
| Official scales | Present once |  | ☐ |
| Default templates | Student + Peer + Head, published |  | ☐ |
| Bootstrap rerun | No duplicate or password reset |  | ☐ |

## Personnel and hierarchy

Use role labels or redacted identifiers in shared reports.

| Order | Role | Invitation sent | Registration completed | Scope verified | Pass |
| ---: | --- | --- | --- | --- | --- |
| 1 | Academic VP |  |  |  | ☐ |
| 2 | College manager |  |  |  | ☐ |
| 3 | CSE head |  |  |  | ☐ |
| 4 | SWE head |  |  |  | ☐ |

| Node | Level | Type | Parent | Pass |
| --- | ---: | --- | --- | --- |
| ASTU · Academic VP | 0 | OFFICE | — | ☐ |
| College of Electrical Eng. & Computing | 1 | COLLEGE | ASTU root | ☐ |
| Computer Science & Engineering | 2 | DEPARTMENT | College | ☐ |
| Software Engineering | 2 | DEPARTMENT | College | ☐ |

## Semester

| Academic year | Term | Starts | Ends | Active | Pass |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | ☐ |

## CSV imports

### CSE

| File | Source rows | Dry-run create | Dry-run update/skip | Errors | Committed | Re-import create | Re-import update/skip | Pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Staff |  |  |  |  |  |  |  | ☐ |
| Students & sections |  |  |  |  |  |  |  | ☐ |
| Offerings |  |  |  |  |  |  |  | ☐ |
| Enrolments |  |  |  |  |  |  |  | ☐ |

### SWE

| File | Source rows | Dry-run create | Dry-run update/skip | Errors | Committed | Re-import create | Re-import update/skip | Pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Staff |  |  |  |  |  |  |  | ☐ |
| Students & sections |  |  |  |  |  |  |  | ☐ |
| Offerings |  |  |  |  |  |  |  | ☐ |
| Enrolments |  |  |  |  |  |  |  | ☐ |

Instructor email proposals reviewed in both Staff and Offerings files: ☐

## Campaigns

| Department | Campaign ID | Templates | Min-N | Min teachers | Min students | Anchor offering enrolment | Peers | Head included | Tasks | Messages | Pass |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| CSE |  | Student + Peer + Head | 5 | 1 | 5 |  | 5 | ☐ |  |  | ☐ |
| SWE |  | Student + Peer + Head | 5 | 1 | 5 |  | 5 | ☐ |  |  | ☐ |

## Response and privacy progression

| Department | Audience | At 4 responses | At required response | Expected score | Actual score | Pass |
| --- | --- | --- | --- | ---: | ---: | --- |
| CSE | Student | Suppressed | Visible at 5 |  |  | ☐ |
| CSE | Peer | Suppressed | Visible at 5 |  |  | ☐ |
| CSE | Head | Not applicable | Visible at 1 |  |  | ☐ |
| SWE | Student | Suppressed | Visible at 5 |  |  | ☐ |
| SWE | Peer | Suppressed | Visible at 5 |  |  | ☐ |
| SWE | Head | Not applicable | Visible at 1 |  |  | ☐ |

## Analysis cascade

| Viewer | Expected | Actual | Pass |
| --- | --- | --- | --- |
| CSE head | CSE teacher/course results only |  | ☐ |
| SWE head | SWE teacher/course results only |  | ☐ |
| College manager | CSE + SWE and College composite |  | ☐ |
| Academic VP | Both departments and scope composite |  | ☐ |
| DAG deduplication | Each department contributes once |  | ☐ |
| Teacher before closure | Self-view unavailable |  | ☐ |
| Teacher after closure | Self-view available |  | ☐ |

## Letters

| Check | Actual | Pass |
| --- | --- | --- |
| Word downloads |  | ☐ |
| Word contains teacher, department, round, and scores |  | ☐ |
| PDF downloads, is non-empty, and opens |  | ☐ |
| PDF text/render/physical print | Deferred to next pass | — |

## Evidence and defects

| Evidence | Location/reference |
| --- | --- |
| Screenshots |  |
| Automated verification report |  |
| Other logs without personal data |  |

| Defect ID | Summary | Reproduction steps | Severity | Owner | Status |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Final decision

- [ ] All required checks passed.
- [ ] No private data is attached to this report.
- [ ] Known PDF verification limitation was accepted.
- [ ] Release approved for the stated environment.

Decision, approver, and timestamp:

