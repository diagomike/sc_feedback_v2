import { getPublicCampaignInfo } from "@/server/public/public-campaigns";
import { NotFoundError } from "@/server/responses/responses";
import FormTerminalState from "@/components/respond/FormTerminalState";
import GuestFormClient from "./GuestFormClient";

/** Standalone route for /guest/[slug] — the one public, no-login link a manager copies
 *  out of an instant campaign's builder/monitor page. Ported from v1's GuestFormPage.tsx. */
export default async function GuestFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const info = await getPublicCampaignInfo(slug);
    if (info.status === "closed") return <FormTerminalState kind="closed" />;
    if (info.status === "not_open") return <FormTerminalState kind="not_open" />;
    if (info.capReached) return <FormTerminalState kind="cap" />;
    return <GuestFormClient slug={slug} info={info} />;
  } catch (e) {
    if (e instanceof NotFoundError) {
      return (
        <FormTerminalState kind="invalid" detail="This link is no longer valid. Ask whoever shared it with you for the current one." />
      );
    }
    throw e;
  }
}
