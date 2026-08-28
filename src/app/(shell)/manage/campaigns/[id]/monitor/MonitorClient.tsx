"use client";

import { useState, useTransition } from "react";
import type { getCampaignMonitor } from "@/server/campaigns/campaigns";
import { remindCampaignAction } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Monitor = Awaited<ReturnType<typeof getCampaignMonitor>>;

export default function MonitorClient({ campaignId, monitor }: { campaignId: string; monitor: Monitor }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function remindAll() {
    startTransition(async () => {
      const res = await remindCampaignAction(campaignId);
      setMessage(res.ok ? `Sent ${res.count} reminder(s).` : (res.error ?? "Could not send reminders"));
    });
  }
  function remindOne(teacherId: string) {
    startTransition(async () => {
      const res = await remindCampaignAction(campaignId, teacherId);
      setMessage(res.ok ? `Sent ${res.count} reminder(s).` : (res.error ?? "Could not send reminders"));
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-16 flex-wrap text-10.5">
        <div>
          <span className="font-mono text-14 font-semibold">{monitor.responded}</span>
          <span className="text-dim"> / {monitor.asked} responded</span>
        </div>
        <div>
          <span className="font-mono text-14 font-semibold">{monitor.teachersPastMinN}</span>
          <span className="text-dim"> / {monitor.teachersTotal} teachers past min-N</span>
        </div>
        {monitor.closesInLabel && <Badge variant={monitor.closesInLabel === "closed" ? "bad" : "default"}>closes {monitor.closesInLabel}</Badge>}
        <div className="flex-1" />
        {!monitor.instant && (
          <Button size="sm" variant="outline" disabled={pending} onClick={remindAll}>
            Remind everyone incomplete
          </Button>
        )}
      </div>

      {message && <div className="text-11 text-good">{message}</div>}

      {monitor.instant ? (
        <div className="flex flex-col gap-10">
          <div className="border border-border rounded-3 bg-panel2 px-14 py-10">
            <div className="text-10.5 text-dim">Public link</div>
            <div className="font-mono text-11.5 mt-2 break-all">{monitor.instant.publicLink}</div>
            {monitor.instant.cap != null && (
              <div className="text-10.5 text-dim mt-4">
                Cap: <span className="font-mono">{monitor.instant.totalResponses}</span> / {monitor.instant.cap}
              </div>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Responses</TableHead>
                <TableHead>Gate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monitor.instant.perTeacher.map((r) => (
                <TableRow key={r.teacherId}>
                  <TableCell>{r.teacherName}</TableCell>
                  <TableCell className="font-mono">{r.responses}</TableCell>
                  <TableCell>
                    <Badge variant={r.gateOk ? "good" : "warn"}>{r.gateLabel}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Peers</TableHead>
              <TableHead>Head</TableHead>
              <TableHead>Gate</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitor.rows.map((r) => (
              <TableRow key={r.teacherId}>
                <TableCell>{r.teacherName}</TableCell>
                <TableCell className="font-mono">{r.students ? `${r.students.done}/${r.students.asked}` : "—"}</TableCell>
                <TableCell className="font-mono">{r.peers ? `${r.peers.done}/${r.peers.asked}` : "—"}</TableCell>
                <TableCell>{r.headDone == null ? "—" : r.headDone ? "done" : "pending"}</TableCell>
                <TableCell>
                  <Badge variant={r.gateOk ? "good" : "warn"}>{r.gateLabel}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remindOne(r.teacherId)}>
                    Remind
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
