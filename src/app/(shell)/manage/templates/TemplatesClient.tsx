"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TemplateRow } from "@/server/templates/templates";
import { createTemplateAction, cloneTemplateAction, publishTemplateAction, archiveTemplateAction } from "@/actions/templates";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const initialState: ActionResult & { id?: string } = { ok: true };
const STATUS_BADGE: Record<string, "good" | "warn" | "default"> = { PUBLISHED: "good", DRAFT: "warn", ARCHIVED: "default" };

export default function TemplatesClient({
  templates,
  counts,
}: {
  templates: TemplateRow[];
  counts: { draft: number; published: number; archived: number };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTemplateAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [rowPending, startRow] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok && state.id) router.push(`/manage/templates/${state.id}`);
  }, [state, router]);

  function clone(id: string) {
    startRow(async () => {
      const res = await cloneTemplateAction(id);
      if (!res.ok) setError(res.error ?? "Could not clone");
      else if (res.id) router.push(`/manage/templates/${res.id}`);
    });
  }
  function publish(id: string) {
    startRow(async () => {
      const res = await publishTemplateAction(id);
      if (!res.ok) setError(res.error ?? "Could not publish");
      else router.refresh();
    });
  }
  function archive(id: string) {
    startRow(async () => {
      const res = await archiveTemplateAction(id);
      if (!res.ok) setError(res.error ?? "Could not archive");
      else router.refresh();
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-10 text-10.5 text-dim">
        <Badge variant="warn">draft</Badge> <span className="font-mono">{counts.draft}</span>
        <Badge variant="good">published</Badge> <span className="font-mono">{counts.published}</span>
        <Badge>archived</Badge> <span className="font-mono">{counts.archived}</span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          + New template
        </Button>
      </div>

      {showForm && (
        <form action={formAction} className="border border-border rounded-3 bg-panel2 p-14 flex flex-wrap items-end gap-10">
          <div>
            <Label>Title</Label>
            <Input name="title" required className="mt-3 w-260" />
          </div>
          <div>
            <Label>Target group</Label>
            <Select name="targetGroup" defaultValue="STUDENT" className="mt-3 w-140">
              <option value="STUDENT">Student</option>
              <option value="PEER">Peer</option>
              <option value="MANAGER">Manager</option>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create draft"}
          </Button>
          {state.error && <div className="text-11 text-bad w-full">{state.error}</div>}
        </form>
      )}

      {error && <div className="text-11 text-bad">{error}</div>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Sections</TableHead>
            <TableHead>Used by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <a href={`/manage/templates/${t.id}`} className="font-medium text-text hover:text-accent hover:no-underline">
                  {t.title}
                </a>
                {t.clonedFromTitle && <div className="text-10 text-faint mt-1">cloned from {t.clonedFromTitle}</div>}
              </TableCell>
              <TableCell>{t.targetGroup}</TableCell>
              <TableCell className="text-10.5">{t.isOwn ? "You" : t.ownerNodeName}</TableCell>
              <TableCell className="font-mono">
                {t.sectionCount} · {t.itemCount} items
              </TableCell>
              <TableCell className="font-mono">{t.usedByCampaigns}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[t.status]}>{t.status.toLowerCase()}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-6">
                  {t.canPublish && (
                    <Button size="sm" variant="outline" disabled={rowPending} onClick={() => publish(t.id)}>
                      Publish
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={rowPending} onClick={() => clone(t.id)}>
                    Clone
                  </Button>
                  {t.canArchive && (
                    <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => archive(t.id)}>
                      Archive
                    </Button>
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
