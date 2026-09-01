"use client";

import { useRef, useState, useTransition } from "react";
import {
  dryRunImportAction,
  commitImportAction,
  dryRunStudentsAction,
  commitStudentsAction,
  dryRunOfferingsAction,
  commitOfferingsAction,
  dryRunEnrollmentsAction,
  commitEnrollmentsAction,
} from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Four CSVs, one screen. The order of the tabs is the order they must be loaded in: an
 * offering needs its section to exist, an enrolment needs both its offering and its
 * student. Each tab is the same dry-run → review → commit loop, and each commit re-sends
 * the CSV rather than the reviewed rows, so the server re-classifies from scratch.
 */

type Tab = "people" | "students" | "offerings" | "enrollments";

const ACTION_BADGE: Record<string, "good" | "warn" | "bad" | "default" | "accent"> = {
  create: "good",
  update: "accent",
  skip: "warn",
  error: "bad",
};

interface Counts {
  create: number;
  update: number;
  skip: number;
  error: number;
}

interface TabSpec {
  key: Tab;
  label: string;
  columns: string;
  hint: string;
  sample: string;
  needsSemester: boolean;
}

const TABS: TabSpec[] = [
  {
    key: "people",
    label: "1 · Staff",
    columns: "name, email, phone, type",
    hint: "type is student or teacher. Use this for staff you already have addresses for; students normally arrive through the roster tab instead.",
    sample:
      "name,email,phone,type\nDr. Meron Assefa,meron.assefa@astu.edu.et,,teacher\nAbel Tesfaye,abel.tesfaye@astu.edu.et,,student",
    needsSemester: false,
  },
  {
    key: "students",
    label: "2 · Students & sections",
    columns: "student_id, name, email, phone, program, class_year, section",
    hint: "One row per student. Sections are created from class_year + section, so this tab is what brings your sections into existence. program is REGULAR, WEEKEND or EXTENSION and is descriptive only. Nobody is emailed.",
    sample:
      "student_id,name,email,phone,program,class_year,section\n" +
      "UGR/12345/17,Abel Tesfaye,abel.tesfaye@astu.edu.et,,REGULAR,Second Year,Section 1\n" +
      "UGR/12346/17,Sara Girma,sara.girma@astu.edu.et,,REGULAR,Second Year,Section 1",
    needsSemester: false,
  },
  {
    key: "offerings",
    label: "3 · Course offerings",
    columns: "offering_id, course_code, course_title, instructor_name, instructor_email, class_year, section",
    hint: "One row per course × teacher × section. offering_id is the registry's own id — keep it and a re-import updates instead of duplicating. Leave instructor_email blank and one is proposed for review before anyone is created.",
    sample:
      "offering_id,course_code,course_title,instructor_name,instructor_email,class_year,section\n" +
      "Kp2g9xJXMd,MATH2207,Discrete mathematics,Asnake Emana,,Second Year,Section 1",
    needsSemester: true,
  },
  {
    key: "enrollments",
    label: "4 · Enrolments",
    columns: "offering_id, student_id",
    hint: "Who actually sat in which course. This is what decides who receives which form — a student gets one form per teacher-course they took, not one per teacher.",
    sample: "offering_id,student_id\nKp2g9xJXMd,UGR/36321/17\nKp2g9xJXMd,UGR/36994/17",
    needsSemester: true,
  },
];

interface ReviewRow {
  row: number;
  action: string;
  problem: string | null;
  cells: string[];
}

