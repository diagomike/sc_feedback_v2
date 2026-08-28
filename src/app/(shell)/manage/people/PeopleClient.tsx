"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import type { PersonRow } from "@/server/people";
import type { GroupSummary } from "@/server/groups";
import { createPersonAction, resendPersonInvitationAction } from "@/actions/people";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_BADGE } from "@/components/manage/nodeTypeShared";

const initialState: ActionResult = { ok: true };

export default function PeopleClient({
  people,
  counts,
  groups,
}: {
  people: PersonRow[];
  counts: { total: number; teachers: number; students: number; notRegistered: number };
  groups: GroupSummary[];
}) {
  const [state, formAction, pending] = useActionState(createPersonAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"TEACHER" | "STUDENT">("STUDENT");
  const [filter, setFilter] = useState<"all" | "TEACHER" | "STUDENT">("all");
  const [rowPending, startRowTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const filtered = useMemo(() => (filter === "all" ? people : people.filter((p) => p.kind === filter)), [people, filter]);

  function resend(id: string) {
    startRowTransition(async () => {
      const res = await resendPersonInvitationAction(id);
      setRowError(res.ok ? null : res.error ?? "Could not resend");
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-10 flex-wrap text-10.5 text-dim">
        <span className="font-mono text-text font-semibold">{counts.total}</span> people ·{" "}
        <span className="font-mono">{counts.teachers}</span> teachers · <span className="font-mono">{counts.students}</span>{" "}
        students
        {counts.notRegistered > 0 && (
          <span className="text-warn">· {counts.notRegistered} not yet registered</span>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          + Add person
        </Button>
      </div>

      {showForm && (
        <form action={formAction} className="border border-border rounded-3 bg-panel2 p-14 flex flex-wrap items-end gap-10">
          <div>
            <Label>Name</Label>
            <Input name="name" required className="mt-3 w-180" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required className="mt-3 w-220" />
          </div>
          <div>
            <Label>Role</Label>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "TEACHER" | "STUDENT")} className="mt-3 w-130">
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
            </Select>
          </div>
          {kind === "STUDENT" && (
            <div>
              <Label>Groups (optional)</Label>
              <select name="groupIds" multiple className="border border-border2 bg-panel rounded-2 mt-3 h-60 w-200 text-11.5 px-6 py-4">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Inviting…" : "Invite"}
          </Button>
          {state.error && <div className="text-11 text-bad w-full">{state.error}</div>}
        </form>
      )}

      <div className="flex items-center border border-border2 rounded-3 overflow-hidden w-fit">
        {(["all", "TEACHER", "STUDENT"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ background: filter === f ? "var(--sel)" : "transparent", color: filter === f ? "var(--accent)" : "var(--dim)" }}
            className="h-23 px-11 text-11 font-medium border-r border-border2 last:border-r-0"
          >
            {f === "all" ? "All" : f === "TEACHER" ? "Teachers" : "Students"}
          </button>
        ))}
      </div>

      {rowError && <div className="text-11 text-bad">{rowError}</div>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Groups</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="font-mono text-10.5">{p.email}</TableCell>
              <TableCell>{p.kind}</TableCell>
              <TableCell className="text-10.5">{p.groups.join(", ") || "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
                {p.statusDetail && <span className="text-10 text-faint ml-6">{p.statusDetail}</span>}
              </TableCell>
              <TableCell className="text-right">
                {p.status !== "registered" && (
                  <Button size="sm" variant="outline" disabled={rowPending} onClick={() => resend(p.id)}>
                    Resend
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
