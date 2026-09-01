import { requireUser } from "@/server/auth/session";
import {
  listAnalyticsCampaigns,
  listTeachers,
  getDashboard,
  getCourseBreakdown,
  type CourseBreakdownRow,
} from "@/server/analytics/analytics";
import SelectNav from "@/components/analyse/SelectNav";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string; teacherId?: string; targetGroup?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const campaigns = await listAnalyticsCampaigns(user.id);
  if (campaigns.length === 0) {
    return <div className="p-24 text-11.5 text-faint">No campaign results are visible in your scope yet.</div>;
  }
  const campaignId = sp.campaignId ?? campaigns[0].id;
  const campaign = campaigns.find((c) => c.id === campaignId) ?? campaigns[0];
  const targetGroup = (sp.targetGroup as "STUDENT" | "PEER" | "MANAGER" | undefined) ?? campaign.targetGroups[0];

  if (sp.teacherId && targetGroup) {
    const [dashboard, courses] = await Promise.all([
      getDashboard({ campaignId: campaign.id, teacherId: sp.teacherId, targetGroup, requestingUserId: user.id }),
      getCourseBreakdown({ campaignId: campaign.id, teacherId: sp.teacherId, targetGroup, requestingUserId: user.id }),
    ]);
    return (
      <TeacherDashboard
        campaigns={campaigns}
        campaignId={campaign.id}
        dashboard={dashboard}
        courses={courses}
        targetGroup={targetGroup}
      />
    );
  }

  const teachers = await listTeachers({ campaignId: campaign.id, requestingUserId: user.id });

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-10 flex-wrap">
        <SelectNav param="campaignId" value={campaign.id} options={campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.semesterLabel})` }))} className="w-320" />
        {campaign.targetGroups.length > 1 && (
          <SelectNav param="targetGroup" value={targetGroup} options={campaign.targetGroups.map((g) => ({ value: g, label: g }))} className="w-140" />
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Teacher</TableHead>
            {campaign.targetGroups.map((g) => (
              <TableHead key={g}>{g}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map((t) => (
            <TableRow key={t.teacherId}>
              <TableCell className="font-medium">{t.name}</TableCell>
              {campaign.targetGroups.map((g) => {
                const grp = t.groups.find((x) => x.targetGroup === g);
                if (!grp) return <TableCell key={g}>—</TableCell>;
                return (
                  <TableCell key={g}>
                    {grp.suppressed ? (
                      <Badge variant="warn">suppressed ({grp.responded}/{grp.minResponses})</Badge>
                    ) : (
                      <Link href={`/analyse/results?campaignId=${campaign.id}&teacherId=${t.teacherId}&targetGroup=${g}`} className="font-mono text-text hover:text-accent">
                        {grp.score != null ? grp.score.toFixed(1) : "—"}
                      </Link>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
type CampaignRow = Awaited<ReturnType<typeof listAnalyticsCampaigns>>[number];

function TeacherDashboard({
  campaigns,
  campaignId,
  dashboard,
  courses,
  targetGroup,
}: {
  campaigns: CampaignRow[];
  campaignId: string;
  dashboard: Dashboard;
  courses: CourseBreakdownRow[];
  targetGroup: string;
}) {
  return (
    <div className="p-16 flex flex-col gap-14 max-w-1000">
      <Link href={`/analyse/results?campaignId=${campaignId}`} className="text-11 text-accent w-fit">
        ← Back to teacher list
      </Link>

      <div className="flex items-center gap-12 flex-wrap">
        <div className="text-17 font-semibold">{dashboard.teacherName}</div>
        <Badge>{targetGroup}</Badge>
        <span className="text-10.5 text-dim">{dashboard.campaignName}</span>
      </div>

      {dashboard.suppressed ? (
        <div className="border border-warn rounded-3 bg-warnbg px-14 py-12 text-12">
          Suppressed — {dashboard.responseCount} of {dashboard.minResponses} required responses received. No score, breakdown, or comments are shown below this threshold.
        </div>
      ) : (
        <>
          <div className="flex gap-24 flex-wrap">
            <Stat label="Composite" value={dashboard.overallScore?.toFixed(1) ?? "—"} />
            <Stat label="Self-rated overall" value={dashboard.selfRatedOverall?.toFixed(1) ?? "—"} />
            <Stat label="Department avg" value={dashboard.departmentAverage?.toFixed(1) ?? "—"} />
            <Stat label="Faculty avg" value={dashboard.facultyAverage?.value.toFixed(1) ?? "—"} />
            <Stat label="Responses" value={`${dashboard.responseRate.responded}/${dashboard.responseRate.asked}`} />
          </div>

          {dashboard.overallScore != null && dashboard.selfRatedOverall != null && Math.abs(dashboard.overallScore - dashboard.selfRatedOverall) > 15 && (
            <div className="border border-border rounded-3 bg-soft px-14 py-10 text-11.5">
              Composite and self-rated overall diverge by {Math.abs(dashboard.overallScore - dashboard.selfRatedOverall).toFixed(1)} points.
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Dept avg</TableHead>
                <TableHead>Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.sections.map((s) => (
                <TableRow key={s.sectionId}>
                  <TableCell className="font-medium">
                    {s.title} {s.isOverall && <span className="text-10 text-faint">(holistic)</span>}
                  </TableCell>
                  <TableCell className="font-mono">{s.score != null ? s.score.toFixed(1) : "—"}</TableCell>
                  <TableCell className="font-mono">{s.departmentAverage != null ? s.departmentAverage.toFixed(1) : "—"}</TableCell>
                  <TableCell className="font-mono text-10.5">{s.distribution ? s.distribution.join(" · ") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {courses.length > 0 && (
            <div>
              <div className="text-11 font-semibold mb-6">By course</div>
              <div className="text-10.5 text-faint mb-6 leading-relaxed">
                The same responses, split by the course each one was about. Min-N is applied per course,
                not once for the teacher &mdash; a small elective stays suppressed even when the
                teacher&rsquo;s overall count clears the gate.
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Responses</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.offeringId}>
                      <TableCell className="font-medium">
                        {c.courseTitle} <span className="font-mono text-10 text-faint">{c.courseCode}</span>
                      </TableCell>
                      <TableCell className="text-10.5">{c.sectionName}</TableCell>
                      <TableCell className="font-mono text-10.5">
                        {c.responseCount}/{c.asked}
                      </TableCell>
                      <TableCell className="font-mono">
                        {c.suppressed ? <span className="text-faint">suppressed</span> : (c.score?.toFixed(1) ?? "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {dashboard.comments.length > 0 && (
            <div>
              <div className="text-11 font-semibold mb-6">Comments ({dashboard.comments.length})</div>
              <div className="flex flex-col gap-6">
                {dashboard.comments.map((c, i) => (
                  <div key={i} className="border border-border rounded-3 bg-panel2 px-11 py-8 text-11.5 leading-relaxed">
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-9.5 uppercase tracking-label text-faint font-semibold">{label}</div>
      <div className="font-mono text-15 font-semibold mt-2">{value}</div>
    </div>
  );
}
