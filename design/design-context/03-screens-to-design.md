# Screens to Design

Status key: **[BUILT]** exists as plain functional React (treat as a wireframe to
replace) · **[NEW]** needs design from scratch.

Priority reflects build order — P1 screens are next up for implementation, so they're
the most useful to design first.

---

## Cross-cutting: application shell **[NEW]** · P1

Everything below lives inside a shell that doesn't exist yet.

- Navigation that adapts to **stacked roles** — one person may be manager + teacher +
  peer respondent simultaneously. Avoid a design that assumes a single role per user.
- A way to express "where am I in the hierarchy" for managerial users.
- Global states to design once and reuse: loading, empty, error, permission-denied,
  and the min-N suppressed state.
- Sign-out, account/profile.

**Open question worth a designed answer:** does a department head who is also a teacher
switch "modes", or does one unified navigation show everything? The stacked-role reality
makes this a genuine fork.

---

# P1 — Milestone 2: Onboarding & hierarchy

## 1. Hierarchy builder **[NEW]** · P1 · ⭐ the signature screen

The system admin lays out the entire university management structure here.

**Requirements:**
- Nodes arranged **by level** — level 0 at the top, descending. Level is an explicit
  property, not just visual depth.
- Draw **edges** from a node to nodes one level below, granting visibility.
- **A node can have multiple parents.** CS Department may be reachable from both
  "Faculty of Engineering" and "Quality Assurance". This is the defining constraint —
  a plain tree layout cannot express it.
- Create/rename nodes; assign a person (name + email) to each.
- Show registration state per node: unassigned / invited / registered.
- Bulk-import personnel from CSV.
- Must stay legible at ~50–200 nodes.

**Why it's hard:** it's a layered DAG editor for a non-technical user who touches it
once a year. Getting multi-parent edges to read clearly without becoming spaghetti is
the core design problem. See `06-ux-challenges.md`.

## 2. CSV import with validation preview **[NEW]** · P1

Used twice: admin importing managers, leaf manager importing students/teachers.

**Requirements:**
- Upload → **dry-run preview before anything commits**
- Per-row validation errors (bad email, duplicate, missing required field, unknown role)
- Distinguish "will create", "will update", "will be skipped"
- Let the user fix errors without re-uploading the whole file if possible
- Expected columns: `name, email, phone, type(student|teacher)`
- Realistic scale: 200+ rows with a dozen problems scattered through

## 3. Invitation management **[NEW]** · P1

- Who's been invited, who's registered, who's gone stale
- Resend invitation (invalidates the previous link)
- Bulk resend to all non-registered
- Invitation links expire in 14 days — surface that

## 4. Registration completion **[NEW]** · P1

Where an invited person lands from their email link.

- Token-based, **no login required** — the link is the credential
- Confirm name/phone, set a password
- Show what they've been invited *as* (role + department) so it's not a mystery
- Handle: expired link, already-used link, invalid link

## 5. Login **[BUILT]** · P1

Functional but entirely unstyled. Needs the real visual identity — it's the first
impression for every user type.

Also missing and needed: forgot-password / reset flow.

---

# P2 — Milestone 3: Template management

## 6. Template library **[NEW]** · P2

- Tabs: **Draft / Published / Archived** (these are real system states)
- Distinguish own templates from **inherited ones published by a superior**
- Actions: clone, publish, archive, preview
- **Never show an "edit" action on a published template** — cloning is the only path
- Show target group (student / peer / manager) prominently — three parallel families
- Show lineage: "cloned from Student Evaluation 2025"

## 7. Template builder **[NEW]** · P2 · ⭐ complex

Build the grid questionnaire.

**Structure being edited:**
```
Template (title, target group)
└── Section  ("Punctuality")  ← this IS a competency
    ├── type: LIKERT_GRID | FREE_TEXT
    ├── scale: which Likert scale (grid sections only)
    ├── weight: how much this competency counts
    ├── isOverall: flag for the single holistic question
    └── Items[]  ("Arrives on time", "Uses the full period")
        └── weight, required
```

**Requirements:**
- Add/reorder/remove sections and items
- Assign a scale per section; make the resulting grid columns visible while editing
- Set section and item weights — with the **consequence made visible**, since weights
  silently determine every score the university will act on
- Live preview of what respondents will see
- Publish (with a clear "this becomes permanent" moment)

## 8. Likert scale editor **[NEW]** · P2

- Named, reusable scales ("Agreement 5-point", "Quality 5-point")
- Ordered points, each with a label and a numeric value
- Support 3 / 5 / 7 points
- Preview as grid column headers

---

# P3 — Milestone 4: Campaigns

## 9. Campaign list **[NEW]** · P3

- States: Draft / Open / Closed
- At-a-glance response rate per campaign
- Closing date, teacher count

