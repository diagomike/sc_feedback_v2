import { requireUser } from "@/server/auth/session";
import { listGraph } from "@/server/hierarchy/hierarchy";
import PersonnelClient from "./PersonnelClient";

export default async function PersonnelPage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can view personnel.</div>;
  }
  const nodes = await listGraph();
  return <PersonnelClient allNodes={nodes} />;
}