export default function ImportClient({
  semesters,
}: {
  semesters: { id: string; label: string }[];
}) {
  const [tab, setTab] = useState<Tab>("people");
  const [semesterId, setSemesterId] = useState(semesters[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const spec = TABS.find((t) => t.key === tab)!;

  function switchTab(next: Tab) {
    setTab(next);
    setCsv("");
    setRows(null);
    setCounts(null);
    setError(null);
    setNotice(null);
    setCommitted(null);
  }

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
    setNotice(null);
    startTransition(async () => {
      if (tab === "people") {
        const res = await dryRunImportAction(csv);
        if (!res.ok) return fail(res.error);
        setHeaders(["Name", "Email", "Type"]);
        setRows(res.result.rows.map((r) => ({ row: r.row, action: r.action, problem: r.problem, cells: [r.name, r.email, r.kind ?? "—"] })));
        setCounts(res.result.counts);
      } else if (tab === "students") {
        const res = await dryRunStudentsAction(csv);
        if (!res.ok) return fail(res.error);
        setHeaders(["Student id", "Name", "Email", "Section"]);
        setRows(
          res.result.rows.map((r) => ({
            row: r.row,
            action: r.action,
            problem: r.problem,
            cells: [r.studentId, r.name, r.email, `${r.classYear} · ${r.section}`],
          })),
        );
        setCounts(res.result.counts);
        setNotice(`${res.result.sections.length} section(s) in this file.`);
      } else if (tab === "offerings") {
        const res = await dryRunOfferingsAction(csv, semesterId);
        if (!res.ok) return fail(res.error);
        setHeaders(["Course", "Instructor", "Email", "Section", "Home dept"]);
        setRows(
          res.result.rows.map((r) => ({
            row: r.row,
            action: r.action,
            problem: r.problem,
            cells: [
              `${r.courseTitle} (${r.courseCode})`,
              r.instructorName,
              r.instructorEmailProposed ? `${r.instructorEmail} ← proposed` : r.instructorEmail,
              `${r.classYear} · ${r.section}`,
              r.homeDepartment ?? "yours",
            ],
          })),
        );
        setCounts(res.result.counts);
        setNotice(
          res.result.proposedEmails > 0
            ? `${res.result.proposedEmails} instructor address(es) were PROPOSED, not supplied — check them before committing, and edit the file if any is wrong.`
            : `Loading into ${res.result.semesterLabel}.`,
        );
      } else {
        const res = await dryRunEnrollmentsAction(csv, semesterId);
        if (!res.ok) return fail(res.error);
        setHeaders(["Offering", "Student id"]);
        setRows(res.result.rows.map((r) => ({ row: r.row, action: r.action, problem: r.problem, cells: [r.offeringId, r.studentId] })));
        setCounts(res.result.counts);
        setNotice(`Loading into ${res.result.semesterLabel}.`);
      }
    });
  }

  function fail(message: string) {
    setError(message);
    setRows(null);
    setCounts(null);
  }

  function runCommit() {
    startTransition(async () => {
      if (tab === "people") {
        const res = await commitImportAction(csv);
        if (!res.ok) return setError(res.error);
        setCommitted(`${res.result.created} created, ${res.result.updated} updated.`);
      } else if (tab === "students") {
        const res = await commitStudentsAction(csv);
        if (!res.ok) return setError(res.error);
        setCommitted(`${res.result.created} created, ${res.result.updated} updated, ${res.result.sections} section(s) touched.`);
      } else if (tab === "offerings") {
        const res = await commitOfferingsAction(csv, semesterId);
        if (!res.ok) return setError(res.error);
        setCommitted(
          `${res.result.created} offering(s) created, ${res.result.updated} updated, ${res.result.teachersInvited} new instructor account(s).`,
        );
      } else {
        const res = await commitEnrollmentsAction(csv, semesterId);
        if (!res.ok) return setError(res.error);
        setCommitted(`${res.result.created} enrolment(s) created, ${res.result.skipped} already present.`);
      }
      setRows(null);
      setCounts(null);
      setCsv("");
    });
  }

  const committable = rows != null && counts != null && counts.error === 0 && counts.create + counts.update > 0;
  const blockedBySemester = spec.needsSemester && !semesterId;

  return (
    <div className="p-16 flex flex-col gap-14 max-w-950">
      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            style={{
              borderBottomColor: tab === t.key ? "var(--accent)" : "transparent",
              color: tab === t.key ? "var(--text)" : "var(--dim)",
            }}
            className="text-11 px-10 py-6 border-b-2 -mb-px"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="text-10.5 text-dim leading-relaxed">
        Columns required: <span className="font-mono">{spec.columns}</span>. {spec.hint} Column order does
        not matter and extra columns are ignored — a raw registry export can be uploaded as-is. Nothing is
        written by the dry run.
      </div>

      {spec.needsSemester && (
        <div className="flex items-center gap-8">
          <span className="text-10.5 text-dim">Semester</span>
          <Select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="w-260">
            {semesters.length === 0 && <option value="">— no semesters defined —</option>}
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <span className="text-10 text-faint">chosen here, never read from the file</span>
        </div>
      )}

      <div className="flex items-center gap-10">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          Choose CSV file
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <button className="text-10.5 text-accent underline" onClick={() => setCsv(spec.sample)}>
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
        <Button disabled={pending || csv.trim().length === 0 || blockedBySemester} onClick={runDryRun}>
          {pending ? "Checking…" : "Dry run"}
        </Button>
        {committable && (
          <Button variant="secondary" disabled={pending} onClick={runCommit}>
            Commit {counts!.create + counts!.update} row(s)
          </Button>
        )}
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}
      {notice && <div className="text-10.5 text-warn leading-relaxed">{notice}</div>}
      {committed && <div className="text-11 text-good">Committed — {committed}</div>}

      {counts && (
        <div className="flex gap-14 text-10.5">
          <span>
            <Badge variant="good">create</Badge> <span className="font-mono ml-4">{counts.create}</span>
          </span>
          <span>
            <Badge variant="accent">update</Badge> <span className="font-mono ml-4">{counts.update}</span>
          </span>
          <span>
            <Badge variant="warn">skip</Badge> <span className="font-mono ml-4">{counts.skip}</span>
          </span>
          <span>
            <Badge variant="bad">error</Badge> <span className="font-mono ml-4">{counts.error}</span>
          </span>
        </div>
      )}

      {rows && (
        <>
          {rows.length > 200 && (
            <div className="text-10 text-faint">
              Showing the first 200 of {rows.length} rows — the counts above cover all of them.
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
                <TableHead>Action</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 200).map((r) => (
                <TableRow key={r.row}>
                  <TableCell className="font-mono">{r.row}</TableCell>
                  {r.cells.map((c, i) => (
                    <TableCell key={i} className={i === 0 ? "" : "text-10.5"}>
                      {c}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge variant={ACTION_BADGE[r.action]}>{r.action}</Badge>
                  </TableCell>
                  <TableCell className="text-10.5 text-dim">{r.problem ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
