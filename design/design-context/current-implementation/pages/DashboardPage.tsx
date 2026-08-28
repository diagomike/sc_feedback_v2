import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DashboardDto } from "@sc-feedback/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) {
    return <div className="h-2 w-full rounded bg-slate-100" />;
  }
  return (
    <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded bg-slate-700"
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const campaignId = params.get("campaignId");
  const teacherId = params.get("teacherId");
  const targetGroup = params.get("targetGroup") ?? "STUDENT";

  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campaignId || !teacherId) return;
    setLoading(true);
    setError(null);
    api
      .get<DashboardDto>(
        `/analytics/dashboard?campaignId=${campaignId}&teacherId=${teacherId}&targetGroup=${targetGroup}`,
      )
      .then(setDashboard)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [campaignId, teacherId, targetGroup]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Feedback System</p>
          <p className="text-sm text-slate-700">Signed in as {user?.name}</p>
        </div>
        <button onClick={() => logout()} className="text-sm text-slate-500 hover:text-slate-900">
          Sign out
        </button>
      </header>

      <main className="max-w-3xl mx-auto py-10 px-4 space-y-6">
        {!campaignId || !teacherId ? (
          <div className="bg-white rounded-lg shadow p-6 text-sm text-slate-500">
            Open a dashboard link from the seed output (e.g.
            <code className="mx-1 bg-slate-100 px-1 rounded">?campaignId=...&amp;teacherId=...&amp;targetGroup=STUDENT</code>)
            to see a competency breakdown. Campaign/teacher picker UI comes in a later milestone.
          </div>
        ) : loading ? (
          <div className="text-slate-500">Loading...</div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-6 text-sm text-red-600">{error}</div>
        ) : dashboard ? (
          <>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-xs uppercase tracking-wide text-slate-400">{dashboard.campaignName}</p>
              <h1 className="text-xl font-semibold text-slate-900 mt-1">{dashboard.teacherName}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {dashboard.responseCount} response{dashboard.responseCount === 1 ? "" : "s"} (minimum{" "}
                {dashboard.minResponses} required to show results)
              </p>
            </div>

            {dashboard.suppressed ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-sm text-amber-800">
                Not enough responses yet to show results without risking anonymity. Results appear once
                at least {dashboard.minResponses} responses have been submitted.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-medium text-slate-900">Overall composite score</h2>
                    <span className="text-2xl font-semibold text-slate-900">
                      {dashboard.overallScore?.toFixed(1) ?? "-"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Weighted mean across competencies below (excludes the respondent's own overall rating,
                    shown separately for comparison).
                  </p>
                  {dashboard.selfRatedOverall != null && (
                    <p className="text-sm text-slate-600 mt-3">
                      Respondents' own overall rating:{" "}
                      <span className="font-medium">{dashboard.selfRatedOverall.toFixed(1)}</span>
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow p-6 space-y-4">
                  <h2 className="font-medium text-slate-900">Competency breakdown</h2>
                  {dashboard.sections
                    .filter((s) => !s.isOverall)
                    .map((s) => (
                      <div key={s.sectionId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-700">{s.title}</span>
                          <span className="text-slate-500">{s.score != null ? s.score.toFixed(1) : "-"}</span>
                        </div>
                        <ScoreBar score={s.score} />
                      </div>
                    ))}
                </div>

                {dashboard.comments.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="font-medium text-slate-900 mb-3">Comments</h2>
                    <ul className="space-y-2">
                      {dashboard.comments.map((c, i) => (
                        <li key={i} className="text-sm text-slate-600 border-l-2 border-slate-200 pl-3">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
