import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { landingPathFor } from "@/lib/nav";

/** Sends each role to the first screen it can actually open. An admin has no Analyse
 *  mode, so landing everyone on /manage/campaigns would greet them with a refusal. */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(landingPathFor(user.roles, user.hierarchyNodeType));
}
