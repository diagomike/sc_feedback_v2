"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { getOfferingsScreen } from "@/server/courses/courses";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Data = Awaited<ReturnType<typeof getOfferingsScreen>>;

export default function OfferingsClient({ nodeName, semesters, selectedSemesterId, rows }: Data) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.courseCode, r.courseTitle, r.teacherName, r.sectionName, r.sectionNodeName].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  const totalEnrolled = filtered.reduce((sum, r) => sum + r.enrolledCount, 0);
  const external = filtered.filter((r) => r.sectionNodeName !== nodeName).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-8 px-12 py-7 border-b border-border bg-panel2 flex-wrap">
        <Select
          value={selectedSemesterId ?? ""}
          onChange={(e) => router.push(`/manage/offerings?semester=${e.target.value}`)}
          className="w-190 h-22"
        >
          {semesters.length === 0 && <option value="">— no semesters —</option>}
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search course, teacher, section…" className="w-230 h-22" />
        <div className="flex-1" />
        <span className="text-10 text-faint font-mono">
          {filtered.length} offerings · {totalEnrolled} enrolments
          {external > 0 && ` · ${external} in another department's sections`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="px-16 py-20 text-11.5 text-faint leading-relaxed max-w-620">
          Nothing imported for this semester yet. Load your registry export under{" "}
          <span className="text-dim">Manage › CSV import</span> — students first (which creates your
          sections), then offerings, then enrolments.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead>In campaigns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.courseTitle}</TableCell>
                <TableCell className="font-mono text-10.5">{r.courseCode}</TableCell>
                <TableCell className="text-10.5">{r.teacherName}</TableCell>
                <TableCell className="text-10.5">
                  {r.sectionName}
                  {/* Flagged because it changes who the feedback is about: this teacher is
                      ours, the students are not. */}
                  {r.sectionNodeName !== nodeName && <Badge variant="warn" className="ml-5">{r.sectionNodeName}</Badge>}
                </TableCell>
                <TableCell className="font-mono text-10.5">{r.enrolledCount}</TableCell>
                <TableCell className="text-10.5 text-dim">
                  {r.campaignNames.length > 0 ? r.campaignNames.join(", ") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
