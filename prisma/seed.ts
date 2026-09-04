/**
 * Portable seed — plain PrismaClient + argon2 + node:crypto only. Ported from the v1 app
 * (apps/api/prisma/seed.ts) with one structural change: campaigns now reference a real
 * `Semester` row instead of a bare season string, and student groups carry a `program`.
 *
 * Builds the ASTU dataset the Claude Design screens were drawn against: a 3-level DAG with
 * two multi-parent departments, six leaf departments, ~350 students (plus two summer
 * Weekend/Extension cohorts), and campaigns across five real semesters (four historical
 * closed rounds plus current OPEN Fall 2026/27, and one SUMMER round against
 * Weekend/Extension groups only).
 *
 * Templates are NOT invented here. The university publishes exactly three staff-evaluation
 * questionnaires - students, colleagues, head of department - and this seed creates those
 * three, owned by the ASTU root node and PUBLISHED, so every department inherits them by
 * the ancestor-visibility rule in template-logic.ts. A department that wants its own
 * variant clones one; it does not get a pre-invented alternative from the seed.
 *
 * Response generation is SEEDED and deterministic — reseeding gives the same numbers, so a
 * dashboard screenshot stays meaningful and a failing assertion is reproducible.
 *
 * NOTE on realism: this script writes Response/Answer rows directly (a demo/dev fixture
 * set), not by exercising the real submission flow — but the scoring and rollup code that
 * reads them (src/server/analytics/scoring.ts, rollup-logic.ts) is the exact same code
 * that computes real numbers from real student/peer/manager submissions in production.
 * Nothing about "the numbers management sees" is faked at the computation layer; only the
 * seed data feeding it is synthetic, same as any dev fixture set.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { computeClosureRows } from "../src/server/hierarchy/closure-algorithm";
import { DEFAULT_WEB_ORIGIN } from "../src/lib/constants";
import * as F from "./fixtures";

const prisma = new PrismaClient();

type LoadedTemplate = Prisma.TemplateGetPayload<{
  include: {
    sections: {
      include: { items: true; scale: { include: { points: true } } };
    };
  };
}>;

// ── deterministic RNG (mulberry32) ───────────────────────────────────────────
let rngState = 0x9e3779b9;
function seedRng(n: number) {
  rngState = n >>> 0;
}
function rnd(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function rawToken(): string {
  return randomBytes(32).toString("hex");
}
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Draws a scale point for a teacher of the given strength. See v1's doc comment
 * (apps/api/prisma/seed.ts) for the full derivation — kept verbatim here.
 */
function drawPoint(strength: number, bias: number, points: number[]): number {
  const target = Math.max(0, Math.min(1, strength + bias));
  const jitter = (rnd() + rnd() + rnd() - 1.5) * 1.9;
  const idx = Math.round(target * (points.length - 1) + jitter);
  return points[Math.max(0, Math.min(points.length - 1, idx))];
}

async function makeUser(params: {
  email: string;
  name: string;
  password: string;
  roles: ("ADMIN" | "MANAGER" | "TEACHER" | "STUDENT")[];
  status?: "INVITED" | "ACTIVE" | "DISABLED";
  passwordHash?: string;
}) {
  return prisma.user.create({
    data: {
      email: params.email,
      emailLower: params.email.toLowerCase(),
      name: params.name,
      passwordHash: params.status === "INVITED" ? null : (params.passwordHash ?? (await argon2.hash(params.password))),
      status: params.status ?? "ACTIVE",
      roles: { create: params.roles.map((kind) => ({ kind })) },
    },
  });
}

