"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HierarchyNodeRow } from "@/server/hierarchy/hierarchy";
import { reassignParentsAction } from "@/actions/hierarchy";
import { NODE_TYPE_LABELS, groupByLevel } from "@/components/manage/nodeTypeShared";

/**
 * Structure — purely the tree shape (reparenting). Create/rename/assign-head/
 * deactivate/delete/level all live on the type-specific pages. Ported from v1's
 * StructurePage.tsx: native HTML5 drag-and-drop rather than a hand-positioned canvas —
 * a level-banded list is the honest equivalent of a graph editor here, since the
 * hierarchy is only ever a few hundred nodes across ~4 levels, and a real force-directed
 * canvas is a large effort sink for a screen used a few times a year. Drag a node onto a
 * node one level above to replace its parent; hold Shift while dropping to ADD it as an
 * additional parent instead (the cross-cutting case — e.g. a department reporting to
 * both its college and QA).
 */
export default function StructureClient({ allNodes }: { allNodes: HierarchyNodeRow[] }) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = useMemo(() => allNodes.filter((n) => n.active), [allNodes]);
  const byLevel = groupByLevel(active);
  const byId = useMemo(() => new Map(active.map((n) => [n.id, n])), [active]);

  function onDrop(targetId: string, additive: boolean) {
    if (!dragId || dragId === targetId) return;
    const drag = byId.get(dragId);
    const target = byId.get(targetId);
    if (!drag || !target) return;
    if (target.level !== drag.level - 1) {
      setError(`${target.name} is level ${target.level} — ${drag.name} needs a level ${drag.level - 1} parent`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await reassignParentsAction({ nodeId: drag.id, parentIds: [target.id], additive });
      if (!res.ok) setError(res.error ?? "Could not reparent");
      else router.refresh();
    });
  }

  return (
    <div className="p-16">
      <div className="text-10.5 text-dim mb-12 leading-relaxed">
        Drag a node onto a node one level above it to set that as its parent. Hold <b>Shift</b> while dropping to add
        it as an <b>additional</b> parent instead of replacing — the cross-cutting case (e.g. a department reporting
        to both its college and Quality Assurance).
      </div>
      {error && <div className="text-11 text-bad mb-10">{error}</div>}
      {pending && <div className="text-10.5 text-faint mb-10">Saving…</div>}

      <div className="flex gap-16 overflow-x-auto pb-16">
        {byLevel.map(([level, nodes]) => (
          <div key={level} className="w-220 flex-none">
            <div className="text-9.5 uppercase tracking-label text-faint font-semibold mb-6">Level {level}</div>
            <div className="flex flex-col gap-6">
              {nodes.map((n) => {
                const parentNames = n.parentIds.map((id) => byId.get(id)?.name ?? "?");
                return (
                  <div
                    key={n.id}
                    draggable
                    onDragStart={() => setDragId(n.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(n.id, e.shiftKey);
                    }}
                    style={{ opacity: dragId === n.id ? 0.4 : 1 }}
                    className="border border-border2 bg-panel rounded-3 px-9 py-7 cursor-grab"
                  >
                    <div className="text-11 font-medium">{n.name}</div>
                    <div className="text-9.5 text-faint mt-2">{NODE_TYPE_LABELS[n.type]}</div>
                    {parentNames.length > 0 && (
                      <div className="text-9.5 text-dim mt-3 leading-snug">under {parentNames.join(", ")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
