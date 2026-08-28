import { requireUser } from "@/server/auth/session";
import { getSelfOverall, getSelfSummary } from "@/server/analytics/analytics";
import { Badge } from "@/components/ui/badge";

export default async function SelfFeedbackPage() {
  const user = await requireUser();
  const [overall, student, peer, manager] = await Promise.all([
    getSelfOverall(user.id),
    getSelfSummary({ teacherId: user.id, targetGroup: "STUDENT" }),
    getSelfSummary({ teacherId: user.id, targetGroup: "PEER" }),
    getSelfSummary({ teacherId: user.id, targetGroup: "MANAGER" }),
  ]);

  return (
    <div className="p-16 flex flex-col gap-16 max-w-1000">
      <div className="border border-border rounded-3 bg-panel2 px-16 py-14">
        <div className="text-11 font-semibold uppercase tracking-label text-faint mb-8">Overall performance</div>
        <div className="flex gap-24 flex-wrap">
          <Stat label="Student (50%)" value={overall.student?.toFixed(2) ?? "—"} />
          <Stat label="Peer (15%)" value={overall.peer?.toFixed(2) ?? "—"} />
          <Stat label="Head (35%)" value={overall.manager?.toFixed(2) ?? "—"} />
          <Stat label="Overall" value={overall.overall?.toFixed(1) ?? "—"} big />
        </div>
        {overall.overall == null && (
          <div className="text-10.5 text-faint mt-8">Shown once all three sources have a closed round available.</div>
        )}
      </div>

      <SummaryCard title="Students say" summary={student} />
      <SummaryCard title="Peers say" summary={peer} />
      <SummaryCard title="Your head says" summary={manager} identified />
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-9.5 uppercase tracking-label text-faint font-semibold">{label}</div>
      <div className={`font-mono font-semibold mt-2 ${big ? "text-19" : "text-15"}`}>{value}</div>
    </div>
  );
}

type Summary = Awaited<ReturnType<typeof getSelfSummary>>;

function SummaryCard({ title, summary, identified }: { title: string; summary: Summary; identified?: boolean }) {
  if (!summary.hasData) {
    return (
      <div className="border border-border rounded-3 bg-panel px-14 py-12">
        <div className="text-12 font-semibold">{title}</div>
        <div className="text-10.5 text-faint mt-4">No closed round yet.</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-3 bg-panel px-14 py-12 flex flex-col gap-9">
      <div className="flex items-center gap-8 flex-wrap">
        <div className="text-12 font-semibold">{title}</div>
        <span className="text-10.5 text-faint">{summary.campaignName}</span>
        {identified && <Badge variant="warn">not anonymous</Badge>}
      </div>

      {summary.suppressed ? (
        <div className="text-11.5 text-warn">
          Suppressed — {summary.responseCount} of {summary.minResponses} required responses received.
        </div>
      ) : (
        <>
          <div className="flex gap-20 flex-wrap">
            <Stat label="Composite" value={summary.overallScore?.toFixed(1) ?? "—"} />
            {summary.percentile && (
              <Stat label="Colleagues' 25th–75th pct" value={`${summary.percentile.p25.toFixed(0)}–${summary.percentile.p75.toFixed(0)}`} />
            )}
            <Stat label="Responses" value={`${summary.responseCount}/${summary.askedCount}`} />
          </div>

          {summary.strongest.length > 0 && (
            <div className="text-11">
              <span className="text-faint">Strongest: </span>
              {summary.strongest.map((s) => `${s.title} (${s.score.toFixed(1)})`).join(", ")}
            </div>
          )}
          {summary.weakest.length > 0 && (
            <div className="text-11">
              <span className="text-faint">Weakest: </span>
              {summary.weakest.map((s) => `${s.title} (${s.score.toFixed(1)})`).join(", ")}
            </div>
          )}

          {summary.history.length > 1 && (
            <div className="text-10.5 text-dim font-mono">
              History: {summary.history.map((h) => `${h.label} ${h.suppressed ? "—" : (h.score?.toFixed(0) ?? "—")}`).join("  ·  ")}
            </div>
          )}

          {summary.comments.length > 0 && (
            <details>
              <summary className="cursor-pointer text-11 text-accent">{summary.comments.length} comments</summary>
              <div className="mt-6 flex flex-col gap-4">
                {summary.comments.map((c, i) => (
                  <div key={i} className="text-11 leading-relaxed border-t border-border pt-4">
                    {c}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
