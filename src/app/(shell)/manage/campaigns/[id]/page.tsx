import { requireUser } from "@/server/auth/session";
import { getCampaignDetail } from "@/server/campaigns/campaigns";
import { listTemplates } from "@/server/templates/templates";
import { listPeople } from "@/server/people";
import { listGroups } from "@/server/groups";
import CampaignBuilderClient from "./CampaignBuilderClient";

// launchCampaign/remindCampaign send SMTP sequentially (deliberately - concurrent sends
// open one connection each and time a chunk out). A department-sized campaign is therefore
// bounded by recipients x per-send latency, which overruns the default serverless limit.
// 300s is the Vercel Pro ceiling; Hobby silently caps lower. See VERCEL_DEPLOYMENT.md.
export const maxDuration = 300;

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
