"use client";

import { useState, useTransition } from "react";
import type { HierarchyNodeRow } from "@/server/hierarchy/hierarchy";
import {
  createNodeAction,
  resendInvitationAction,
  revokeAccessAction,
  assignHeadAction,
  deactivateNodeAction,
  reactivateNodeAction,
  deleteNodeAction,
  renameNodeAction,
  changeLevelAction,
} from "@/actions/hierarchy";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const NODE_TYPE_LABELS: Record<string, string> = {
  OFFICE: "Office",
  COLLEGE: "College",
  DEPARTMENT: "Department",
};

export const STATUS_BADGE: Record<string, "good" | "warn" | "bad" | "default"> = {
  registered: "good",
  invited: "warn",
  expired: "bad",
};

/** Groups nodes by level, ascending — used by every type page and Personnel. */
export function groupByLevel(nodes: HierarchyNodeRow[]): [number, HierarchyNodeRow[]][] {
  const byLevel = new Map<number, HierarchyNodeRow[]>();
  for (const n of nodes) {
    const list = byLevel.get(n.level) ?? [];
    list.push(n);
    byLevel.set(n.level, list);
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
}

const initialState: ActionResult = { ok: true };

export function CreateNodeForm({
  fixedType,
  allNodes,
  onDone,
  onCancel,
}: {
  fixedType?: "OFFICE" | "COLLEGE" | "DEPARTMENT";
  allNodes: HierarchyNodeRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [level, setLevel] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parentCandidates = allNodes.filter((n) => n.active && n.level === level - 1);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createNodeAction(initialState, formData);
      if (!res.ok) setError(res.error ?? "Could not create node");
      else onDone();
    });
  }

  return (
    <form action={onSubmit} className="border-b border-border bg-panel2 px-14 py-12 flex flex-col gap-9">
      <div className="flex flex-wrap gap-9">
        <div className="flex-1 min-w-160">
          <Label>Name</Label>
          <Input name="name" required autoFocus className="mt-3" />
        </div>
        <div>
          <Label>Level</Label>
          <Input
            name="level"
            type="number"
            min={0}
            max={10}
            required
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="w-70 mt-3"
          />
        </div>
        {!fixedType && (
          <div>
            <Label>Type</Label>
            <Select name="type" required defaultValue="DEPARTMENT" className="w-140 mt-3">
              <option value="OFFICE">Office</option>
              <option value="COLLEGE">College</option>
              <option value="DEPARTMENT">Department</option>
            </Select>
          </div>
        )}
        {fixedType && <input type="hidden" name="type" value={fixedType} />}
      </div>

      {level > 0 && (
        <div>
          <Label>Parent(s) — level {level - 1}</Label>
          <select name="parentIds" multiple className="w-full border border-border2 bg-panel rounded-2 mt-3 h-70 text-11.5 px-6 py-4">
            {parentCandidates.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          {parentCandidates.length === 0 && (
            <div className="text-10.5 text-warn mt-3">No active level {level - 1} node exists yet.</div>
          )}
        </div>
      )}

      <div className="flex gap-9">
        <div className="flex-1">
          <Label>Head name (optional)</Label>
          <Input name="headName" className="mt-3" />
        </div>
        <div className="flex-1">
          <Label>Head email (optional)</Label>
          <Input name="headEmail" type="email" className="mt-3" />
        </div>
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}

      <div className="flex gap-8">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function NodeRow({ node, allNodes }: { node: HierarchyNodeRow; allNodes: HierarchyNodeRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [assignForm, setAssignForm] = useState(false);
  const [renameForm, setRenameForm] = useState(false);

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error ?? "Something went wrong");
    });
  }

  const parents = node.parentIds.map((id) => allNodes.find((n) => n.id === id)?.name ?? "?").join(", ");

  return (
    <div className={`border-b border-border px-14 py-10 ${!node.active ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-10 flex-wrap">
        <button onClick={() => setExpanded((v) => !v)} className="text-10 text-faint w-12 flex-none">
          {expanded ? "▾" : "▸"}
        </button>
        <div className="flex-1 min-w-150">
          <div className="text-12 font-medium">
            {node.name} {!node.active && <Badge className="ml-6">Inactive</Badge>}
          </div>
          {parents && <div className="text-10 text-faint mt-1">under {parents}</div>}
        </div>
        <div className="text-10.5 font-mono text-dim">
          {node.teacherCount} teachers · {node.studentCount} students · {node.childCount} children
        </div>
        {node.occupant ? (
          <div className="flex items-center gap-6">
            <Badge variant={STATUS_BADGE[node.occupant.status]}>{node.occupant.status}</Badge>
            <div className="text-10.5">
              {node.occupant.name}
              {node.occupant.statusDetail && <span className="text-faint"> · {node.occupant.statusDetail}</span>}
            </div>
          </div>
        ) : (
          <Badge>unassigned</Badge>
        )}
      </div>

      {expanded && (
        <div className="mt-9 pl-22 flex flex-col gap-8">
          {error && <div className="text-11 text-bad">{error}</div>}

          <div className="flex flex-wrap gap-6">
            {node.occupant?.status === "registered" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => revokeAccessAction(node.id))}>
                Revoke access
              </Button>
            )}
            {node.occupant && node.occupant.status !== "registered" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendInvitationAction(node.id))}>
                Resend invitation
              </Button>
            )}
            {!node.occupant && (
              <Button size="sm" variant="outline" onClick={() => setAssignForm((v) => !v)}>
                Assign head
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setRenameForm((v) => !v)}>
              Rename
            </Button>
            {node.active ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deactivateNodeAction(node.id))}>
                Deactivate
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reactivateNodeAction(node.id))}>
                Reactivate
              </Button>
            )}
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteNodeAction(node.id))}>
              Delete
            </Button>
          </div>

          {assignForm && (
            <form
              action={(fd) => run(async () => assignHeadAction(initialState, fd))}
              className="flex items-end gap-8"
            >
              <input type="hidden" name="nodeId" value={node.id} />
              <div>
                <Label>Name</Label>
                <Input name="name" required className="mt-3 w-160" />
              </div>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" required className="mt-3 w-200" />
              </div>
              <Button type="submit" size="sm" disabled={pending}>
                Invite
              </Button>
            </form>
          )}

          {renameForm && (
            <form action={(fd) => run(async () => renameNodeAction(initialState, fd))} className="flex items-end gap-8">
              <input type="hidden" name="nodeId" value={node.id} />
              <div>
                <Label>New name</Label>
                <Input name="name" required defaultValue={node.name} className="mt-3 w-220" />
              </div>
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
            </form>
          )}

          <form action={(fd) => run(async () => changeLevelAction(initialState, fd))} className="flex items-end gap-8">
            <input type="hidden" name="nodeId" value={node.id} />
            <div>
              <Label>Change level (disconnects existing edges)</Label>
              <Input name="level" type="number" min={0} max={10} defaultValue={node.level} className="mt-3 w-70" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Apply
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
