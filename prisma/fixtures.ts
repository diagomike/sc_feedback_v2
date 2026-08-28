/**
 * ASTU fixture data, ported from the v1 app (D:\py_yaddessa\sc_feedback) so the seeded
 * system matches the screens it was designed against. Kept separate from seed.ts so the
 * seeding logic stays readable and the data stays editable.
 *
 * v2 addition: student groups carry a `program` (REGULAR/WEEKEND/EXTENSION) and campaigns
 * belong to a real `Semester` instead of inferring a season from dates — see
 * schema.prisma's Semester comment. SUMMER_GROUPS/SUMMER_TEACHING below exist so the
 * summer-campaign path (Weekend/Extension only) has real fixtures from day one.
 */

export const UNIVERSITY = "Adama Science and Technology University";

/** level 0 → 2. `parents` names the nodes that can see this one; a node with two parents
 *  is the DAG case the whole hierarchy design exists for. `type` is the administrative
 *  category (Office/College/Department) — independent of level, see schema.prisma's
 *  NodeType comment: Quality Assurance is an Office at the same level as the Colleges. */
export interface NodeFixture {
  key: string;
  name: string;
  level: number;
  type: "OFFICE" | "COLLEGE" | "DEPARTMENT";
  parents: string[];
  head?: { name: string; email: string };
  /** Department heads usually teach as well. Marking them makes the stacked-role case
   *  (manager + teacher + peer respondent on one login) real rather than theoretical. */
  headAlsoTeaches?: boolean;
  /** Deliberately reproduced states — the hierarchy screen renders all three. */
  invite?: "registered" | "invited" | "expired";
}

export const NODES: NodeFixture[] = [
  { key: "astu", name: "ASTU · Academic VP", level: 0, type: "OFFICE", parents: [], head: { name: "Prof. Miftah Shifera", email: "miftah.shifera@astu.edu.et" }, invite: "registered" },

  { key: "eec", name: "College of Electrical Eng. & Computing", level: 1, type: "COLLEGE", parents: ["astu"], head: { name: "Dr. Kebede Alemu", email: "kebede.alemu@astu.edu.et" }, invite: "registered" },
  { key: "ans", name: "College of Applied Natural Science", level: 1, type: "COLLEGE", parents: ["astu"], head: { name: "Dr. Almaz Tadesse", email: "almaz.tadesse@astu.edu.et" }, invite: "invited" },
  { key: "mce", name: "College of Mechanical & Civil Eng.", level: 1, type: "COLLEGE", parents: ["astu"], head: { name: "Dr. Getachew Bekele", email: "getachew.bekele@astu.edu.et" }, invite: "registered" },
  { key: "qa", name: "Quality Assurance Directorate", level: 1, type: "OFFICE", parents: ["astu"], head: { name: "Dr. Rahel Mekonnen", email: "rahel.mekonnen@astu.edu.et" }, invite: "registered" },

  // CSE and Applied Physics each have TWO parents — their college and QA.
  { key: "cse", name: "Computer Science & Engineering", level: 2, type: "DEPARTMENT", parents: ["eec", "qa"], head: { name: "Dr. Meron Assefa", email: "meron.assefa@astu.edu.et" }, invite: "registered", headAlsoTeaches: true },
  { key: "epc", name: "Electrical Power & Control Eng.", level: 2, type: "DEPARTMENT", parents: ["eec"], head: { name: "Dr. Solomon Girma", email: "solomon.girma@astu.edu.et" }, invite: "registered" },
  { key: "swe", name: "Software Engineering", level: 2, type: "DEPARTMENT", parents: ["eec"], head: { name: "Mr. Dawit Haile", email: "dawit.haile@astu.edu.et" }, invite: "expired" },
  { key: "aphy", name: "Applied Physics", level: 2, type: "DEPARTMENT", parents: ["ans", "qa"], head: { name: "Dr. Sara Negash", email: "sara.negash@astu.edu.et" }, invite: "registered" },
  { key: "amath", name: "Applied Mathematics", level: 2, type: "DEPARTMENT", parents: ["ans"], head: { name: "Dr. Yohannes Tola", email: "yohannes.tola@astu.edu.et" }, invite: "registered" },
  // No head assigned — the hierarchy screen renders this as a dashed "unassigned" node.
  { key: "mdes", name: "Mechanical Design", level: 2, type: "DEPARTMENT", parents: ["mce"], invite: undefined },
];

