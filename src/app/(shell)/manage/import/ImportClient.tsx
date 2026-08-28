"use client";

import { useRef, useState, useTransition } from "react";
import { dryRunImportAction, commitImportAction } from "@/actions/import";
import type { ImportRowClassification } from "@/server/import/csv-validation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTION_BADGE: Record<string, "good" | "warn" | "bad" | "default" | "accent"> = {
  create: "good",
  update: "accent",
  skip: "warn",
  error: "bad",
};

const SAMPLE = "name,email,phone,type\nAbel Tesfaye,abel.tesfaye@astu.edu.et,,student\nDr. New Teacher,new.teacher@astu.edu.et,,teacher";

export default function ImportClient() {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRowClassification[] | null>(null);
  const [counts, setCounts] = useState<{ create: number; update: number; skip: number; error: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ created: number; updated: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function runDryRun() {
    setError(null);
    setCommitted(null);
    startTransition(async () => {
      const res = await dryRunImportAction(csv);
      if (!res.ok) {
        setError(res.error);
        setRows(null);
        setCounts(null);
        return;
      }
      setRows(res.result.rows);
      setCounts(res.result.counts);
    });
  }

  function runCommit() {
    startTransition(async () => {
      const res = await commitImportAction(csv);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCommitted(res.result);
      setRows(null);
      setCounts(null);
      setCsv("");
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14 max-w-820">
      <div className="text-10.5 text-dim leading-relaxed">
        Columns required: <span className="font-mono">name, email, phone, type</span> (type is{" "}
        <span className="font-mono">student</span> or <span className="font-mono">teacher</span>). Nothing is
        committed by the dry run — review the classification below, then commit.
      </div>

      <div className="flex items-center gap-10">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          Choose CSV file
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <button className="text-10.5 text-accent underline" onClick={() => setCsv(SAMPLE)}>
          Load sample
        </button>
      </div>

      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="Paste CSV content here, or choose a file above"
        className="font-mono text-10.5 min-h-150"
      />

      <div className="flex gap-8">
        <Button disabled={pending || csv.trim().length === 0} onClick={runDryRun}>
          {pending ? "Checking…" : "Dry run"}
        </Button>
        {rows && counts && counts.error === 0 && (counts.create > 0 || counts.update > 0) && (
          <Button variant="secondary" disabled={pending} onClick={runCommit}>
            Commit {counts.create + counts.update} row(s)
          </Button>
        )}
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}
      {committed && (
        <div className="text-11 text-good">
          Committed — {committed.created} created, {committed.updated} updated.
        </div>
      )}

      {counts && (
        <div className="flex gap-14 text-10.5">
          <span>
            <Badge variant="good">create</Badge> <span className="font-mono ml-4">{counts.create}</span>
          </span>
          <span>
            <Badge variant="warn">skip</Badge> <span className="font-mono ml-4">{counts.skip}</span>
          </span>
          <span>
            <Badge variant="bad">error</Badge> <span className="font-mono ml-4">{counts.error}</span>
          </span>
          <span>update <span className="font-mono ml-4">{counts.update}</span></span>
        </div>
      )}

      {rows && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.row}>
                <TableCell className="font-mono">{r.row}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="font-mono text-10.5">{r.email}</TableCell>
                <TableCell>{r.kind ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={ACTION_BADGE[r.action]}>{r.action}</Badge>
                </TableCell>
                <TableCell className="text-10.5 text-dim">{r.problem ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
