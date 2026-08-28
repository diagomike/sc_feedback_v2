import { requireUser } from "@/server/auth/session";
import { listGraph } from "@/server/hierarchy/hierarchy";
import NodeTypeManageClient from "@/components/manage/NodeTypeManageClient";

export default async function CollegesPage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can manage colleges.</div>;
  }
  const nodes = await listGraph();
  return <NodeTypeManageClient type="COLLEGE" allNodes={nodes} />;
}
