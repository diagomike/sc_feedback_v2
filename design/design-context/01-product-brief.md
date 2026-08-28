# Product Brief & Domain Vocabulary

## The problem

Universities collect teaching feedback badly: paper forms, ad-hoc spreadsheets, or
nothing. Results arrive too late to act on, can't be compared across departments, and
respondents don't trust that they're anonymous — so they either skip it or write
nothing honest.

This system centralises the whole loop: define what "good teaching" means as reusable
questionnaires, run feedback campaigns against specific teachers, and give every level
of management an evidence-based view of teaching quality across their part of the
university.

## Vocabulary (use these words consistently in the UI)

| Term | Meaning |
| --- | --- |
| **Hierarchy node** | A position in the university org chart (e.g. "Faculty of Engineering", "CS Department"). Occupied by one managerial user. |
| **Level** | Depth in the hierarchy. Admin is level 0, faculties level 1, departments level 2, etc. |
| **Leaf manager** | A node with nothing below it — typically a department head. Only leaf managers register students/teachers and run campaigns. |
| **Template** | A questionnaire. Belongs to one **target group** (student / peer / manager). |
| **Section** | A group of questions inside a template sharing one rating scale. **A section is also a competency** — e.g. "Punctuality", "Effective Delivery", "Ethics". |
| **Item** | A single statement rated within a section, e.g. "Arrives to class on time". |
| **Likert scale** | The reusable set of rating options, e.g. Strongly disagree → Strongly agree (1–5). Attached to a section, not to individual items. |
| **Campaign** | A round of feedback collection: a set of teachers, the templates used, the audiences asked, and a time window. |
| **Target group** | Who is answering: `STUDENT`, `PEER` (fellow teacher), or `MANAGER` (their department head). Each uses a different template. |
| **Response task** | One person's assignment to evaluate one teacher. Carries a private link. |
| **Min-N gate** | Results stay hidden until at least N responses exist (default 5). |

## The rules that constrain the UI

These aren't preferences — they're system invariants. Designs that violate them can't
be built without changing the backend.

1. **Templates are grids, not question lists.** The scale lives on the section, so every
   item in a section shares the same columns. This renders naturally as a matrix.

2. **A published template can never be edited.** To change one you **clone** it into a
   new draft. Template management therefore needs Draft / Published / Archived states and
   a prominent "clone" action — never an "edit" affordance on a published template.

3. **Nothing is ever deleted.** Archiving hides things from future use; historical data
   stays intact. There is no delete button anywhere in this product.

4. **Results are anonymous to viewers.** The system stores who responded (for
   de-duplication and abuse handling) but no screen ever reveals it. The UI must never
   imply a response can be traced to a person.

5. **Min-N suppression is absolute.** Below the threshold, no score, no breakdown, no
   comments — not even partially. The screen must explain *why* without looking broken.

6. **Manager→teacher feedback is inherently identifiable.** A teacher has exactly one
   direct manager, so that feedback can't be anonymous. The UI should say so plainly
   rather than implying a privacy it can't deliver.

7. **Teachers see their own results only after a campaign closes.** Watching live results
   arrive would let them correlate timing with individuals.

8. **The hierarchy is a graph, not a tree.** A department can have multiple parents — its
   dean *and* a cross-cutting Quality Assurance director both see it. Any org-chart
   visualisation must handle a node with two incoming edges.

## Scoring model

Understanding this makes dashboard design much easier:

- Each answer normalises to **0–100** based on its section's scale range.
- A **section score** is the weighted mean of its items → this is the competency score.
- The **overall composite** is the weighted mean of section scores.
- One section can be flagged `isOverall` — a single holistic "rate this instructor"
  question. It is **excluded from the composite** and reported separately, deliberately:
  when the computed composite and the respondent's own gut rating diverge, that gap is
  itself the insight worth surfacing.
- Free-text sections are never scored.

Real example from the working system — 7 student responses about one lecturer:

```
Overall composite:            54.8
Respondents' own overall:     32.1     <- notably lower than the composite
  Punctuality        (w 1.0):  46.4
  Effective Delivery (w 2.0):  66.7
  Ethics             (w 1.5):  44.6
  Comments                  :  (unscored)
```

That 54.8 vs 32.1 gap is exactly the kind of thing the dashboard should make noticeable
rather than bury.
