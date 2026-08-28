import { requireUser } from "@/server/auth/session";
import { listPeople } from "@/server/people";
import { listGroups } from "@/server/groups";
import PeopleClient from "./PeopleClient";

export default async function PeoplePage() {
  const user = await requireUser();
  let data;
  try {
    data = await listPeople(user.id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  const groups = await listGroups(user.id);
  return <PeopleClient people={data.people} counts={data.counts} groups={groups} />;
}
