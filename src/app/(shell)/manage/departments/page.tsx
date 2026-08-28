import { requireUser } from "@/server/auth/session";
import { listGraph } from "@/server/hierarchy/hierarchy";
import NodeTypeManageClient from "@/components/manage/NodeTypeManageClient";

export default async function DepartmentsPage() {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) {
    return <div className="p-24 text-11.5 text-bad">Only a system administrator can manage departments.</div>;
  }
  const nodes = await listGraph();
  return <NodeTypeManageClient type="DEPARTMENT" allNodes={nodes} />;
}
