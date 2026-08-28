/**
 * The single most important piece of copy in the product. A respondent's honesty depends
 * on what they believe, not on what the database does. Ported from v1's TrustBanner.tsx.
 */
export default function TrustBanner({
  targetGroup,
  teacherName,
  minResponses,
  isGuest = false,
}: {
  targetGroup: "STUDENT" | "PEER" | "MANAGER";
  teacherName: string;
  minResponses: number;
  isGuest?: boolean;
}) {
  const identified = targetGroup === "MANAGER";

  if (isGuest) {
    return (
      <div className="flex gap-9 px-14 py-10 bg-soft border-b border-border">
        <div className="w-3 bg-accent rounded-2 flex-none" />
        <div className="min-w-0">
          <div className="text-12 font-semibold text-accent">This form doesn&apos;t ask who you are</div>
          <div className="text-11 text-dim leading-loose mt-2">
            No name, account, or login is collected at all — nothing here can be linked back to you, because there is
            nothing about you to link it to.
          </div>
          <div className="text-10.5 text-faint leading-loose mt-5">
            Results stay hidden entirely until at least {minResponses} people have responded, so nobody can be
            identified by elimination. {teacherName} sees nothing until the campaign closes.
          </div>
        </div>
      </div>
    );
  }

  if (identified) {
    return (
      <div className="flex gap-9 px-14 py-10 bg-warnbg border-b border-border">
        <div className="w-3 bg-warn rounded-2 flex-none" />
        <div className="min-w-0">
          <div className="text-12 font-semibold text-warn">This feedback is not anonymous</div>
          <div className="text-11 text-dim leading-loose mt-2">
            A teacher has exactly one direct manager, so {teacherName} will know this assessment came from you. We
            would rather say that plainly than imply a privacy the system cannot deliver.
          </div>
          <div className="text-10.5 text-faint leading-loose mt-5">
            Your assessment is shown to the teacher after the campaign closes, alongside the anonymous student and
            peer results.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-9 px-14 py-10 bg-soft border-b border-border">
      <div className="w-3 bg-accent rounded-2 flex-none" />
      <div className="min-w-0">
        <div className="text-12 font-semibold text-accent">Nobody will ever know these answers were yours</div>
        <div className="text-11 text-dim leading-loose mt-2">
          Your name is stored only so you are not asked twice. It is never stored with your answers, and no screen in
          this system — not the lecturer&apos;s, not the dean&apos;s — can link a response to a person.
        </div>
        <div className="text-10.5 text-faint leading-loose mt-5">
          Results stay hidden entirely until at least {minResponses} people have responded, so nobody can be
          identified by elimination. {teacherName} sees nothing until the campaign closes.
        </div>
      </div>
    </div>
  );
}
