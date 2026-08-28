# Data Contracts

Real payload shapes from the working API. Designs should be grounded in this data —
where a design needs a field that isn't here, flag it explicitly as a backend addition.

Full TypeScript definitions: `current-implementation/shared-types/`.

---

## Working endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | — | Sets an httpOnly session cookie |
| `POST` | `/api/auth/logout` | cookie | Ends session |
| `GET` | `/api/auth/me` | cookie | Current user |
| `GET` | `/api/response-tasks/:token` | **token in URL** | Fetch a feedback form |
| `POST` | `/api/response-tasks/:token/submit` | **token in URL** | Submit answers |
| `GET` | `/api/analytics/dashboard` | cookie | Results for one teacher+campaign |

Note the feedback form endpoints take **no session** — the token in the link *is* the
credential. That's what allows guest instant campaigns and email links that work without
signing in.

---

## Session user

```ts
{
  id: string
  name: string            // "Dr. Meron Assefa (CS Dept Head)"
  email: string
  roles: string[]         // ["MANAGER", "TEACHER"] — roles STACK
  hierarchyNodeId: string | null   // null for plain students/teachers
}
```

`roles` being an array is what drives the stacked-role navigation problem.

---

## Feedback form (`GET /api/response-tasks/:token`)

This is the payload the grid form renders from.

```ts
{
  taskId: string
  teacherName: string          // "Dr. Amanuel Bekele"
  campaignName: string         // "Fall 2026 Student Evaluation - CS Dept"
  targetGroup: "STUDENT" | "PEER" | "MANAGER"
  completed: boolean           // already submitted?
  sections: [
    {
      id: string
      title: string            // "Punctuality" — also the competency name
      description: string | null
      type: "LIKERT_GRID" | "FREE_TEXT"
      isOverall: boolean       // the single holistic question
      order: number
      scale: [                 // null for FREE_TEXT sections
        { id: string, label: string, value: number, order: number }
      ] | null
      items: [
        { id: string, text: string, required: boolean, order: number }
      ]
    }
  ]
}
```

**Real example** — the seeded student template, which is representative of production
shape and size:

| Section | Type | Scale | Items |
| --- | --- | --- | --- |
| Punctuality | LIKERT_GRID | Agreement 5pt | 2 |
| Effective Delivery | LIKERT_GRID | Agreement 5pt | 3 |
| Ethics | LIKERT_GRID | Agreement 5pt | 2 |
| Overall (`isOverall`) | LIKERT_GRID | Quality 5pt | 1 |
| Comments | FREE_TEXT | — | 1 (optional) |

Agreement 5pt labels: *Strongly disagree · Disagree · Neutral · Agree · Strongly agree*
Quality 5pt labels: *Poor · Fair · Good · Very good · Excellent*

Note that **different sections can use different scales** in the same form — the design
must not assume one set of column headers per page.

## Submission (`POST /api/response-tasks/:token/submit`)

```ts
{ answers: [ { itemId: string, pointValue?: number | null, text?: string | null } ] }
```

Error responses the UI must handle:

| Status | Meaning | UI needs |
| --- | --- | --- |
| `404` | Invalid/unknown token | "This link is invalid or has expired" |
| `409` | Already submitted | Friendly "you've already responded" state |
| `410` | Campaign closed | "This campaign has closed" |
| `400` | Validation failed | Field-level errors |

---

## Dashboard (`GET /api/analytics/dashboard?campaignId=&teacherId=&targetGroup=`)

```ts
{
  teacherId: string
  teacherName: string
  campaignId: string
  campaignName: string
  responseCount: number
  minResponses: number         // the min-N threshold, default 5
  suppressed: boolean          // true => every score/comment below is empty
  overallScore: number | null  // 0-100 weighted composite
  selfRatedOverall: number | null   // the isOverall section, reported separately
  sections: [
    {
      sectionId: string
      title: string
      isOverall: boolean
      score: number | null     // 0-100, null if unanswered
      weight: number
    }
  ]
  comments: string[]           // anonymised free text
}
```

**Real response** from the working system (7 student responses, one lecturer):

```json
{
  "teacherName": "Dr. Amanuel Bekele",
  "campaignName": "Fall 2026 Student Evaluation - CS Dept",
  "responseCount": 7,
  "minResponses": 5,
  "suppressed": false,
  "overallScore": 54.83,
  "selfRatedOverall": 32.14,
  "sections": [
    { "title": "Punctuality",        "score": 46.43, "weight": 1.0, "isOverall": false },
    { "title": "Effective Delivery", "score": 66.67, "weight": 2.0, "isOverall": false },
    { "title": "Ethics",             "score": 44.64, "weight": 1.5, "isOverall": false },
    { "title": "Overall",            "score": 32.14, "weight": 1.0, "isOverall": true  },
    { "title": "Comments",           "score": null,  "weight": 0,   "isOverall": false }
  ],
  "comments": ["Great teacher, very engaging lectures."]
}
```

**When suppressed** (`responseCount < minResponses`), the same shape returns with
`overallScore: null`, `selfRatedOverall: null`, every section `score: null`, and
`comments: []`. Section titles and weights still come through — they describe the
template, not any respondent, so showing the *structure* of what will appear is safe.
That's a useful design affordance: the suppressed state can show the shape of the
forthcoming result rather than a blank page.

---

## Data realities worth designing around

- **Scores are 0–100 floats**, not 1–5 stars. `54.83` needs sensible rounding and,
  more importantly, **interpretive context** — is 54.8 good? Nothing on screen currently
  answers that.
- **`comments` is a flat string array** with no author, no timestamp, no rating
  correlation. Deliberate: any of those could de-anonymise.
- **Free-text sections score `null`** and must not be rendered as a zero-value bar.
- **`selfRatedOverall` vs `overallScore`** diverging is a signal, not an error.
- **Three parallel dashboards per teacher** — student, peer, and manager feedback are
  separate templates and never blend into one score. The UI needs a way to move between
  them.

---

## Not yet built

These endpoints don't exist; designs that need them are fine, just flag the dependency:

- Hierarchy CRUD and org-chart read
- Template CRUD, cloning, publishing
- Campaign CRUD, monitoring, reminders
- CSV import and validation preview
- Invitation issue/resend
- Personnel and student group management
- Aggregate/rollup analytics across a manager's scope (only per-teacher exists today)
- Historical trend across campaigns
