"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { HierarchyNodeRow } from "@/server/hierarchy/hierarchy";
import {
  assignHeadAction,
  changeTypeAction,
  deactivateNodeAction,
  deleteNodeAction,
  reactivateNodeAction,
  reassignParentsAction,
  renameNodeAction,
  resendInvitationAction,
  revokeAccessAction,
} from "@/actions/hierarchy";
import type { ActionResult } from "@/actions/auth";
import { CreateNodeForm, NODE_TYPE_LABELS, STATUS_BADGE } from "@/components/manage/nodeTypeShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Org Studio — the whole org chart on one canvas, with an inspector for the selected node.
 * Ported from the sister lab-resource system's OrgStudioPage, and replacing five separate
 * admin screens here (Structure's level-banded drag-and-drop plus the Personnel / Offices /
 * Colleges / Departments lists).
 *
 * Why a canvas rather than the level bands it replaces: the hierarchy is a DAG, not a tree
 * — CSE reports to BOTH its College and the cross-cutting Quality Assurance directorate.
 * A list can only ever print "under X, Y" as text; the two edges are the thing an admin
 * actually needs to see and get right, because every rollup in Analyse is computed over
 * them.
 *
 * It calls no new server code. `listGraph()` already returns parents, occupant registration
 * state and personnel counts on every row, and every mutation below is an existing action
 * from actions/hierarchy.ts.
 *
 * One deliberate departure from the ported original: there, a node's occupant is picked
 * from a list of existing people. Here `assignHead` INVITES — the occupant of a node is a
 * manager account that comes into being with the node — so the inspector keeps this app's
 * name+email form and its resend/revoke states.
 */

const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;
const initialState: ActionResult = { ok: true };

interface CardData extends Record<string, unknown> {
  node: HierarchyNodeRow;
  selected: boolean;
}

