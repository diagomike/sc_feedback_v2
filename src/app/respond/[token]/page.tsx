import { getFormByToken, NotFoundError } from "@/server/responses/responses";
import FormTerminalState from "@/components/respond/FormTerminalState";
import ResponseFormClient from "./ResponseFormClient";

/** Standalone route for /respond/[token] — the private, per-person link emailed for a
 *  campaign. No session, no shell: the token in the URL IS the credential. Ported from
 *  v1's ResponseFormPage.tsx. */
export default async function ResponseFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const form = await getFormByToken(token);
    if (form.completed) return <FormTerminalState kind="already" />;
    return <ResponseFormClient token={token} form={form} />;
  } catch (e) {
    if (e instanceof NotFoundError) return <FormTerminalState kind="invalid" />;
    throw e;
  }
}
