import { listSemesters } from "@/server/semesters";
import NewCampaignClient from "./NewCampaignClient";

export default async function NewCampaignPage() {
  const semesters = (await listSemesters()).filter((s) => s.active);
  return <NewCampaignClient semesters={semesters} />;
}
