import { requireUser } from "@/server/auth/session";
import { listGraph } from "@/server/hierarchy/hierarchy";
import StructureClient from "./StructureClient";

export default async function HierarchyPage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can edit the org structure.</div>;
  }
  const nodes = await listGraph();
  return <StructureClient allNodes={nodes} />;
}
