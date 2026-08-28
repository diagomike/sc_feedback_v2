import Link from "next/link";
import AuthChrome from "@/components/auth/AuthChrome";
import { previewInvitation } from "@/server/auth/invitation";
import RegisterForm from "./RegisterForm";

const REASON_COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: "This invitation has expired",
    body: "Invitation links are valid for 14 days. Ask whoever invited you to send a fresh one.",
  },
  consumed: {
    title: "This invitation has already been used",
    body: "Registration is already complete for this link. Sign in with the password you set.",
  },
  invalid: {
    title: "This link is invalid",
    body: "Check that you copied the whole link from the email, or ask for a new invitation.",
  },
};

/** Standalone route — the token in the URL is the credential, exactly like
 *  /respond/[token], so this works with no session and carries its own minimal chrome. */
export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(token);

  return (
    <AuthChrome>
      <div className="w-full max-w-[380px]">
        <div className="bg-panel border border-border rounded-3 overflow-hidden">
          <div className="px-14 py-12 border-b border-border">
            <div className="text-10 uppercase tracking-caps text-faint font-semibold">
              Adama Science and Technology University
            </div>
            <div className="text-15 font-semibold mt-2">Complete your registration</div>
          </div>

          {!preview.valid ? (
            <div className="px-14 py-12">
              <div className="flex gap-8">
                <div className="w-3 bg-warn rounded-2 flex-none" />
                <div>
                  <div className="text-12.5 font-semibold">{REASON_COPY[preview.reason ?? "invalid"].title}</div>
                  <div className="text-11 text-dim leading-loose mt-3">
                    {REASON_COPY[preview.reason ?? "invalid"].body}
                  </div>
                </div>
              </div>
              <Link
                href="/login"
                className="inline-block border border-border2 bg-panel h-25 px-11 rounded-3 text-11.5 text-dim mt-12 leading-[25px]"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <RegisterForm token={token} name={preview.name} email={preview.email} role={preview.role ?? ""} />
          )}
        </div>

        <div className="text-10.5 text-faint leading-loose mt-12 px-2">
          This link is single-use and expires 14 days after it was sent.
        </div>
      </div>
    </AuthChrome>
  );
}
