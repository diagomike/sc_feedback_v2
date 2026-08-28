"use client";

import { useState, useTransition } from "react";
import { previewLettersAction } from "@/actions/letters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CampaignOption {
  id: string;
  name: string;
  closesAt: Date | null;
  semesterLabel: string;
}
interface Options {
  student: CampaignOption[];
  peer: CampaignOption[];
  manager: CampaignOption[];
}

type Preview = NonNullable<Awaited<ReturnType<typeof previewLettersAction>>["preview"]>;

export default function LettersClient({ options }: { options: Options }) {
  const [studentCampaignId, setStudentCampaignId] = useState(options.student[0]?.id ?? "");
  const [peerCampaignId, setPeerCampaignId] = useState(options.peer[0]?.id ?? "");
  const [managerCampaignId, setManagerCampaignId] = useState(options.manager[0]?.id ?? "");
  const [roundLabel, setRoundLabel] = useState(options.student[0]?.semesterLabel ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  const input = { studentCampaignId, peerCampaignId, managerCampaignId, roundLabel };
  const canGenerate = studentCampaignId && peerCampaignId && managerCampaignId && roundLabel.trim().length > 0;

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const res = await previewLettersAction(input);
      if (!res.ok) setError(res.error);
      else setPreview(res.preview);
    });
  }

  async function download(format: "docx" | "pdf") {
    setDownloading(format);
    try {
      const res = await fetch(`/api/letters?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not generate the file");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluation-letters.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="p-16 flex flex-col gap-14 max-w-1000">
      <div className="text-10.5 text-dim leading-relaxed max-w-720">
        Pick the student, peer, and head round that belong together — they are separate campaigns with no link
        between them, so you choose which three form one evaluation round. The weighting (student 50% · peer 15% ·
        head 35%) is fixed by university legislation.
      </div>

      <div className="grid grid-cols-2 gap-10 max-w-640">
        <div>
          <Label>Student campaign</Label>
          <Select value={studentCampaignId} onChange={(e) => setStudentCampaignId(e.target.value)} className="mt-3">
            {options.student.length === 0 && <option value="">— none closed yet —</option>}
            {options.student.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Peer campaign</Label>
          <Select value={peerCampaignId} onChange={(e) => setPeerCampaignId(e.target.value)} className="mt-3">
            {options.peer.length === 0 && <option value="">— none closed yet —</option>}
            {options.peer.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Head campaign</Label>
          <Select value={managerCampaignId} onChange={(e) => setManagerCampaignId(e.target.value)} className="mt-3">
            {options.manager.length === 0 && <option value="">— none closed yet —</option>}
            {options.manager.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Round label (letter subject line)</Label>
          <Input value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} placeholder="1st Semester 2018 Academic Year" className="mt-3" />
        </div>
      </div>

      <div className="flex gap-8">
        <Button disabled={pending || !canGenerate} onClick={runPreview}>
          {pending ? "Checking…" : "Preview"}
        </Button>
        {preview && preview.readyCount > 0 && (
          <>
            <Button variant="secondary" disabled={!!downloading} onClick={() => download("docx")}>
              {downloading === "docx" ? "Generating…" : "Download Word"}
            </Button>
            <Button variant="secondary" disabled={!!downloading} onClick={() => download("pdf")}>
              {downloading === "pdf" ? "Generating…" : "Download PDF"}
            </Button>
          </>
        )}
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}

      {preview && (
        <div className="flex flex-col gap-8">
          <div className="text-10.5 text-dim">
            <Badge variant="good">{preview.readyCount} ready</Badge>{" "}
            <Badge variant="warn">{preview.excludedCount} excluded</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Peer</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Overall (0-5)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={r.teacherId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono">{r.studentScore ?? "—"}</TableCell>
                  <TableCell className="font-mono">{r.peerScore ?? "—"}</TableCell>
                  <TableCell className="font-mono">{r.managerScore ?? "—"}</TableCell>
                  <TableCell className="font-mono font-semibold">{r.overallScore ?? "—"}</TableCell>
                  <TableCell>
                    {r.ready ? <Badge variant="good">ready</Badge> : <Badge variant="warn">{r.reason}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
