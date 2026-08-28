import { requireUser } from "@/server/auth/session";
import { listLetterCampaignOptions } from "@/server/letters/letters";
import LettersClient from "./LettersClient";

export default async function LettersPage() {
  const user = await requireUser();
  let options;
  try {
    options = await listLetterCampaignOptions(user.id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  return <LettersClient options={options} />;
}
