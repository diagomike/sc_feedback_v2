import { prisma } from "@/server/db";
import { semesterLabel } from "@/lib/semester";
import ImportClient from "./ImportClient";

/** The offerings and enrolments tabs load into one semester, chosen here rather than read
 *  from a file — a mislabelled column must not be able to write into the wrong term. */
export default async function ImportPage() {
  const semesters = await prisma.semester.findMany({ orderBy: { startsAt: "desc" } });
  return <ImportClient semesters={semesters.map((s) => ({ id: s.id, label: semesterLabel(s) }))} />;
}
