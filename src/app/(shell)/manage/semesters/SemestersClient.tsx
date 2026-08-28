"use client";

import { useActionState, useState, useTransition } from "react";
import type { SemesterRow } from "@/server/semesters";
import {
  createSemesterAction,
  deactivateSemesterAction,
  reactivateSemesterAction,
  deleteSemesterAction,
} from "@/actions/semesters";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const initialState: ActionResult = { ok: true };

export default function SemestersClient({ semesters }: { semesters: SemesterRow[] }) {
  const [state, formAction, pending] = useActionState(createSemesterAction, initialState);
  const [isPending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  function runRowAction(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setRowError(res.ok ? null : res.error ?? "Something went wrong");
    });
  }

  return (
    <div className="p-16 flex flex-col gap-16">
      <div className="border border-border rounded-3 bg-panel2 p-14">
        <div className="text-12 font-semibold mb-9">New semester</div>
        <form action={formAction} className="flex flex-wrap items-end gap-10">
          <div>
            <Label>Academic year</Label>
            <Input name="academicYear" type="number" required defaultValue={new Date().getFullYear()} className="w-90 mt-3" />
          </div>
          <div>
            <Label>Term</Label>
            <Select name="term" required defaultValue="FALL" className="w-130 mt-3">
              <option value="FALL">Fall</option>
              <option value="SPRING">Spring</option>
              <option value="SUMMER">Summer</option>
            </Select>
          </div>
          <div>
            <Label>Starts</Label>
            <Input name="startsAt" type="date" required className="w-150 mt-3" />
          </div>
          <div>
            <Label>Ends</Label>
            <Input name="endsAt" type="date" required className="w-150 mt-3" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create semester"}
          </Button>
        </form>
        {state.error && <div className="text-11 text-bad mt-9">{state.error}</div>}
        <div className="text-10.5 text-faint mt-8 leading-relaxed">
          Summer exists because Weekend and Extension students have reduced contact hours per term and make up the
          difference with a summer term — Regular students don't have one.
        </div>
      </div>

      {rowError && <div className="text-11 text-bad">{rowError}</div>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Semester</TableHead>
            <TableHead>Window</TableHead>
            <TableHead>Campaigns</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {semesters.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.label}</TableCell>
              <TableCell className="font-mono text-10.5">
                {s.startsAt.toISOString().slice(0, 10)} → {s.endsAt.toISOString().slice(0, 10)}
              </TableCell>
              <TableCell className="font-mono">{s.campaignCount}</TableCell>
              <TableCell>
                <Badge variant={s.active ? "good" : "default"}>{s.active ? "active" : "inactive"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-6">
                  {s.active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => runRowAction(() => deactivateSemesterAction(s.id))}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => runRowAction(() => reactivateSemesterAction(s.id))}
                      >
                        Reactivate
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending || s.campaignCount > 0}
                        title={s.campaignCount > 0 ? "Has campaigns — cannot delete" : undefined}
                        onClick={() => runRowAction(() => deleteSemesterAction(s.id))}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
