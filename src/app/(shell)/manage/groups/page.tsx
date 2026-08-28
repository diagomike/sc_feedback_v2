import { requireUser } from "@/server/auth/session";
import { listGroups } from "@/server/groups";
import GroupsClient from "./GroupsClient";

export default async function GroupsPage() {
  const user = await requireUser();
  let groups;
  try {
    groups = await listGroups(user.id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  return <GroupsClient groups={groups} />;
}