export const LEAF_KEYS = ["cse", "epc", "swe", "aphy", "amath", "mdes"];

export interface TeacherFixture {
  name: string;
  email: string;
  courses: string;
  /** Target composite as a fraction — 0.55 generates a composite near 55. Chosen to
   *  reproduce the numbers the design's screens were drawn against. */
  strength: number;
}

export const CSE_TEACHERS: TeacherFixture[] = [
  // The design centres its results screen on Amanuel: composite ~54.8 against a
  // department mean of ~58.9, with a large holistic-vs-computed divergence.
  { name: "Dr. Amanuel Bekele", email: "amanuel.bekele@astu.edu.et", courses: "Data Structures · Algorithms", strength: 0.58 },
  { name: "Dr. Hanna Girma", email: "hanna.girma@astu.edu.et", courses: "Operating Systems", strength: 0.78 },
  { name: "Mr. Yonas Tesfaye", email: "yonas.tesfaye@astu.edu.et", courses: "Web Programming", strength: 0.52 },
  { name: "Dr. Selam Wolde", email: "selam.wolde@astu.edu.et", courses: "Databases · Info Systems", strength: 0.66 },
  { name: "Mr. Bekele Dinku", email: "bekele.dinku@astu.edu.et", courses: "Computer Networks", strength: 0.44 },
  { name: "Dr. Tigist Alemu", email: "tigist.alemu@astu.edu.et", courses: "Machine Learning · AI", strength: 0.84 },
  { name: "Mr. Robel Kassa", email: "robel.kassa@astu.edu.et", courses: "Software Engineering", strength: 0.62 },
];

/** Other departments get fewer teachers — enough for the scope overview to have rows. */
export const OTHER_DEPT_TEACHERS: Record<string, TeacherFixture[]> = {
  epc: [
    { name: "Dr. Alemayehu Worku", email: "alemayehu.worku@astu.edu.et", courses: "Power Systems", strength: 0.71 },
    { name: "Dr. Meseret Tadele", email: "meseret.tadele@astu.edu.et", courses: "Control Engineering", strength: 0.66 },
    { name: "Mr. Henok Desta", email: "henok.desta@astu.edu.et", courses: "Electrical Machines", strength: 0.61 },
  ],
  swe: [
    { name: "Dr. Kalkidan Fikru", email: "kalkidan.fikru@astu.edu.et", courses: "Software Architecture", strength: 0.74 },
    { name: "Mr. Nahom Tesfa", email: "nahom.tesfa@astu.edu.et", courses: "Requirements Engineering", strength: 0.63 },
  ],
  aphy: [
    { name: "Dr. Birhanu Kassahun", email: "birhanu.kassahun@astu.edu.et", courses: "Quantum Mechanics", strength: 0.52 },
    { name: "Dr. Genet Assefa", email: "genet.assefa@astu.edu.et", courses: "Thermodynamics", strength: 0.57 },
  ],
  amath: [
    { name: "Dr. Tewodros Lemma", email: "tewodros.lemma@astu.edu.et", courses: "Linear Algebra", strength: 0.59 },
    { name: "Dr. Frehiwot Bogale", email: "frehiwot.bogale@astu.edu.et", courses: "Real Analysis", strength: 0.55 },
  ],
};

export interface GroupFixture {
  key: string;
  name: string;
  size: number;
  program: "REGULAR" | "WEEKEND" | "EXTENSION";
}

export const CSE_GROUPS: GroupFixture[] = [
  { key: "y3a", name: "CSE Year 3 · Section A", size: 52, program: "REGULAR" },
  { key: "y3b", name: "CSE Year 3 · Section B", size: 48, program: "REGULAR" },
  { key: "y2a", name: "CSE Year 2 · Section A", size: 46, program: "REGULAR" },
  { key: "y4a", name: "CSE Year 4 · Section A", size: 44, program: "REGULAR" },
  { key: "y4b", name: "CSE Year 4 · Section B", size: 39, program: "REGULAR" },
  { key: "msc", name: "CSE Postgraduate · MSc", size: 18, program: "REGULAR" },
  // Weekend/Extension cohorts — same courses and teachers as their Regular counterparts,
  // just a different meeting schedule. They're the ones still in session over the summer
  // (see the Term enum comment in schema.prisma), which is why the seed's Summer campaign
  // below assigns these two rather than a Regular group — not because anything enforces it.
  { key: "wknd3", name: "CSE Year 3 · Weekend", size: 34, program: "WEEKEND" },
  { key: "ext4", name: "CSE Year 4 · Extension", size: 27, program: "EXTENSION" },
];