function OrgNodeCard({ data }: NodeProps<Node<CardData>>) {
  const { node, selected } = data;
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`rounded-3 border px-10 py-8 text-left bg-panel ${selected ? "border-accent" : "border-border2"} ${
        node.active ? "" : "opacity-50"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border2" />
      <Handle type="source" position={Position.Bottom} className="!bg-border2" />
      <div className="text-11.5 font-medium leading-tight">{node.name}</div>
      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <Badge>{NODE_TYPE_LABELS[node.type].toLowerCase()}</Badge>
        <Badge>L{node.level}</Badge>
        {!node.active && <Badge variant="bad">inactive</Badge>}
      </div>
      <div className="mt-4 text-9.5 text-faint truncate">
        {node.occupant ? node.occupant.name : "headless"}
      </div>
      <div className="mt-2 text-9.5 text-faint font-mono">
        {node.teacherCount}T · {node.studentCount}S
      </div>
    </div>
  );
}

const nodeTypes = { orgNode: OrgNodeCard };

function layout(nodes: HierarchyNodeRow[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 90 });
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const n of nodes) for (const p of n.parentIds) if (nodes.some((x) => x.id === p)) g.setEdge(p, n.id);
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const laid = g.node(n.id);
    positions.set(n.id, laid ? { x: laid.x - NODE_WIDTH / 2, y: laid.y - NODE_HEIGHT / 2 } : { x: 0, y: 0 });
  }
  return positions;
}

type TypeFilter = "ALL" | "OFFICE" | "COLLEGE" | "DEPARTMENT";

export default function StructureStudioClient({ allNodes }: { allNodes: HierarchyNodeRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [query, setQuery] = useState("");
  const [vacantOnly, setVacantOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const selected = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  // The canvas shows the structure; hiding inactive nodes is a view choice, but an
  // inactive node with children still has to render or its edges vanish into nothing.
  const canvasNodes = useMemo(
    () => (showInactive ? allNodes : allNodes.filter((n) => n.active || n.childCount > 0)),
    [allNodes, showInactive],
  );

  const listNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allNodes
      .filter((n) => (showInactive ? true : n.active))
      .filter((n) => (typeFilter === "ALL" ? true : n.type === typeFilter))
      .filter((n) => (vacantOnly ? !n.occupant : true))
      .filter((n) => (q ? n.name.toLowerCase().includes(q) || (n.occupant?.name.toLowerCase().includes(q) ?? false) : true))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [allNodes, query, showInactive, typeFilter, vacantOnly]);

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  const flowNodes: Node<CardData>[] = useMemo(() => {
    const positions = layout(canvasNodes);
    return canvasNodes.map((n) => ({
      id: n.id,
      type: "orgNode",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { node: n, selected: n.id === selectedId },
    }));
  }, [canvasNodes, selectedId]);

  const flowEdges: Edge[] = useMemo(() => {
    const visible = new Set(canvasNodes.map((n) => n.id));
    return canvasNodes.flatMap((n) =>
      n.parentIds
        .filter((p) => visible.has(p))
        .map((p) => ({
          id: `${p}-${n.id}`,
          source: p,
          target: n.id,
          // Highlighted rather than merely present: a node with two parents is the case the
          // whole DAG design exists for, and it should be visible at a glance.
          style: {
            stroke: n.parentIds.length > 1 ? "var(--accent)" : "var(--border2)",
            strokeWidth: n.parentIds.length > 1 ? 2 : 1,
          },
        })),
    );
  }, [canvasNodes]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-8 px-12 py-7 border-b border-border bg-panel2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setShowNewForm((v) => !v)}>
          {showNewForm ? "Cancel" : "+ New node"}
        </Button>
        <Select aria-label="Filter by node type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} className="w-130 h-22">
          <option value="ALL">All types</option>
          <option value="OFFICE">Offices</option>
          <option value="COLLEGE">Colleges</option>
          <option value="DEPARTMENT">Departments</option>
        </Select>
          <Input aria-label="Search node or head" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search node or head…" className="w-190 h-22" />
        <label className="flex items-center gap-4 text-10.5 text-dim">
          <Checkbox checked={vacantOnly} onChange={(e) => setVacantOnly(e.target.checked)} />
          vacant only
        </label>
        <label className="flex items-center gap-4 text-10.5 text-dim">
          <Checkbox checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          show inactive
        </label>
        <div className="flex-1" />
        <span className="text-10 text-faint font-mono">
          {allNodes.filter((n) => n.occupant).length} assigned · {allNodes.filter((n) => !n.occupant).length} vacant ·{" "}
          {allNodes.length} nodes
        </span>
      </div>

      {showNewForm && (
        <CreateNodeForm
          allNodes={allNodes}
          onDone={() => {
            setShowNewForm(false);
            router.refresh();
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {error && <div className="px-14 py-8 text-11 text-bad border-b border-border">{error}</div>}

      <div className="flex" style={{ height: 620 }}>
        <div className="flex-1 border-r border-border min-w-0">
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_e, n) => setSelectedId(n.id)}
              fitView
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <div className="w-330 flex-none overflow-y-auto">
          {selected ? (
            <Inspector
              key={selected.id}
              node={selected}
              allNodes={allNodes}
              pending={pending}
              run={run}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="px-14 py-14 flex flex-col gap-8">
              <div className="text-11.5 text-faint">Select a node on the map, or a row below, to inspect it.</div>
              <div className="text-10.5 text-dim leading-relaxed">
                An accent-coloured edge marks a node with more than one parent — a department that
                reports to both its college and a cross-cutting directorate. Both paths are real, and
                every rollup in Analyse is computed over them.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="px-14 py-7 text-9.5 uppercase tracking-caps text-faint border-b border-border bg-panel2">
          {listNodes.length} node{listNodes.length === 1 ? "" : "s"}
        </div>
        {listNodes.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelectedId(n.id)}
            style={{ background: n.id === selectedId ? "var(--soft)" : undefined }}
            className={`w-full text-left border-b border-border px-14 py-8 flex items-center gap-10 flex-wrap hover:bg-panel2 ${
              n.active ? "" : "opacity-60"
            }`}
          >
            <span className="w-90 flex-none text-9.5 uppercase tracking-caps text-faint">
              {NODE_TYPE_LABELS[n.type]} · L{n.level}
            </span>
            <span className="flex-1 min-w-140 text-12">{n.name}</span>
            <span className="text-10.5 font-mono text-dim">
              {n.teacherCount}T · {n.studentCount}S · {n.childCount}C
            </span>
            {n.occupant ? (
              <span className="flex items-center gap-5">
                <Badge variant={STATUS_BADGE[n.occupant.status]}>{n.occupant.status}</Badge>
                <span className="text-10.5">{n.occupant.name}</span>
              </span>
            ) : (
              <Badge>unassigned</Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Inspector({
  node,
  allNodes,
  pending,
  run,
  onClose,
}: {
  node: HierarchyNodeRow;
  allNodes: HierarchyNodeRow[];
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  onClose: () => void;
}) {
  const [assignForm, setAssignForm] = useState(false);
  const [renameForm, setRenameForm] = useState(false);
  const parents = node.parentIds.map((id) => allNodes.find((n) => n.id === id)?.name ?? "?");

  return (
    <div className="flex flex-col gap-12 px-14 py-12">
      <div>
        <div className="flex items-start gap-8">
          <div className="text-13 font-medium flex-1">{node.name}</div>
          <button onClick={onClose} className="text-10 text-faint">
            ✕
          </button>
        </div>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <Badge>{NODE_TYPE_LABELS[node.type].toLowerCase()}</Badge>
          <Badge>level {node.level}</Badge>
          <Badge variant={node.active ? "good" : "bad"}>{node.active ? "active" : "inactive"}</Badge>
        </div>
        <div className="mt-5 text-10.5 text-dim font-mono">
          {node.teacherCount} teachers · {node.studentCount} students · {node.childCount} children
        </div>
        {parents.length > 0 && <div className="mt-3 text-10.5 text-faint">under {parents.join(", ")}</div>}
      </div>

      <div>
        <div className="text-9.5 uppercase tracking-caps text-faint font-semibold mb-5">Head</div>
        {node.occupant ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-6">
              <Badge variant={STATUS_BADGE[node.occupant.status]}>{node.occupant.status}</Badge>
              <span className="text-11">{node.occupant.name}</span>
            </div>
            <div className="text-10 text-faint break-all">{node.occupant.email}</div>
            {node.occupant.statusDetail && <div className="text-10 text-faint">{node.occupant.statusDetail}</div>}
            <div className="flex gap-6">
              {node.occupant.status !== "registered" && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendInvitationAction(node.id))}>
                  Resend invitation
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => revokeAccessAction(node.id))}>
                Revoke access
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-10.5 text-faint">Vacant — no one can sign in for this node.</div>
            <Button size="sm" variant="outline" onClick={() => setAssignForm((v) => !v)}>
              {assignForm ? "Cancel" : "Assign a head"}
            </Button>
            {assignForm && (
              <form action={(fd) => run(async () => assignHeadAction(initialState, fd))} className="flex flex-col gap-6">
                <input type="hidden" name="nodeId" value={node.id} />
                <div>
                  <Label>Name</Label>
                  <Input name="name" required className="mt-3" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="email" type="email" required className="mt-3" />
                </div>
                <Button type="submit" size="sm" disabled={pending}>
                  Invite
                </Button>
              </form>
            )}
          </div>
        )}
      </div>

      {node.level > 0 && <ParentsEditor node={node} allNodes={allNodes} pending={pending} run={run} />}

      <div>
        <div className="text-9.5 uppercase tracking-caps text-faint font-semibold mb-5">Type</div>
        <Select
          aria-label="Node type"
          value={node.type}
          disabled={pending}
          onChange={(e) => run(() => changeTypeAction(node.id, e.target.value as "OFFICE" | "COLLEGE" | "DEPARTMENT"))}
        >
          <option value="OFFICE">Office</option>
          <option value="COLLEGE">College</option>
          <option value="DEPARTMENT">Department</option>
        </Select>
        <div className="mt-3 text-9.5 text-faint leading-snug">
          Independent of level — Quality Assurance is an Office sitting alongside the Colleges. Only a
          Department gets a roster and can run a campaign.
        </div>
      </div>

      <div>
        <Button size="sm" variant="outline" onClick={() => setRenameForm((v) => !v)}>
          {renameForm ? "Cancel rename" : "Rename"}
        </Button>
        {renameForm && (
          <form action={(fd) => run(async () => renameNodeAction(initialState, fd))} className="mt-6 flex flex-col gap-6">
            <input type="hidden" name="nodeId" value={node.id} />
            <Input name="name" required defaultValue={node.name} />
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
          </form>
        )}
      </div>

      <div className="flex items-center gap-8 pt-8 border-t border-border">
        {node.active ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deactivateNodeAction(node.id))}>
            Deactivate
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => run(() => reactivateNodeAction(node.id))}>
            Reactivate
          </Button>
        )}
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteNodeAction(node.id))}>
          Delete
        </Button>
      </div>
      <div className="text-9.5 text-faint leading-snug">
        Deactivating revokes the head&rsquo;s access and hides the node from new activity; history is
        untouched. Deleting is only possible once the node owns nothing at all.
      </div>
    </div>
  );
}

/**
 * Parents must sit exactly one level above — assertAdjacentParents enforces it server-side,
 * but filtering the candidates to `level - 1` here means an invalid combination cannot even
 * be selected, rather than being picked and then rejected.
 */
function ParentsEditor({
  node,
  allNodes,
  pending,
  run,
}: {
  node: HierarchyNodeRow;
  allNodes: HierarchyNodeRow[];
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [draft, setDraft] = useState<string[]>(node.parentIds);
  useEffect(() => setDraft(node.parentIds), [node.id, node.parentIds]);

  const candidates = allNodes.filter((n) => n.level === node.level - 1 && n.active);
  const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...node.parentIds].sort());

  return (
    <div>
      <div className="text-9.5 uppercase tracking-caps text-faint font-semibold mb-5">
        Parent(s) — level {node.level - 1}
      </div>
      {candidates.length === 0 ? (
        <div className="text-10.5 text-faint">No active node exists at level {node.level - 1} yet.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {candidates.map((n) => (
            <label key={n.id} className="flex items-center gap-5 text-10.5">
              <Checkbox
                checked={draft.includes(n.id)}
                onChange={() => setDraft((prev) => (prev.includes(n.id) ? prev.filter((p) => p !== n.id) : [...prev, n.id]))}
              />
              {n.name}
            </label>
          ))}
        </div>
      )}
      {dirty && (
        <div className="mt-6">
          <Button
            size="sm"
            disabled={pending || draft.length === 0}
            onClick={() => run(() => reassignParentsAction({ nodeId: node.id, parentIds: draft }))}
          >
            Save parents
          </Button>
        </div>
      )}
    </div>
  );
}
