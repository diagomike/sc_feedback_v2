import { requireUser } from "@/server/auth/session";
import { getCampaignDetail } from "@/server/campaigns/campaigns";
import { listTemplates } from "@/server/templates/templates";
import { listPeople } from "@/server/people";
import { listGroups } from "@/server/groups";
import CampaignBuilderClient from "./CampaignBuilderClient";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  let detail;
  try {
    detail = await getCampaignDetail(user.id, id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  const [templatesData, peopleData, groups] = await Promise.all([listTemplates(user.id), listPeople(user.id), listGroups(user.id)]);
  const publishedTemplates = templatesData.templates.filter((t) => t.status === "PUBLISHED");
  const teachers = peopleData.people.filter((p) => p.kind === "TEACHER");

  return (
    <CampaignBuilderClient
      campaign={detail}
      publishedTemplates={publishedTemplates.map((t) => ({ id: t.id, title: t.title, targetGroup: t.targetGroup }))}
      teachers={teachers.map((t) => ({ id: t.id, name: t.name }))}
      groups={groups.map((g) => ({ id: g.id, name: g.name, program: g.program }))}
    />
  );
}
