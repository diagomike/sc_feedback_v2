import { requireUser } from "@/server/auth/session";
import { listScopeSemesters, getScopeRollup } from "@/server/analytics/analytics";
import SelectNav from "@/components/analyse/SelectNav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TARGET_GROUPS = ["STUDENT", "PEER", "MANAGER"] as const;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ targetGroup?: string; a?: string; b?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const targetGroup = (sp.targetGroup as (typeof TARGET_GROUPS)[number]) ?? "STUDENT";

  const semesters = await listScopeSemesters({ targetGroup, requestingUserId: user.id });
  const semesterA = sp.a ?? semesters[0]?.semesterId;
  const semesterB = sp.b ?? semesters[1]?.semesterId;

  if (!semesterA || !semesterB) {
    return <div className="p-24 text-11.5 text-faint">Need at least two {targetGroup.toLowerCase()} rounds in your scope to compare.</div>;
  }

  const [rollupA, rollupB] = await Promise.all([
    getScopeRollup({ targetGroup, semesterId: semesterA, requestingUserId: user.id }),
    getScopeRollup({ targetGroup, semesterId: semesterB, requestingUserId: user.id }),
  ]);

  const labelA = semesters.find((s) => s.semesterId === semesterA)?.label ?? "—";
  const labelB = semesters.find((s) => s.semesterId === semesterB)?.label ?? "—";

  const nodesById = new Map<string, { name: string; level: number }>();
  for (const r of [...rollupA.rows, ...rollupB.rows]) nodesById.set(r.nodeId, { name: r.name, level: r.level });
  const compositeByNode = new Map<string, { a: number | null; b: number | null }>();
  for (const r of rollupA.rows) compositeByNode.set(r.nodeId, { a: r.composite, b: null });
  for (const r of rollupB.rows) compositeByNode.set(r.nodeId, { a: compositeByNode.get(r.nodeId)?.a ?? null, b: r.composite });

  return (
    <div className="p-16 flex flex-col gap-16">
      <div className="flex items-center gap-10 flex-wrap">
        <SelectNav param="targetGroup" value={targetGroup} options={TARGET_GROUPS.map((g) => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() }))} className="w-140" />
        <span className="text-10.5 text-faint">vs</span>
        <SelectNav param="a" value={semesterA} options={semesters.map((s) => ({ value: s.semesterId, label: s.label }))} className="w-160" />
        <span className="text-10.5 text-faint">compared to</span>
        <SelectNav param="b" value={semesterB} options={semesters.map((s) => ({ value: s.semesterId, label: s.label }))} className="w-160" />
      </div>

      <div className="flex gap-24 text-11.5">
        <div>
          <div className="text-9.5 uppercase tracking-label text-faint font-semibold">{labelA} composite</div>
          <div className="font-mono text-15 font-semibold mt-2">{rollupA.scopeComposite?.toFixed(1) ?? "—"}</div>
        </div>
        <div>
          <div className="text-9.5 uppercase tracking-label text-faint font-semibold">{labelB} composite</div>
          <div className="font-mono text-15 font-semibold mt-2">{rollupB.scopeComposite?.toFixed(1) ?? "—"}</div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Branch</TableHead>
            <TableHead>{labelA}</TableHead>
            <TableHead>{labelB}</TableHead>
            <TableHead>Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...nodesById.entries()].map(([nodeId, node]) => {
            const c = compositeByNode.get(nodeId)!;
            const delta = c.a != null && c.b != null ? c.b - c.a : null;
            return (
              <TableRow key={nodeId}>
                <TableCell className="font-medium">{node.name}</TableCell>
                <TableCell className="font-mono">{c.a != null ? c.a.toFixed(1) : "absent"}</TableCell>
                <TableCell className="font-mono">{c.b != null ? c.b.toFixed(1) : "absent"}</TableCell>
                <TableCell className={`font-mono ${delta != null && delta < 0 ? "text-bad" : delta != null && delta > 0 ? "text-good" : "text-faint"}`}>
                  {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