/** Which student group actually studied under each CSE teacher. Explicit pairing is the
 *  whole point — students are never asked about lecturers who did not teach them. */
export const CSE_TEACHING: Record<string, string[]> = {
  "amanuel.bekele@astu.edu.et": ["y3a"],
  "hanna.girma@astu.edu.et": ["y3a", "y3b"],
  "yonas.tesfaye@astu.edu.et": ["y2a"],
  "selam.wolde@astu.edu.et": ["y3b"],
  "bekele.dinku@astu.edu.et": ["y4a"],
  "tigist.alemu@astu.edu.et": ["y4a", "y4b"],
  "robel.kassa@astu.edu.et": ["y4b"],
};

/** Which teachers taught the summer Weekend/Extension cohorts — a smaller, separate map
 *  since not every CSE teacher runs a summer section. */
export const SUMMER_TEACHING: Record<string, string[]> = {
  "amanuel.bekele@astu.edu.et": ["wknd3"],
  "selam.wolde@astu.edu.et": ["wknd3", "ext4"],
  "robel.kassa@astu.edu.et": ["ext4"],
};

export interface ScaleFixture {
  key: string;
  name: string;
  points: { label: string; short: string; value: number }[];
}

export const SCALES: ScaleFixture[] = [
  {
    key: "agree5",
    name: "Agreement 5-point",
    points: [
      { label: "Strongly disagree", short: "Strongly disagree", value: 1 },
      { label: "Disagree", short: "Disagree", value: 2 },
      { label: "Neutral", short: "Neutral", value: 3 },
      { label: "Agree", short: "Agree", value: 4 },
      { label: "Strongly agree", short: "Strongly agree", value: 5 },
    ],
  },
  {
    key: "quality5",
    name: "Quality 5-point",
    points: [
      { label: "Poor", short: "Poor", value: 1 },
      { label: "Fair", short: "Fair", value: 2 },
      { label: "Good", short: "Good", value: 3 },
      { label: "Very good", short: "Very good", value: 4 },
      { label: "Excellent", short: "Excellent", value: 5 },
    ],
  },
  {
    key: "freq5",
    name: "Frequency 5-point",
    points: [
      { label: "Never", short: "Never", value: 1 },
      { label: "Rarely", short: "Rarely", value: 2 },
      { label: "Sometimes", short: "Sometimes", value: 3 },
      { label: "Often", short: "Often", value: 4 },
      { label: "Always", short: "Always", value: 5 },
    ],
  },
  {
    key: "agree7",
    name: "Agreement 7-point",
    points: [
      { label: "Strongly disagree", short: "Str. disagree", value: 1 },
      { label: "Disagree", short: "Disagree", value: 2 },
      { label: "Slightly disagree", short: "Sl. disagree", value: 3 },
      { label: "Neutral", short: "Neutral", value: 4 },
      { label: "Slightly agree", short: "Sl. agree", value: 5 },
      { label: "Agree", short: "Agree", value: 6 },
      { label: "Strongly agree", short: "Str. agree", value: 7 },
    ],
  },
];

export interface SectionFixture {
  title: string;
  type: "LIKERT_GRID" | "FREE_TEXT";
  scaleKey?: string;
  weight: number;
  isOverall?: boolean;
  items: { text: string; weight: number; required: boolean }[];
}

/**
 * The five scored competencies. The prototype's own results table shows Course Design and
 * its heatmap columns add Assessment Feedback, neither of which appear in its template
 * fixture — so the seeded template carries the full set and both screens render truthfully.
 */
