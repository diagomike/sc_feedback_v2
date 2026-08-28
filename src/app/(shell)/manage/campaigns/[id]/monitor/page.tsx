import { requireUser } from "@/server/auth/session";
import { getCampaignMonitor } from "@/server/campaigns/campaigns";
import MonitorClient from "./MonitorClient";

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
