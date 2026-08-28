"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { closeCampaignAction } from "@/actions/campaigns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CampaignRow {
  id: string;
  name: string;
  type: "EMAIL" | "INSTANT";
  status: "DRAFT" | "OPEN" | "CLOSED";
  semesterLabel: string;
  audiencesSummary: string;
  window: string;
  responded: number;
  asked: number;
  minNLabel: string;
  minNOk: boolean;
  canEdit: boolean;
  canLaunch: boolean;
  canCloseEarly: boolean;
}

const STATUS_BADGE: Record<string, "warn" | "good" | "default"> = { DRAFT: "warn", OPEN: "good", CLOSED: "default" };

export default function CampaignsClient({
  campaigns,
  counts,
}: {
  campaigns: CampaignRow[];
  counts: { draft: number; open: number; closed: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function close(id: string) {
    startTransition(async () => {
      await closeCampaignAction(id);
      router.refresh();
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-10 text-10.5 text-dim">
        <Badge variant="warn">draft</Badge> <span className="font-mono">{counts.draft}</span>
        <Badge variant="good">open</Badge> <span className="font-mono">{counts.open}</span>
        <Badge>closed</Badge> <span className="font-mono">{counts.closed}</span>
        <div className="flex-1" />
        <Link href="/manage/campaigns/new">
          <Button size="sm">+ New campaign</Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Semester</TableHead>
            <TableHead>Audiences</TableHead>
            <TableHead>Window</TableHead>
            <TableHead>Responses</TableHead>
            <TableHead>Min-N</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/manage/campaigns/${c.id}`} className="font-medium text-text hover:text-accent hover:no-underline">
                  {c.name}
                </Link>
                <div className="text-10 text-faint mt-1">{c.type}</div>
              </TableCell>
              <TableCell className="text-10.5">{c.semesterLabel}</TableCell>
              <TableCell className="text-10.5">{c.audiencesSummary}</TableCell>
              <TableCell className="font-mono text-10.5">{c.window}</TableCell>
              <TableCell className="font-mono">
                {c.responded}/{c.asked}
              </TableCell>
              <TableCell>
                <Badge variant={c.minNOk ? "good" : "warn"}>{c.minNLabel}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[c.status]}>{c.status.toLowerCase()}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-6">
                  {c.status !== "DRAFT" && (
                    <Link href={`/manage/campaigns/${c.id}/monitor`}>
                      <Button size="sm" variant="outline">
                        Monitor
                      </Button>
                    </Link>
                  )}
                  {c.canCloseEarly && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => close(c.id)}>
                      Close early
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
