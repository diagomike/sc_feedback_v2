# The Hard Problems

These are the design problems worth solving deliberately. Each is a real constraint
discovered while building the system, not a hypothetical.

---

## 1. The Likert grid on a phone ⭐ highest impact

**The problem.** A section renders as a matrix: items down the left, five scale points
across the top. On desktop it's ideal — you see every question against a consistent
scale and can answer eight items in seconds.

On a 375px phone it collapses. Five columns of radio buttons plus item text does not
fit. Horizontal scrolling within a form is miserable, and the column headers scroll out
of view exactly when you need them.

**Why it matters more than anything else here.** Students are the highest-volume users
by an order of magnitude, they're overwhelmingly on phones, and response rate directly
determines whether results clear the min-N gate and exist at all. A form that's painful
on mobile doesn't just annoy — it silently destroys the dataset.

**Constraints:** sections share one scale across their items (that's what makes it a
grid); different sections may use different scales; item text can be a full sentence.

**Directions worth exploring:** stacked cards one item at a time with a persistent
scale; sticky column headers; a condensed scale (numbers + a legend); a segmented
control per row; progressive one-question-at-a-time flow. Each trades off speed-of-
completion against comprehension-of-scale — worth being explicit about which you're
optimising.

---

## 2. Making anonymity *feel* true

**The problem.** The system genuinely protects respondents: identities are stored only
for de-duplication, never exposed; results are suppressed below a threshold; comments
carry no author. But **a user's honesty depends on what they believe, not on what the
database does.**

A student who suspects their name is attached writes "Good class" and leaves. The entire
value of the system depends on this being convincingly communicated in the ~5 seconds
before someone starts typing.

**The nuance:** don't over-promise. Manager→teacher feedback is *inherently*
identifiable — there's only one direct manager. Claiming blanket anonymity there is a
lie the user will detect, which poisons trust in the honest claims elsewhere. The UI
needs at least two distinct, accurate trust messages depending on target group.

**Also:** free text is the real leak. Writing style, specific incidents, and grammar
identify people regardless of what the schema stores. Is there a design intervention —
a warning, a nudge toward general phrasing — that helps without discouraging comments?

---

## 3. The suppressed state that doesn't look broken

**The problem.** Below the min-N threshold, a dashboard has literally nothing to show:
no score, no breakdown, no comments. Handled naively this is a blank screen or an error,
and the manager assumes the system is broken.

It's also a *teaching moment* — the emptiness is the privacy guarantee working as
intended, and if that lands well it builds confidence in the whole system.

**A useful affordance:** the API still returns section titles and weights when
suppressed, because those describe the template rather than any respondent. So the
suppressed state can show the **shape** of the forthcoming result — the competencies
that will appear, greyed — plus progress toward the threshold ("3 of 5 responses").
That turns a dead end into anticipation.

---

## 4. Visualising a multi-parent hierarchy ⭐ hardest structural problem

**The problem.** The org chart is a **layered DAG, not a tree**. A department can have
two parents: its dean, and a Quality Assurance director who cuts across faculties.

Every familiar org-chart pattern — indented lists, nested trees, standard flowcharts —
assumes one parent. They cannot express this without either duplicating nodes (which
implies two departments exist) or drawing crossing edges (which becomes spaghetti at
scale).

**Compounding it:** the person building this is non-technical and does it once a year,
so they arrive with no memory of how it works. Legibility beats power.

**Constraints:** levels are explicit (admin = 0, descending); edges connect adjacent
levels only; ~50–200 nodes; needs create/rename/assign-person/draw-edge.

**Worth considering:** is the *editing* view and the *understanding* view the same
view? Editing a graph and comprehending a graph have genuinely different requirements,
and forcing one component to do both may be the wrong call.

---

## 5. The campaign builder's hidden matrix

**The problem.** Creating a campaign means specifying, for every **(teacher × target
group)** pair, *which* audience answers. Five teachers × three target groups is fifteen
audience assignments.

The system deliberately supports this precision so students are only asked about
lecturers who actually taught them — asking a student about a stranger produces junk
data and survey fatigue.

But the common case is simple: "this one student group evaluates all five teachers."

**The design problem:** make the simple case one click, while keeping per-teacher
precision discoverable and easy for the case that needs it. Hide the matrix and people
can't do the precise thing; show it and the simple case becomes fifteen tedious steps.

---

## 6. What does 54.8 mean?

**The problem.** Scores are 0–100 floats. The dashboard currently shows `54.8` with no
interpretive context whatsoever. Is that good? Bad? Typical?

Without an anchor, users invent one — usually reading it as a percentage exam score,
where 54.8 is a near-failure. That may be wildly wrong relative to the actual
distribution across the university.

**Available anchors:** department average, faculty average, this teacher's own history,
the distribution across all teachers in scope. None are currently displayed.

**A related trap:** the mean hides the distribution. An average of 3.0 from a room of
uniform neutrals and an average of 3.0 from a bitterly split cohort of 1s and 5s are
completely different realities requiring completely different responses. The current
design shows only the mean.

---

## 7. The composite-vs-self-rated gap

**The problem.** Two numbers are computed independently: the **composite** (weighted
across competencies) and the **self-rated overall** (respondents' own holistic
judgement, deliberately excluded from the composite).

Real data from the system: composite **54.8**, self-rated **32.1**. That's a large
divergence — respondents rated the lecturer far worse holistically than the sum of their
specific answers suggests. Something is being captured by the gut judgement that the
competency questions miss entirely.

**That gap is arguably the most interesting number on the screen** — and right now it's
rendered as two unrelated figures a user must notice and mentally subtract. Surfacing
it as a signal is a genuine design opportunity.

---

## 8. One person, several hats

**The problem.** A department head is typically *also* a teacher. So the same login
needs to: run campaigns, view their department's results, fill in peer-feedback forms
about colleagues, give manager-feedback on their own staff, **and** view feedback about
themselves.

`roles` comes back from the API as an array (`["MANAGER", "TEACHER"]`) precisely because
this stacking is the norm, not an edge case.

**The question:** does navigation present one unified surface, or explicit mode
switching? Unified risks a cluttered menu mixing "manage my department" with "rate my
colleague". Mode-switching risks users not realising a whole section exists.

There's a sharper edge case: the same person seeing *their own* feedback and *their
staff's* feedback in the same session. Those should probably not look identical.

---

## 9. Tone when someone reads about themselves

**The problem.** The teacher self-view shows the same data as the manager view. But a
manager reading "Ethics: 44.6" about someone else and a lecturer reading it about
themselves are having completely different experiences.

Presented as a ranking, it's a verdict. Presented as a development tool, it's
actionable. The numbers are identical; the framing determines whether the person
improves or disengages.

Anonymous comments make this sharper — people write things anonymously they'd never say
directly, and the recipient has no right of reply and no idea who said it.

**Worth deciding deliberately:** what's the emotional register of the screen where
someone learns their students rated them poorly?
