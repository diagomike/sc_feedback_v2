import { requireUser } from "@/server/auth/session";
import { getTemplateDetail } from "@/server/templates/templates";
import { listScales } from "@/server/scales";
import TemplateBuilderClient from "./TemplateBuilderClient";

export default async function TemplateBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  let detail;
  try {
    detail = await getTemplateDetail(user.id, id);
  } catch (e) {
    return <div className="p-24 text-11.5 text-bad">{(e as Error).message}</div>;
  }
  const scales = await listScales();
  return <TemplateBuilderClient template={detail} scales={scales} />;
}
