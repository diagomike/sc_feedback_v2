import { requireUser } from "@/server/auth/session";
import { listScopeSemesters, getScopeRollup } from "@/server/analytics/analytics";
import SelectNav from "@/components/analyse/SelectNav";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TARGET_GROUPS = ["STUDENT", "PEER", "MANAGER"] as const;

export default async function ScopeOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ targetGroup?: string; semesterId?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const targetGroup = (sp.targetGroup as (typeof TARGET_GROUPS)[number]) ?? "STUDENT";

  const semesters = await listScopeSemesters({ targetGroup, requestingUserId: user.id });
  const semesterId = sp.semesterId ?? semesters[0]?.semesterId;

  if (!semesterId) {
    return <div className="p-24 text-11.5 text-faint">No {targetGroup.toLowerCase()} campaigns have run in your scope yet.</div>;
  }

  const rollup = await getScopeRollup({ targetGroup, semesterId, requestingUserId: user.id });

  return (
    <div className="p-16 flex flex-col gap-16">
      <div className="flex items-center gap-10 flex-wrap">
        <SelectNav
          param="targetGroup"
          value={targetGroup}
          options={TARGET_GROUPS.map((g) => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() }))}
          className="w-140"
        />
        <SelectNav
          param="semesterId"
          value={semesterId}
          options={semesters.map((s) => ({ value: s.semesterId, label: s.label }))}
          className="w-160"
        />
      </div>

      <div className="flex gap-20 flex-wrap text-11.5">
        <Stat label="Scope composite" value={rollup.scopeComposite != null ? rollup.scopeComposite.toFixed(1) : "—"} />
        <Stat label="Responses" value={String(rollup.responseCount)} />
        <Stat label="Coverage past min-N" value={`${rollup.coverage.pastMinN} / ${rollup.coverage.total}`} />
        <Stat label="Divergent gaps" value={String(rollup.gapCount)} />
      </div>

      {rollup.weakestCompetency && (
        <div className="border border-border rounded-3 bg-panel2 px-14 py-10 text-11.5">
          Weakest competency across scope: <span className="font-semibold">{rollup.weakestCompetency.title}</span>{" "}
          <span className="font-mono">{rollup.weakestCompetency.score.toFixed(1)}</span>
          <span className="text-10.5 text-faint ml-6">{rollup.weakestCompetency.note}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <OutlierList title="Needs attention" items={rollup.outliersLow} tone="bad" />
        <OutlierList title="Strongest" items={rollup.outliersHigh} tone="good" />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Branch</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>N</TableHead>
            <TableHead>Composite</TableHead>
            {rollup.competencies.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
            <TableHead>Campaign</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rollup.rows.map((r) => (
            <RowWithContributors key={r.nodeId} row={r} />
          ))}
        </TableBody>
      </Table>
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

function OutlierList({ title, items, tone }: { title: string; items: { name: string; where: string; why: string; score: number }[]; tone: "good" | "bad" }) {
  return (
    <div className="border border-border rounded-3 bg-panel">
      <div className="px-12 py-8 border-b border-border text-11 font-semibold">{title}</div>
      {items.length === 0 ? (
        <div className="px-12 py-10 text-10.5 text-faint">Not enough data yet.</div>
      ) : (
        items.map((o, i) => (
          <div key={i} className="flex items-center gap-8 px-12 py-7 border-b border-border last:border-b-0 text-11">
            <span className="flex-1">
              {o.name} <span className="text-10 text-faint">· {o.where}</span>
            </span>
            <span className="text-10.5 text-dim">{o.why}</span>
            <Badge variant={tone}>{o.score.toFixed(1)}</Badge>
          </div>
        ))
      )}
    </div>
  );
}

interface Row {
  nodeId: string;
  name: string;
  level: number;
  n: number;
  composite: number | null;
  cells: { title: string; score: number | null }[];
  campaignName: string | null;
  contributors: { nodeId: string; name: string; templateTitle: string; campaignName: string; score: number }[];
}

function RowWithContributors({ row }: { row: Row }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="font-mono">{row.level}</TableCell>
      <TableCell className="font-mono">{row.n}</TableCell>
      <TableCell className="font-mono font-semibold">{row.composite != null ? row.composite.toFixed(1) : "—"}</TableCell>
      {row.cells.map((c) => (
        <TableCell key={c.title} className="font-mono">
          {c.score != null ? c.score.toFixed(1) : "—"}
        </TableCell>
      ))}
      <TableCell className="text-10.5 text-dim">
        {row.contributors.length > 1 ? (
          <details>
            <summary className="cursor-pointer text-accent">{row.contributors.length} contributors</summary>
            <div className="mt-4 flex flex-col gap-2">
              {row.contributors.map((c) => (
                <div key={c.nodeId}>
                  {c.name} — {c.campaignName} ({c.score.toFixed(1)})
                </div>
              ))}
            </div>
          </details>
        ) : (
          (row.campaignName ?? "—")
        )}
      </TableCell>
    </TableRow>
  );
}
