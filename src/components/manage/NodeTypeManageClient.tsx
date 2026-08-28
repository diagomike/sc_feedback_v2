"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HierarchyNodeRow } from "@/server/hierarchy/hierarchy";
import { CreateNodeForm, NodeRow, groupByLevel, NODE_TYPE_LABELS } from "./nodeTypeShared";
import { Button } from "@/components/ui/button";

/** The generic page behind Offices/Colleges/Departments — same list-and-manage screen,
 *  just pre-filtered to one NodeType and with the create form's type preset.
 *  Reparenting lives on the Structure page (drag-and-drop across the whole graph); this
 *  page only handles nodes of its own type. Ported from v1's NodeTypeManagePage.tsx. */
export default function NodeTypeManageClient({
  type,
  allNodes,
}: {
  type: "OFFICE" | "COLLEGE" | "DEPARTMENT";
  allNodes: HierarchyNodeRow[];
}) {
  const router = useRouter();
  const label = NODE_TYPE_LABELS[type];
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"active" | "all">("active");

  const ofType = useMemo(() => allNodes.filter((n) => n.type === type), [allNodes, type]);
  const activeOfType = useMemo(() => ofType.filter((n) => n.active), [ofType]);
  const displayed = tab === "active" ? activeOfType : ofType;
  const byLevel = groupByLevel(displayed);
  const inactiveCount = ofType.length - activeOfType.length;

  function reload() {
    setShowForm(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-8 px-12 py-7 border-b border-border bg-panel2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          + {label}
        </Button>
        <div className="flex-1" />
        <div className="flex items-center border border-border2 rounded-3 overflow-hidden">
          <button
            onClick={() => setTab("active")}
            style={{ background: tab === "active" ? "var(--sel)" : "transparent", color: tab === "active" ? "var(--accent)" : "var(--dim)" }}
            className="h-23 px-10 text-11 font-medium"
          >
            Active
          </button>
          <button
            onClick={() => setTab("all")}
            style={{ background: tab === "all" ? "var(--sel)" : "transparent", color: tab === "all" ? "var(--accent)" : "var(--dim)" }}
            className="h-23 px-10 text-11 font-medium border-l border-border2"
          >
            All{inactiveCount > 0 ? ` (${inactiveCount} inactive)` : ""}
          </button>
        </div>
      </div>

      {showForm && <CreateNodeForm fixedType={type} allNodes={allNodes} onDone={reload} onCancel={() => setShowForm(false)} />}

      {byLevel.length === 0 ? (
        <div className="p-24 text-11.5 text-dim">
          {tab === "active" ? `No active ${label.toLowerCase()}s — switch to All, or reactivate one.` : `No ${label.toLowerCase()}s yet.`}
        </div>
      ) : (
        byLevel.map(([level, nodes]) => (
          <div key={level}>
            <div className="px-14 pt-10 pb-4 text-10 font-semibold uppercase tracking-widest text-dim border-b border-border bg-panel2">
              Level {level}
            </div>
            {nodes.map((n) => (
              <NodeRow key={n.id} node={n} allNodes={allNodes} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
