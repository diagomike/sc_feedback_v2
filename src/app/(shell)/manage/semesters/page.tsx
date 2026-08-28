import { requireUser } from "@/server/auth/session";
import { listSemesters } from "@/server/semesters";
import SemestersClient from "./SemestersClient";

export default async function SemestersPage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can manage semesters.</div>;
  }
  const semesters = await listSemesters();
  return <SemestersClient semesters={semesters} />;
}
