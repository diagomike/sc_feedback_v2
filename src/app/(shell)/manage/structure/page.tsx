import { requireUser } from "@/server/auth/session";
import { listGraph } from "@/server/hierarchy/hierarchy";
import StructureStudioClient from "./StructureStudioClient";

/** Replaces the old Structure / Personnel / Offices / Colleges / Departments screens — one
 *  canvas plus an inspector, over the same listGraph() payload all five already used. */
export default async function StructurePage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can edit the org structure.</div>;
  }
  const nodes = await listGraph();
  return <StructureStudioClient allNodes={nodes} />;
}