export const STUDENT_SECTIONS: SectionFixture[] = [
  {
    title: "Punctuality",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.0,
    items: [
      { text: "Arrives to class on time", weight: 1.0, required: true },
      { text: "Uses the full scheduled period", weight: 1.0, required: true },
    ],
  },
  {
    title: "Effective Delivery",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 2.0,
    items: [
      { text: "Explains difficult concepts clearly", weight: 1.5, required: true },
      { text: "Uses examples that aid understanding", weight: 1.0, required: true },
      { text: "Encourages questions during class", weight: 1.0, required: false },
    ],
  },
  {
    title: "Ethics",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.5,
    items: [
      { text: "Treats all students with respect", weight: 1.0, required: true },
      { text: "Grades fairly and transparently", weight: 1.0, required: true },
    ],
  },
  {
    title: "Assessment Feedback",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.5,
    items: [
      { text: "Returns marked work within a reasonable time", weight: 1.0, required: true },
      { text: "Explains what was lost marks and why", weight: 1.0, required: true },
    ],
  },
  {
    title: "Course Design",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.0,
    items: [
      { text: "The course materials are well organised", weight: 1.0, required: true },
      { text: "Assessment matches what was taught", weight: 1.0, required: true },
    ],
  },
  {
    title: "Overall",
    type: "LIKERT_GRID",
    scaleKey: "quality5",
    weight: 1.0,
    isOverall: true,
    items: [{ text: "Overall, how would you rate this instructor?", weight: 1.0, required: true }],
  },
  {
    title: "Comments",
    type: "FREE_TEXT",
    weight: 0,
    items: [{ text: "Anything else you would like the department to know?", weight: 0, required: false }],
  },
];

export const PEER_SECTIONS: SectionFixture[] = [
  {
    title: "Subject Mastery",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 2.0,
    items: [
      { text: "Demonstrates current command of the subject", weight: 1.0, required: true },
      { text: "Course content reflects the state of the field", weight: 1.0, required: true },
    ],
  },
  {
    title: "Collegiality",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.0,
    items: [
      { text: "Shares teaching materials and approaches", weight: 1.0, required: true },
      { text: "Contributes constructively to curriculum discussions", weight: 1.0, required: true },
    ],
  },
  {
    title: "Overall",
    type: "LIKERT_GRID",
    scaleKey: "quality5",
    weight: 1.0,
    isOverall: true,
    items: [{ text: "Overall assessment of this colleague's teaching", weight: 1.0, required: true }],
  },
  {
    title: "Comments",
    type: "FREE_TEXT",
    weight: 0,
    items: [{ text: "Observations you would want a colleague to hear", weight: 0, required: false }],
  },
];

export const MANAGER_SECTIONS: SectionFixture[] = [
  {
    title: "Professional Conduct",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 1.5,
    items: [
      { text: "Meets departmental deadlines and obligations", weight: 1.0, required: true },
      { text: "Responds constructively to feedback", weight: 1.0, required: true },
    ],
  },
  {
    title: "Teaching Contribution",
    type: "LIKERT_GRID",
    scaleKey: "agree5",
    weight: 2.0,
    items: [
      { text: "Carries a fair share of the teaching load", weight: 1.0, required: true },
      { text: "Supports curriculum development", weight: 1.0, required: true },
    ],
  },
  {
    title: "Overall",
    type: "LIKERT_GRID",
    scaleKey: "quality5",
    weight: 1.0,
    isOverall: true,
    items: [{ text: "Overall assessment for this review period", weight: 1.0, required: true }],
  },
  {
    title: "Comments",
    type: "FREE_TEXT",
    weight: 0,
    items: [{ text: "Notes for the record", weight: 0, required: false }],
  },
];

export const STUDENT_COMMENTS = [
  "Great teacher, very engaging lectures.",
  "The lectures are good but marks come back weeks late and we never find out what we got wrong.",
  "Sometimes starts fifteen minutes after the hour, which makes the last part rushed.",
  "Knows the subject extremely well. Would be much better with clearer marking criteria published in advance.",
  "Explains hard material better than anyone else I have had. I actually understand pointers now.",
  "Approachable and patient when you ask questions after class.",
  "Slides are dense and hard to follow without the recording.",
  "Assessment felt fair and matched what we covered in class.",
  "Would appreciate more worked examples before the assignment is due.",
  "Always willing to stay behind and go over something again.",
];