async function clearAll() {
  await prisma.answer.deleteMany({});
  await prisma.response.deleteMany({});
  await prisma.ballot.deleteMany({});
  await prisma.responseTask.deleteMany({});
  await prisma.campaignAssignment.deleteMany({});
  await prisma.campaignTemplate.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.semester.deleteMany({});
  await prisma.templateItem.deleteMany({});
  await prisma.templateSection.deleteMany({});
  await prisma.template.deleteMany({});
  await prisma.likertPoint.deleteMany({});
  await prisma.likertScale.deleteMany({});
  await prisma.studentGroupMember.deleteMany({});
  await prisma.studentGroup.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.hierarchyClosure.deleteMany({});
  await prisma.hierarchyEdge.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.hierarchyNode.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({});
}

async function main() {
  seedRng(20260807);
  console.log("Clearing existing data…");
  await clearAll();

  const sharedHash = await argon2.hash("astu1234");

  // ── Semesters ────────────────────────────────────────────────────────────
  console.log("Creating semesters…");
  const semesterIdByKey = new Map<string, string>();
  for (const s of F.SEMESTERS) {
    const row = await prisma.semester.create({
      data: {
        academicYear: s.academicYear,
        term: s.term,
        startsAt: new Date(s.startsAt),
        endsAt: new Date(s.endsAt),
      },
    });
    semesterIdByKey.set(s.key, row.id);
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  console.log("Creating hierarchy…");
  const admin = await makeUser({
    email: "admin@astu.edu.et",
    name: "System Administrator",
    password: "astu1234",
    roles: ["ADMIN"],
    passwordHash: sharedHash,
  });

  const nodeIdByKey = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();

  for (const nf of F.NODES) {
    let userId: string | null = null;
    if (nf.head) {
      const invited = nf.invite === "invited" || nf.invite === "expired";
      const u = await makeUser({
        email: nf.head.email,
        name: nf.head.name,
        password: "astu1234",
        roles: nf.headAlsoTeaches ? ["MANAGER", "TEACHER"] : ["MANAGER"],
        status: invited ? "INVITED" : "ACTIVE",
        passwordHash: sharedHash,
      });
      userId = u.id;
      userIdByEmail.set(nf.head.email, u.id);

      if (invited) {
        const expired = nf.invite === "expired";
        await prisma.invitation.create({
          data: {
            emailLower: nf.head.email.toLowerCase(),
            tokenHash: hashToken(rawToken()),
            intendedRole: "MANAGER",
            hierarchyNodeId: null,
            expiresAt: new Date(Date.now() + (expired ? -3 : 6) * 24 * 3600 * 1000),
          },
        });
      }
    }
    const node = await prisma.hierarchyNode.create({
      data: { name: nf.name, level: nf.level, type: nf.type, userId },
    });
    nodeIdByKey.set(nf.key, node.id);
  }

  // The system admin deliberately occupies NO node — ADMIN already sees every node via
  // scope logic, so giving them one would push a phantom level above the Academic VP.
  void admin;

  const edges: Prisma.HierarchyEdgeCreateManyInput[] = [];
  for (const nf of F.NODES) {
    for (const parentKey of nf.parents) {
      edges.push({ parentId: nodeIdByKey.get(parentKey)!, childId: nodeIdByKey.get(nf.key)! });
    }
  }
  await prisma.hierarchyEdge.createMany({ data: edges });

  const allNodes = await prisma.hierarchyNode.findMany({ select: { id: true } });
  await prisma.hierarchyClosure.createMany({
    data: computeClosureRows(allNodes.map((n) => n.id), edges),
  });

  // ── Teachers ─────────────────────────────────────────────────────────────
  console.log("Registering teachers and students…");
  const teacherIdByEmail = new Map<string, string>();
  const teachersByNode = new Map<string, F.TeacherFixture[]>();

  async function addTeachers(nodeKey: string, list: F.TeacherFixture[]) {
    teachersByNode.set(nodeKey, list);
    for (const t of list) {
      const u = await makeUser({
        email: t.email,
        name: t.name,
        password: "astu1234",
        roles: ["TEACHER"],
        passwordHash: sharedHash,
      });
      teacherIdByEmail.set(t.email, u.id);
      await prisma.membership.create({
        data: { userId: u.id, nodeId: nodeIdByKey.get(nodeKey)!, kind: "TEACHER" },
      });
    }
  }

  await addTeachers("cse", F.CSE_TEACHERS);
  for (const [nodeKey, list] of Object.entries(F.OTHER_DEPT_TEACHERS)) {
    await addTeachers(nodeKey, list);
  }

  // ── CSE students and groups ──────────────────────────────────────────────
  const cseNodeId = nodeIdByKey.get("cse")!;
  const groupIdByKey = new Map<string, string>();
  const groupMemberIds = new Map<string, string[]>();
  let studentSeq = 0;

  for (const g of F.CSE_GROUPS) {
    const group = await prisma.studentGroup.create({ data: { nodeId: cseNodeId, name: g.name, program: g.program } });
    groupIdByKey.set(g.key, group.id);

    const memberIds: string[] = [];
    const rows: Prisma.UserCreateManyInput[] = [];
    const roleRows: Prisma.UserRoleCreateManyInput[] = [];
    for (let i = 0; i < g.size; i++) {
      studentSeq += 1;
      const first = pick(F.FIRST_NAMES);
      const last = pick(F.LAST_NAMES);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${studentSeq}@astu.edu.et`;
      const id = `stu_${studentSeq}`;
      rows.push({
        id,
        email,
        emailLower: email,
        name: `${first} ${last}`,
        passwordHash: sharedHash,
        status: "ACTIVE",
      });
      roleRows.push({ userId: id, kind: "STUDENT" });
      memberIds.push(id);
    }
    await prisma.user.createMany({ data: rows });
    await prisma.userRole.createMany({ data: roleRows });
    await prisma.membership.createMany({
      data: memberIds.map((userId) => ({ userId, nodeId: cseNodeId, kind: "STUDENT" as const })),
    });
    await prisma.studentGroupMember.createMany({
      data: memberIds.map((userId) => ({ groupId: group.id, userId })),
    });
    groupMemberIds.set(g.key, memberIds);
  }

  // ── Scales ───────────────────────────────────────────────────────────────
  console.log("Creating scales and templates…");
  const scaleIdByKey = new Map<string, string>();
  for (const s of F.SCALES) {
    const scale = await prisma.likertScale.create({
      data: {
        name: s.name,
        points: { create: s.points.map((p, i) => ({ label: p.label, value: p.value, order: i + 1 })) },
      },
    });
    scaleIdByKey.set(s.key, scale.id);
  }

  // ── Templates ────────────────────────────────────────────────────────────
  async function createTemplate(params: {
    title: string;
    targetGroup: "STUDENT" | "PEER" | "MANAGER";
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    ownerNodeKey: string;
    sections: F.SectionFixture[];
    isDefault?: boolean;
    clonedFromId?: string;
  }) {
    return prisma.template.create({
      data: {
        title: params.title,
        targetGroup: params.targetGroup,
        status: params.status,
        isDefault: params.isDefault ?? false,
        publishedAt: params.status === "PUBLISHED" ? new Date() : null,
        ownerNodeId: nodeIdByKey.get(params.ownerNodeKey)!,
        clonedFromId: params.clonedFromId ?? null,
        sections: {
          create: params.sections.map((sec, i) => ({
            title: sec.title,
            type: sec.type,
            scaleId: sec.scaleKey ? scaleIdByKey.get(sec.scaleKey)! : null,
            weight: sec.weight,
            isOverall: sec.isOverall ?? false,
            allowNotApplicable: sec.allowNotApplicable ?? false,
            order: i + 1,
            items: {
              create: sec.items.map((it, j) => ({
                text: it.text,
                weight: it.weight,
                required: it.required,
                order: j + 1,
              })),
            },
          })),
        },
      },
    });
  }

  // Owned by the ASTU root (level 0), so every department below inherits them published
  // rather than each getting its own copy - see isTemplateVisible in template-logic.ts.
  const officialTemplateIds = new Map<"STUDENT" | "PEER" | "MANAGER", string>();
  for (const t of F.OFFICIAL_TEMPLATES) {
    const created = await createTemplate({
      title: t.title,
      targetGroup: t.targetGroup,
      status: "PUBLISHED",
      ownerNodeKey: "astu",
      sections: t.sections,
      isDefault: true,
    });
    officialTemplateIds.set(t.targetGroup, created.id);
  }
  const studentTemplateId = officialTemplateIds.get("STUDENT")!;
  const peerTemplateId = officialTemplateIds.get("PEER")!;
  const managerTemplateId = officialTemplateIds.get("MANAGER")!;

  // ── Response generation ──────────────────────────────────────────────────
  const templateCache = new Map<string, LoadedTemplate>();
  async function loadTemplate(templateId: string): Promise<LoadedTemplate> {
    const cached = templateCache.get(templateId);
    if (cached) return cached;
    const t = await prisma.template.findUniqueOrThrow({
      where: { id: templateId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: { items: { orderBy: { order: "asc" } }, scale: { include: { points: true } } },
        },
      },
    });
    templateCache.set(templateId, t);
    return t;
  }

  const SECTION_BIAS: Record<string, number> = {
    "Assessment Feedback": -0.15,
    Punctuality: -0.05,
    Ethics: -0.01,
    "Effective Delivery": 0.06,
    "Course Design": 0.0,
  };

  async function generateResponses(params: {
    campaignId: string;
    templateId: string;
    teacherId: string;
    teacherStrength: number;
    respondentIds: string[];
    respondentKind: "STUDENT" | "PEER" | "MANAGER";
    commentPool: string[];
    responseRate: number;
    drift: number;
    overallPenalty?: number;
    completedAt?: Date;
  }) {
    const template = await loadTemplate(params.templateId);
    const responders = params.respondentIds.filter(() => rnd() < params.responseRate);

    for (const respondentId of responders) {
      const answers: Prisma.AnswerCreateManyResponseInput[] = [];
      for (const sec of template.sections) {
        if (sec.type === "FREE_TEXT") {
          if (rnd() < 0.35) {
            answers.push({ itemId: sec.items[0].id, pointValue: null, text: pick(params.commentPool) });
          }
          continue;
        }
        const values = sec.scale!.points.map((p) => p.value).sort((a, b) => a - b);
        const bias = (SECTION_BIAS[sec.title] ?? 0) + params.drift + (sec.isOverall ? (params.overallPenalty ?? 0) : 0);
        for (const item of sec.items) {
          if (!item.required && rnd() < 0.15) continue;
          answers.push({
            itemId: item.id,
            pointValue: drawPoint(params.teacherStrength, bias, values),
            text: null,
          });
        }
      }

      await prisma.response.create({
        data: {
          campaignId: params.campaignId,
          teacherId: params.teacherId,
          templateId: params.templateId,
          respondentKind: params.respondentKind,
          respondentUserId: respondentId,
          answers: { createMany: { data: answers } },
        },
      });
    }

    if (responders.length > 0) {
      await prisma.responseTask.updateMany({
        where: { campaignId: params.campaignId, teacherId: params.teacherId, respondentId: { in: responders } },
        data: { completedAt: params.completedAt ?? new Date() },
      });
    }
    return responders.length;
  }

  async function generateGuestResponses(params: {
    campaignId: string;
    templateId: string;
    teacherId: string;
    teacherStrength: number;
    count: number;
    commentPool: string[];
  }) {
    const template = await loadTemplate(params.templateId);

    for (let i = 0; i < params.count; i++) {
      const answers: Prisma.AnswerCreateManyResponseInput[] = [];
      for (const sec of template.sections) {
        if (sec.type === "FREE_TEXT") {
          if (rnd() < 0.35) {
            answers.push({ itemId: sec.items[0].id, pointValue: null, text: pick(params.commentPool) });
          }
          continue;
        }
        const values = sec.scale!.points.map((p) => p.value).sort((a, b) => a - b);
        const bias = SECTION_BIAS[sec.title] ?? 0;
        for (const item of sec.items) {
          if (!item.required && rnd() < 0.15) continue;
          answers.push({ itemId: item.id, pointValue: drawPoint(params.teacherStrength, bias, values), text: null });
        }
      }

      await prisma.response.create({
        data: {
          campaignId: params.campaignId,
          teacherId: params.teacherId,
          templateId: params.templateId,
          respondentKind: "GUEST",
          respondentUserId: null,
          answers: { createMany: { data: answers } },
        },
      });
    }
  }

  // ── Campaigns ────────────────────────────────────────────────────────────
  console.log("Creating campaigns and generating responses…");

  const cseTeacherIds = F.CSE_TEACHERS.map((t) => teacherIdByEmail.get(t.email)!);
  const cseHeadId = userIdByEmail.get("meron.assefa@astu.edu.et")!;

  function studentsFor(email: string): string[] {
    return (F.CSE_TEACHING[email] ?? []).flatMap((gk) => groupMemberIds.get(gk) ?? []);
  }

  // -- historical closed CSE rounds, one per real Semester, for trend and history --
  for (const h of F.CSE_HISTORY) {
    const campaign = await prisma.campaign.create({
      data: {
        nodeId: cseNodeId,
        semesterId: semesterIdByKey.get(h.semesterKey)!,
        name: h.name,
        type: "EMAIL",
        status: "CLOSED",
        opensAt: new Date(h.opensAt),
        closesAt: new Date(h.closesAt),
        minResponses: 5,
        campaignTemplates: { create: [{ targetGroup: "STUDENT", templateId: studentTemplateId }] },
      },
    });

    for (const t of F.CSE_TEACHERS) {
      const teacherId = teacherIdByEmail.get(t.email)!;
      const students = studentsFor(t.email);
      await prisma.campaignAssignment.createMany({
        data: (F.CSE_TEACHING[t.email] ?? []).map((gk) => ({
          campaignId: campaign.id,
          teacherId,
          targetGroup: "STUDENT" as const,
          studentGroupId: groupIdByKey.get(gk)!,
        })),
      });
      await prisma.responseTask.createMany({
        data: students.map((respondentId) => ({
          campaignId: campaign.id,
          teacherId,
          respondentId,
          targetGroup: "STUDENT" as const,
          templateId: studentTemplateId,
          tokenHash: hashToken(rawToken()),
        })),
      });
      await generateResponses({
        campaignId: campaign.id,
        templateId: studentTemplateId,
        teacherId,
        teacherStrength: t.strength,
        respondentIds: students,
        respondentKind: "STUDENT",
        commentPool: F.STUDENT_COMMENTS,
        responseRate: 0.62,
        drift: h.drift,
        overallPenalty: t.email === "amanuel.bekele@astu.edu.et" ? -0.18 : -0.04,
        completedAt: new Date(h.closesAt),
      });
    }
  }

  // -- Summer 2024/25 CSE round — Weekend/Extension groups only (the whole reason Summer
  // exists as a term: those students attend class over the summer) --
  const summerSemesterId = semesterIdByKey.get("su2025")!;
  const summerCampaign = await prisma.campaign.create({
    data: {
      nodeId: cseNodeId,
      semesterId: summerSemesterId,
      name: "Summer 2024/25 Student Evaluation — CSE",
      type: "EMAIL",
      status: "CLOSED",
      opensAt: new Date("2025-07-01"),
      closesAt: new Date("2025-07-21"),
      minResponses: 5,
      campaignTemplates: { create: [{ targetGroup: "STUDENT", templateId: studentTemplateId }] },
    },
  });
  for (const [email, groupKeys] of Object.entries(F.SUMMER_TEACHING)) {
    const teacherId = teacherIdByEmail.get(email)!;
    const students = groupKeys.flatMap((gk) => groupMemberIds.get(gk) ?? []);
    await prisma.campaignAssignment.createMany({
      data: groupKeys.map((gk) => ({
        campaignId: summerCampaign.id,
        teacherId,
        targetGroup: "STUDENT" as const,
        studentGroupId: groupIdByKey.get(gk)!,
      })),
    });
    await prisma.responseTask.createMany({
      data: students.map((respondentId) => ({
        campaignId: summerCampaign.id,
        teacherId,
        respondentId,
        targetGroup: "STUDENT" as const,
        templateId: studentTemplateId,
        tokenHash: hashToken(rawToken()),
      })),
    });
    const t = F.CSE_TEACHERS.find((x) => x.email === email)!;
    await generateResponses({
      campaignId: summerCampaign.id,
      templateId: studentTemplateId,
      teacherId,
      teacherStrength: t.strength,
      respondentIds: students,
      respondentKind: "STUDENT",
      commentPool: F.STUDENT_COMMENTS,
      responseRate: 0.7,
      drift: 0,
      completedAt: new Date("2025-07-21"),
    });
  }

  // -- Fall 2026/27 student evaluation (OPEN, the campaign the design centres on) --
  const fall2026SemesterId = semesterIdByKey.get("f2026")!;
  const fall2026 = await prisma.campaign.create({
    data: {
      nodeId: cseNodeId,
      semesterId: fall2026SemesterId,
      name: "Fall 2026/27 Student Evaluation — CSE",
      type: "EMAIL",
      status: "OPEN",
      opensAt: new Date("2026-09-01"),
      closesAt: new Date("2026-09-21"),
      minResponses: 5,
      campaignTemplates: { create: [{ targetGroup: "STUDENT", templateId: studentTemplateId }] },
    },
  });

  const rawTokenByTask = new Map<string, { token: string; teacher: string }>();

  for (const t of F.CSE_TEACHERS) {
    const teacherId = teacherIdByEmail.get(t.email)!;
    const students = studentsFor(t.email);

    await prisma.campaignAssignment.createMany({
      data: (F.CSE_TEACHING[t.email] ?? []).map((gk) => ({
        campaignId: fall2026.id,
        teacherId,
        targetGroup: "STUDENT" as const,
        studentGroupId: groupIdByKey.get(gk)!,
      })),
    });

    for (const respondentId of students) {
      const raw = rawToken();
      await prisma.responseTask.create({
        data: {
          campaignId: fall2026.id,
          teacherId,
          respondentId,
          targetGroup: "STUDENT",
          templateId: studentTemplateId,
          tokenHash: hashToken(raw),
        },
      });
      rawTokenByTask.set(`${teacherId}:${respondentId}`, { token: raw, teacher: t.name });
    }

    const rate = t.email === "bekele.dinku@astu.edu.et" ? 0.06 : t.email === "yonas.tesfaye@astu.edu.et" ? 0.2 : 0.62;
    const n = await generateResponses({
      campaignId: fall2026.id,
      templateId: studentTemplateId,
      teacherId,
      teacherStrength: t.strength,
      respondentIds: students,
      respondentKind: "STUDENT",
      commentPool: F.STUDENT_COMMENTS,
      responseRate: rate,
      drift: 0,
      overallPenalty: t.email === "amanuel.bekele@astu.edu.et" ? -0.22 : -0.05,
    });
    console.log(`  ${t.name}: ${n} student responses`);
  }

  // -- Peer review (OPEN) --
  const peerCampaign = await prisma.campaign.create({
    data: {
      nodeId: cseNodeId,
      semesterId: fall2026SemesterId,
      name: "Peer Teaching Review 2026/27 — CSE",
      type: "EMAIL",
      status: "OPEN",
      opensAt: new Date("2026-09-01"),
      closesAt: new Date("2026-09-30"),
      minResponses: 3,
      campaignTemplates: { create: [{ targetGroup: "PEER", templateId: peerTemplateId }] },
    },
  });
  for (const t of F.CSE_TEACHERS) {
    const teacherId = teacherIdByEmail.get(t.email)!;
    const peers = cseTeacherIds.filter((id) => id !== teacherId).slice(0, 5);
    await prisma.campaignAssignment.createMany({
      data: peers.map((respondentUserId) => ({
        campaignId: peerCampaign.id,
        teacherId,
        targetGroup: "PEER" as const,
        respondentUserId,
      })),
    });
    await prisma.responseTask.createMany({
      data: peers.map((respondentId) => ({
        campaignId: peerCampaign.id,
        teacherId,
        respondentId,
        targetGroup: "PEER" as const,
        templateId: peerTemplateId,
        tokenHash: hashToken(rawToken()),
      })),
    });
    await generateResponses({
      campaignId: peerCampaign.id,
      templateId: peerTemplateId,
      teacherId,
      teacherStrength: t.strength + 0.08,
      respondentIds: peers,
      respondentKind: "PEER",
      commentPool: F.PEER_COMMENTS,
      responseRate: 0.8,
      drift: 0,
    });
  }

  // -- Head's assessment (OPEN) — identified by design, min-N of 1 --
  const headCampaign = await prisma.campaign.create({
    data: {
      nodeId: cseNodeId,
      semesterId: fall2026SemesterId,
      name: "Head's Assessment 2026/27 — CSE",
      type: "EMAIL",
      status: "OPEN",
      opensAt: new Date("2026-09-01"),
      closesAt: new Date("2026-09-30"),
      minResponses: 1,
      campaignTemplates: { create: [{ targetGroup: "MANAGER", templateId: managerTemplateId }] },
    },
  });
  for (const t of F.CSE_TEACHERS) {
    const teacherId = teacherIdByEmail.get(t.email)!;
    await prisma.campaignAssignment.create({
      data: { campaignId: headCampaign.id, teacherId, targetGroup: "MANAGER", respondentUserId: cseHeadId },
    });
    await prisma.responseTask.create({
      data: {
        campaignId: headCampaign.id,
        teacherId,
        respondentId: cseHeadId,
        targetGroup: "MANAGER",
        templateId: managerTemplateId,
        tokenHash: hashToken(rawToken()),
      },
    });
    if (t.strength > 0.4) {
      await generateResponses({
        campaignId: headCampaign.id,
        templateId: managerTemplateId,
        teacherId,
        teacherStrength: t.strength,
        respondentIds: [cseHeadId],
        respondentKind: "MANAGER",
        commentPool: F.MANAGER_COMMENTS,
        responseRate: 1,
        drift: 0,
      });
    }
  }

  // -- Instant guest campaign (OPEN, with real guest responses) --
  const guestTeachers = [F.CSE_TEACHERS[1], F.CSE_TEACHERS[2]]; // Hanna Girma, Yonas Tesfaye
  const guestCampaign = await prisma.campaign.create({
    data: {
      nodeId: cseNodeId,
      semesterId: fall2026SemesterId,
      name: "Guest Lecture Series — instant",
      type: "INSTANT",
      status: "OPEN",
      audienceMode: "GUEST_ALLOWED",
      publicSlug: randomBytes(9).toString("hex"),
      opensAt: new Date("2026-09-05"),
      maxResponses: 120,
      minResponses: 5,
      campaignTemplates: { create: [{ targetGroup: "STUDENT", templateId: studentTemplateId }] },
      assignments: {
        create: guestTeachers.map((t) => ({ teacherId: teacherIdByEmail.get(t.email)!, targetGroup: "STUDENT" as const })),
      },
    },
  });
  for (const t of guestTeachers) {
    await generateGuestResponses({
      campaignId: guestCampaign.id,
      templateId: studentTemplateId,
      teacherId: teacherIdByEmail.get(t.email)!,
      teacherStrength: t.strength,
      count: 15 + Math.floor(rnd() * 20),
      commentPool: F.STUDENT_COMMENTS,
    });
  }

  // -- Sibling departments, so the scope overview heatmap has rows --
  for (const [nodeKey, list] of Object.entries(F.OTHER_DEPT_TEACHERS)) {
    const templateId = studentTemplateId;
    const campaign = await prisma.campaign.create({
      data: {
        nodeId: nodeIdByKey.get(nodeKey)!,
        semesterId: fall2026SemesterId,
        name: `Fall 2026/27 Student Evaluation — ${nodeKey.toUpperCase()}`,
        type: "EMAIL",
        status: "CLOSED",
        opensAt: new Date("2026-09-01"),
        closesAt: new Date("2026-09-21"),
        minResponses: 5,
        campaignTemplates: { create: [{ targetGroup: "STUDENT", templateId }] },
      },
    });
    const cohort = groupMemberIds.get("y3a")!.slice(0, 40);
    for (const t of list) {
      const teacherId = teacherIdByEmail.get(t.email)!;
      await prisma.responseTask.createMany({
        data: cohort.map((respondentId) => ({
          campaignId: campaign.id,
          teacherId,
          respondentId,
          targetGroup: "STUDENT" as const,
          templateId,
          tokenHash: hashToken(rawToken()),
        })),
      });
      await generateResponses({
        campaignId: campaign.id,
        templateId,
        teacherId,
        teacherStrength: t.strength,
        respondentIds: cohort,
        respondentKind: "STUDENT",
        commentPool: F.STUDENT_COMMENTS,
        responseRate: 0.7,
        drift: 0,
        overallPenalty: -0.05,
        completedAt: new Date("2026-09-21"),
      });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const counts = {
    users: await prisma.user.count(),
    nodes: await prisma.hierarchyNode.count(),
    templates: await prisma.template.count(),
    semesters: await prisma.semester.count(),
    campaigns: await prisma.campaign.count(),
    responses: await prisma.response.count(),
    answers: await prisma.answer.count(),
  };

  console.log("\n================ ASTU SEED COMPLETE (v2) ================");
  console.log(`${counts.nodes} hierarchy nodes · ${counts.users} users · ${counts.templates} templates`);
  console.log(`${counts.semesters} semesters · ${counts.campaigns} campaigns · ${counts.responses} responses · ${counts.answers} answers`);
  console.log("\nAll accounts use password: astu1234");
  console.log("  admin@astu.edu.et            ADMIN     · root, hierarchy + semesters admin");
  console.log("  miftah.shifera@astu.edu.et   MANAGER   · Academic VP (L0)");
  console.log("  kebede.alemu@astu.edu.et     MANAGER   · College of EE & Computing (L1)");
  console.log("  rahel.mekonnen@astu.edu.et   MANAGER   · Quality Assurance (L1, cross-cutting)");
  console.log("  meron.assefa@astu.edu.et     MANAGER   · CSE Department (L2, leaf)");
  console.log("  amanuel.bekele@astu.edu.et   TEACHER   · has the big composite/self-rated gap");
  console.log("  bekele.dinku@astu.edu.et     TEACHER   · deliberately BELOW min-N (suppressed state)");
  const stillOpen = await prisma.responseTask.findMany({
    where: { campaignId: fall2026.id, completedAt: null },
    select: { teacherId: true, respondentId: true },
    take: 40,
  });
  console.log("\nWorking response-form links (nobody has answered these yet):");
  let printed = 0;
  for (const task of stillOpen) {
    const entry = rawTokenByTask.get(`${task.teacherId}:${task.respondentId}`);
    if (!entry || printed >= 3) continue;
    console.log(`  → ${entry.teacher}: ${process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN}/respond/${entry.token}`);
    printed += 1;
  }
  console.log(`\nFall 2026/27 campaign id: ${fall2026.id}`);
  console.log(`Summer 2024/25 campaign id (Weekend/Extension only): ${summerCampaign.id}`);
  console.log("===========================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