## 10. Campaign builder **[NEW]** · P3 · ⭐ most complex screen

Multi-dimensional. The leaf manager must specify:

1. **Type** — Email campaign (private links to named people) or Instant campaign
   (public link, optionally guests, time + response capped)
2. **Teachers** being evaluated
3. **Target groups** active in this campaign (student / peer / manager)
4. **A template per target group**
5. **Audience per teacher per target group:**
   - students → which student group(s) studied under this teacher
   - peers → which specific colleagues evaluate them
   - manager → the leaf manager themselves
6. **Window** — opens, closes, min-N override, response cap for instant campaigns

**The core difficulty:** step 5 is a matrix — every (teacher × target group) pair needs
an audience. The system supports **explicit pairing so students are only asked about
lecturers who actually taught them**, plus an "apply this group to all teachers"
shortcut for the simple case. The UI must make the shortcut effortless without hiding
that per-teacher precision is available.

## 11. Campaign monitoring **[NEW]** · P3

- Response rate overall, per teacher, per target group
- Progress toward min-N per teacher — *the* number that determines whether results
  will exist at all
- **Send reminder to non-respondents** (manual button; there is no scheduler)
- Close early
- For instant campaigns: the shareable link, remaining response cap, time left

## 12. Student group management **[NEW]** · P3

- Create groups ("CS Year 3 Section A")
- Add/remove students, bulk-assign from import
- Groups are the unit campaigns target

---

# P1 — Respondent-facing (highest volume, design early)

## 13. Feedback form (the grid) **[BUILT]** · P1 · ⭐ highest volume screen

Currently a working HTML table. **Mobile is the primary case and the current version
does not solve it** — a 5-column matrix does not fit a phone.

**Requirements:**
- Render sections as grids sharing column headers
- Free-text sections
- Required-item validation with clear progress ("8 required items remaining")
- **Unmistakable anonymity messaging** — this directly drives honesty
- Submit → confirmation
- Handle: already submitted, campaign closed, invalid link

See `06-ux-challenges.md` for the mobile grid problem — it's the single highest-impact
design decision in this product.

## 14. My feedback tasks **[NEW]** · P1

A logged-in respondent's list of pending forms — currently they can only reach forms
through email links.

- Pending vs. completed
- Which teacher, which campaign, deadline
- Urgency for forms closing soon

## 15. Public guest form **[NEW]** · P2

Instant campaigns, no login at all.

- Reached via public slug
- Same grid form, no account
- States: not yet open, closed, response cap reached, already submitted (cookie-based)
- Must feel legitimate and trustworthy despite requiring no identity — a bare anonymous
  form asking about a named lecturer needs to not look like a phishing page

---

# P3/P4 — Analytics

## 16. Results dashboard **[BUILT]** · P3

Exists in minimal form: composite score, competency bars, comments, min-N suppression.
Needs real information design.

**Currently displays** (all real, working data):
- Response count vs. min-N threshold
- Overall composite score (0–100)
- Respondents' own overall rating, separately
- Per-competency scores with weights
- Anonymised comments

**Needs adding:**
- Response distributions, not just means — a 3.0 average from all-neutrals is a
  completely different situation from an even split of 1s and 5s, and means hide that
- Comparison against department/faculty average
- Trend across campaigns over time
- Per-item detail within a competency
- The composite-vs-self-rated gap surfaced as a signal rather than two adjacent numbers

## 17. Manager overview dashboard **[NEW]** · P3 · ⭐

The senior manager's landing screen — currently nothing exists.

- Aggregate standing across their entire scope
- Ranked or heat-mapped breakdown by descendant branch
- Outliers, both strong and weak
- Competency-level patterns across the whole scope ("Assessment Feedback is weak
  university-wide")
- Drill path: faculty → department → teacher → competency
- Must handle **QA-style non-tree scope** (a set of branches, not a subtree)

## 18. Teacher self-view **[NEW]** · P3

Same data as #16, different framing entirely. See `02-roles-and-journeys.md` §5 —
tone is the design problem here, not layout.

- Only after campaign close and min-N met
- Development-oriented, not verdict-oriented
- Their own history over time
- Comparison to peers **without** turning into a public leaderboard

## 19. Comparison view **[NEW]** · P4

Side-by-side teachers or departments. High risk of becoming a ranking table that
distorts behaviour — worth deliberate thought about what comparison is legitimate.

---

## Suggested design sequence

1. **Application shell + visual identity** — everything else inherits it
2. **Feedback form, mobile-first** — highest volume, highest stakes for data quality
3. **Hierarchy builder** — the hardest structural problem; better solved early
4. **Manager overview dashboard** — the screen that justifies the product's existence
5. **Campaign builder** — the most complex interaction
6. Everything else
