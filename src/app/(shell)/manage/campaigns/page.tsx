import { requireUser } from "@/server/auth/session";
import { listCampaigns } from "@/server/campaigns/campaigns";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const user = await requireUser();
  let data;
  try {
    data = await listCampaigns(user.id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  return <CampaignsClient campaigns={data.campaigns} counts={data.counts} />;
}
