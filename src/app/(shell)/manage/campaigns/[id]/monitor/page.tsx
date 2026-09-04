import { requireUser } from "@/server/auth/session";
import { getCampaignMonitor } from "@/server/campaigns/campaigns";
import MonitorClient from "./MonitorClient";

// launchCampaign/remindCampaign send SMTP sequentially (deliberately - concurrent sends
// open one connection each and time a chunk out). A department-sized campaign is therefore
// bounded by recipients x per-send latency, which overruns the default serverless limit.
// 300s is the Vercel Pro ceiling; Hobby silently caps lower. See VERCEL_DEPLOYMENT.md.
export const maxDuration = 300;

export default async function CampaignMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  let monitor;
  try {
    monitor = await getCampaignMonitor(user.id, id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  return <MonitorClient campaignId={id} monitor={monitor} />;
}
