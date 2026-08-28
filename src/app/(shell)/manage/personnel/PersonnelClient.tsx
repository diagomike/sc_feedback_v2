"use client";

import { useMemo } from "react";
import type { HierarchyNodeRow } from "@/server/hierarchy/hierarchy";
import { NodeRow, NODE_TYPE_LABELS } from "@/components/manage/nodeTypeShared";

/** Every node's occupant across the whole graph, organized by PERSON rather than by
 *  node — "who did I invite / who's still vacant" as one screen. Assigned nodes first,
 *  then vacant. Ported from v1's PersonnelPage.tsx (reuses the same node payload and
 *  actions as the type-specific pages — no separate API surface). */
export default function PersonnelClient({ allNodes }: { allNodes: HierarchyNodeRow[] }) {
  const sorted = useMemo(
    () =>
      [...allNodes].sort((a, b) => {
        if (!!a.occupant !== !!b.occupant) return a.occupant ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [allNodes],
  );

  return (
    <div>
      <div className="px-14 py-9 border-b border-border bg-panel2 text-10.5 text-dim">
        {allNodes.filter((n) => n.occupant).length} assigned · {allNodes.filter((n) => !n.occupant).length} vacant ·{" "}
        {allNodes.length} total nodes
      </div>
      {sorted.map((n) => (
        <div key={n.id} className="flex items-start">
          <div className="w-100 flex-none px-14 py-10 text-9.5 uppercase tracking-caps text-faint border-b border-r border-border">
            {NODE_TYPE_LABELS[n.type]} · L{n.level}
          </div>
          <div className="flex-1 min-w-0">
            <NodeRow node={n} allNodes={allNodes} />
          </div>
        </div>
      ))}
    </div>
  );
}
