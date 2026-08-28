import { requireUser } from "@/server/auth/session";
import { listTemplates } from "@/server/templates/templates";
import TemplatesClient from "./TemplatesClient";

export default async function TemplatesPage() {
  const user = await requireUser();
  let data;
  try {
    data = await listTemplates(user.id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  return <TemplatesClient templates={data.templates} counts={data.counts} />;
}
