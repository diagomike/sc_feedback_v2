import "server-only";
import { prisma } from "@/server/db";
import { ownDepartmentNode } from "@/server/scope";
import { semesterLabel } from "@/lib/semester";

/**
 * Reads over the offering graph. Thin Prisma wrappers by design — every decision worth
 * testing lives in course-logic.ts (parsing) or campaigns.ts (who may assign what).
 *
 * The one thing worth stating here: an offering belongs to the SEMESTER and the SECTION,
 * not to the teacher's department. That is deliberate — a department's own offerings are
 * "courses my teachers give", which routinely includes sections owned by other departments
 * (in the real 2025/26 export, 16 instructors from Maths/Social Science/Electrical teach
 * CSE and SE sections). `listOfferingsForNode` therefore keys off teacher membership, not
 * off the section's node.
 */

export interface OfferingRow {
  id: string;
  courseCode: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  studentGroupId: string;
  sectionName: string;
  /** The section's own department, which may not be the caller's. */
  sectionNodeId: string;
  sectionNodeName: string;
  enrolledCount: number;
}

const offeringInclude = {
  course: { select: { code: true, title: true } },
  teacher: { select: { id: true, name: true } },
  studentGroup: { select: { id: true, name: true, nodeId: true, node: { select: { name: true } } } },
  _count: { select: { enrollments: true } },
} as const;

type LoadedOffering = {
  id: string;
  course: { code: string; title: string };
  teacher: { id: string; name: string };
  studentGroup: { id: string; name: string; nodeId: string; node: { name: string } };
  _count: { enrollments: number };
};

function toRow(o: LoadedOffering): OfferingRow {
  return {
    id: o.id,
    courseCode: o.course.code,
    courseTitle: o.course.title,
    teacherId: o.teacher.id,
    teacherName: o.teacher.name,
    studentGroupId: o.studentGroup.id,
    sectionName: o.studentGroup.name,
    sectionNodeId: o.studentGroup.nodeId,
    sectionNodeName: o.studentGroup.node.name,
    enrolledCount: o._count.enrollments,
  };
}

/** Every offering given by a teacher of `teacherIds` in one semester. */
export async function listOfferingsForTeachers(
  semesterId: string,
  teacherIds: string[],
): Promise<OfferingRow[]> {
  if (teacherIds.length === 0) return [];
  const offerings = await prisma.courseOffering.findMany({
    where: { semesterId, teacherId: { in: teacherIds } },
    include: offeringInclude,
    orderBy: [{ teacher: { name: "asc" } }, { course: { code: "asc" } }],
  });
  return offerings.map(toRow);
}

/** Every offering given by a member of `nodeId` in one semester, whoever owns the section. */
export async function listOfferingsForNode(nodeId: string, semesterId: string): Promise<OfferingRow[]> {
  const teachers = await prisma.membership.findMany({
    where: { nodeId, kind: "TEACHER" },
    select: { userId: true },
  });
  return listOfferingsForTeachers(semesterId, teachers.map((t) => t.userId));
}

export interface OfferingsScreenRow extends OfferingRow {
  /** Which campaigns already assign this offering, so a head can see what is spoken for. */
  campaignNames: string[];
}

/** Backs /manage/offerings — the caller's own department's offerings for one semester. */
export async function getOfferingsScreen(requestingUserId: string, semesterId: string | null) {
  const node = await ownDepartmentNode(requestingUserId);

  const semesters = await prisma.semester.findMany({ orderBy: { startsAt: "desc" } });
  const selected = semesterId
    ? (semesters.find((s) => s.id === semesterId) ?? null)
    : (semesters.find((s) => s.active) ?? semesters[0] ?? null);

  if (!selected) {
    return { nodeName: node.name, semesters: [], selectedSemesterId: null, rows: [] as OfferingsScreenRow[] };
  }

  const rows = await listOfferingsForNode(node.id, selected.id);
  const assignments = rows.length
    ? await prisma.campaignAssignment.findMany({
        where: { courseOfferingId: { in: rows.map((r) => r.id) } },
        select: { courseOfferingId: true, campaign: { select: { name: true, status: true } } },
      })
    : [];

  const namesByOffering = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.courseOfferingId) continue;
    const list = namesByOffering.get(a.courseOfferingId) ?? [];
    const label = `${a.campaign.name} (${a.campaign.status.toLowerCase()})`;
    if (!list.includes(label)) list.push(label);
    namesByOffering.set(a.courseOfferingId, list);
  }

  return {
    nodeName: node.name,
    semesters: semesters.map((s) => ({ id: s.id, label: semesterLabel(s) })),
    selectedSemesterId: selected.id,
    rows: rows.map((r) => ({ ...r, campaignNames: namesByOffering.get(r.id) ?? [] })),
  };
}

/** Student ids enrolled on each of the given offerings. */
export async function enrolledUserIdsByOffering(offeringIds: string[]): Promise<Map<string, string[]>> {
  const byOffering = new Map<string, string[]>();
  if (offeringIds.length === 0) return byOffering;
  const rows = await prisma.courseEnrollment.findMany({
    where: { offeringId: { in: offeringIds } },
    select: { offeringId: true, userId: true },
  });
  for (const r of rows) {
    const list = byOffering.get(r.offeringId) ?? [];
    list.push(r.userId);
    byOffering.set(r.offeringId, list);
  }
  return byOffering;
}
