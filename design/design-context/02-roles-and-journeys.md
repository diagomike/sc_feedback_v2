# Roles & User Journeys

Five distinct user types. Note that **roles stack** — a department head is very often
also a teacher, so they need to fill in peer feedback forms *and* see their own results
*and* run campaigns. Navigation must accommodate one person wearing several hats rather
than assuming one role per login.

---

## 1. System Admin (level 0)

**Who:** One or two IT/registry staff. Technical enough, but does this rarely — maybe
once a year plus occasional changes. **Will forget how it works between sessions.**

**Their whole job:** set up the university's management hierarchy once, then get out.

**Journey:**
1. Sign in
2. Build the org chart — create nodes, assign levels, draw who-can-see-what edges
3. Bulk-upload managerial personnel via CSV (name + email), or add them one by one
4. Assign each person to a node
5. Fire off registration invitation emails
6. Watch who has and hasn't registered; resend as needed

**Design implication:** this is a low-frequency, high-stakes, structurally complex task.
It needs to be *legible* far more than it needs to be fast. Assume the user has never
seen the screen before.

---

## 2. Senior Manager (dean, vice-chancellor, QA director — levels 1..n-1)

**Who:** Academic leadership. Not technical. Cares about trends and outliers, not raw
data. Often viewing on a laptop in a meeting.

**Journey:**
1. Sign in → immediately see the state of teaching quality across their whole scope
2. Notice something — a weak department, a declining competency, an outlier lecturer
3. Drill down: faculty → department → individual teacher → individual competency
4. Compare: this department vs. that one, this semester vs. last
5. Create or adapt questionnaire templates that departments beneath them will use

**Design implication:** the landing screen must answer "is anything wrong, and where?"
in about five seconds. Everything else is drill-down from that.

A **Quality Assurance director** is the interesting case: they sit at level 1 but have
edges into departments across *several* faculties. Their scope is a set of branches, not
a subtree — the UI shouldn't assume a neat nested tree when showing "your scope".

---

## 3. Leaf Manager / Department Head (deepest level)

**Who:** The system's workhorse. Runs everything operationally. Also usually teaches.

**Journey:**
1. Register their department's teachers and students (CSV upload, then invitations)
2. Organise students into groups (e.g. "CS Year 3 Section A")
3. Build or clone a questionnaire template — or use one their dean published
4. Create a campaign: pick teachers, pick which students evaluate which teacher, pick
   templates per target group, set the window
5. Launch → system emails private links to every respondent
6. Monitor response rates; nudge non-respondents
7. Read results for their department
8. Separately: give their *own* manager-feedback on each of their teachers

**Design implication:** this role has the most screens and the most complex single
screen (the campaign builder). It's also the role most likely to be doing this under
time pressure at the end of a semester.

---

## 4. Respondent (student, or teacher giving peer feedback)

**Who:** Students especially — likely on a **phone**, likely on a slow connection,
likely with about 90 seconds of patience.

**Journey:**
1. Receive an email with a private link (or open a public link for instant campaigns)
2. Land directly on the form — **no login for guest instant campaigns**
3. Fill in a grid of ratings + optional comments
4. Submit → done, never think about it again

They may have several forms pending (one per teacher). A logged-in student should be
able to see all of them in one place rather than hunting through their inbox.

**Design implication:** this is the highest-volume screen in the entire system by a
wide margin. Hundreds of students × several teachers each. Every second of friction and
every point of anonymity doubt costs response rate and honesty. **Mobile is the primary
target here, not an afterthought.**

---

## 5. Teacher (viewing their own feedback)

**Who:** The person being evaluated. Emotionally invested. This is potentially the most
sensitive screen in the product.

**Journey:**
1. Sign in after a campaign closes
2. See their own aggregated scores and competency breakdown
3. Read anonymised comments
4. Ideally: compare against their own history, and understand what to work on

**Design implication:** tone matters enormously here. The same numbers presented as a
ranking versus as a development tool produce completely different reactions. Harsh
comments land differently when someone is reading about themselves. This screen should
feel constructive, not like a performance review verdict — while still being honest.