export const PEER_COMMENTS = [
  "Well-prepared sessions; the lab material in particular is stronger than most.",
  "Would benefit from aligning assessment criteria with the rest of the year group.",
  "Generous with materials and always willing to cover a session at short notice.",
];

export const MANAGER_COMMENTS = [
  "Reliable on departmental obligations. Assessment turnaround is the one area to address this year.",
  "Strong contribution to curriculum review. Continue to develop the postgraduate offering.",
];

export const FIRST_NAMES = [
  "Abel", "Bethlehem", "Chala", "Dagim", "Eden", "Fikir", "Gemechu", "Hanna", "Israel", "Kalkidan",
  "Liya", "Mekdes", "Nahom", "Oliyad", "Rediet", "Samuel", "Tsion", "Yared", "Zufan", "Bereket",
  "Hiwot", "Kidus", "Lensa", "Mahlet", "Naol", "Rahel", "Sifen", "Tofik", "Wubet", "Yonatan",
  "Amanuel", "Betty", "Dawit", "Elias", "Feven", "Girum", "Helen", "Kena", "Meron", "Nardos",
];

export const LAST_NAMES = [
  "Tesfaye", "Girma", "Regassa", "Wolde", "Mulugeta", "Assefa", "Bayissa", "Desta", "Haile", "Kebede",
  "Lemma", "Mekonnen", "Negash", "Olana", "Petros", "Sisay", "Tadesse", "Urgessa", "Worku", "Zeleke",
];

/** Semesters, oldest first — v2's replacement for v1's bare CampaignFixture.season string.
 *  academicYear is the start year (2024 = "2024/25"). Windows are illustrative teaching
 *  terms; campaigns run inside them, not necessarily spanning the whole window. */
export interface SemesterFixture {
  key: string;
  academicYear: number;
  term: "FALL" | "SPRING" | "SUMMER";
  startsAt: string;
  endsAt: string;
}

export const SEMESTERS: SemesterFixture[] = [
  { key: "f2024", academicYear: 2024, term: "FALL", startsAt: "2024-09-01", endsAt: "2024-12-20" },
  { key: "s2025", academicYear: 2024, term: "SPRING", startsAt: "2025-02-24", endsAt: "2025-06-13" },
  { key: "su2025", academicYear: 2024, term: "SUMMER", startsAt: "2025-06-23", endsAt: "2025-08-29" },
  { key: "f2025", academicYear: 2025, term: "FALL", startsAt: "2025-09-01", endsAt: "2025-12-19" },
  { key: "s2026", academicYear: 2025, term: "SPRING", startsAt: "2026-02-23", endsAt: "2026-06-12" },
  { key: "f2026", academicYear: 2026, term: "FALL", startsAt: "2026-09-01", endsAt: "2026-12-18" },
];

/** Campaign windows, oldest first. The four closed historical rounds are what make the
 *  trend panel and the teacher's own history real rather than a stub. Each now names its
 *  Semester by key instead of a bare season string. */
export interface CampaignFixture {
  key: string;
  name: string;
  code: string;
  semesterKey: string;
  opensAt: string;
  closesAt: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  /** Global quality drift for that round, added to each teacher's strength. */
  drift: number;
}

export const CSE_HISTORY: CampaignFixture[] = [
  { key: "f2024", name: "Fall 2024/25 Student Evaluation — CSE", code: "CMP-2024-F-01", semesterKey: "f2024", opensAt: "2024-09-01", closesAt: "2024-09-21", status: "CLOSED", drift: 0.06 },
  { key: "s2025", name: "Spring 2024/25 Student Evaluation — CSE", code: "CMP-2025-S-01", semesterKey: "s2025", opensAt: "2025-03-04", closesAt: "2025-03-24", status: "CLOSED", drift: 0.03 },
  { key: "f2025", name: "Fall 2025/26 Student Evaluation — CSE", code: "CMP-2025-F-01", semesterKey: "f2025", opensAt: "2025-09-01", closesAt: "2025-09-21", status: "CLOSED", drift: 0.02 },
  { key: "s2026", name: "Spring 2025/26 Student Evaluation — CSE", code: "CMP-2026-S-01", semesterKey: "s2026", opensAt: "2026-03-04", closesAt: "2026-03-24", status: "CLOSED", drift: 0.04 },
];
