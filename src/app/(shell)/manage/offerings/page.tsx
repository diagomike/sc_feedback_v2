import { requireUser } from "@/server/auth/session";
import { getOfferingsScreen } from "@/server/courses/courses";
import OfferingsClient from "./OfferingsClient";

/** What the registry import actually produced, before anyone launches a campaign against
 *  it. Also the answer to "which sections am I reaching outside my own department". */
export default async function OfferingsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const user = await requireUser();
  const { semester } = await searchParams;
  const data = await getOfferingsScreen(user.id, semester ?? null);
  return <OfferingsClient {...data} />;
}
