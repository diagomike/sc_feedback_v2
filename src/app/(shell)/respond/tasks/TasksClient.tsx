"use client";

import Link from "next/link";
import { closeLabel, shortDate, urgencyColor } from "@/lib/dates";

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "As a student",
  PEER: "As a peer teacher",
  MANAGER: "As their manager",
};

interface PendingTask {
  taskId: string;
  teacherName: string;
  campaignName: string;
  courseCode: string | null;
  courseTitle: string | null;
  targetGroup: "STUDENT" | "PEER" | "MANAGER";
  itemCount: number;
  estimatedMinutes: number;
  closesAt: Date | null;
}
interface CompletedTask {
  taskId: string;
  teacherName: string;
  campaignName: string;
  courseCode: string | null;
  courseTitle: string | null;
  targetGroup: "STUDENT" | "PEER" | "MANAGER";
  completedAt: Date;
}

/** Both /respond/tasks and /respond/done land here — pending and completed render as
 *  one screen regardless of which nav item was clicked. Ported from v1's TasksPage.tsx. */
export default function TasksClient({ pending, completed }: { pending: PendingTask[]; completed: CompletedTask[] }) {
  return (
    <div>
      <div className="flex gap-10 px-14 py-9 border-b border-border bg-soft">
        <div className="w-3 self-stretch bg-accent rounded-2 flex-none" />
        <div>
          <div className="text-12 font-semibold">This list only tracks whether you responded</div>
          <div className="text-11 text-dim leading-loose mt-1 max-w-[620px]">
            It never shows what you answered. Most forms here are anonymous; head-of-department assessments are the
            one exception — each form says which applies before you start.
          </div>
        </div>
      </div>

      <div className="px-14 pt-9 pb-4 text-11 font-semibold uppercase tracking-widest text-dim">Pending · {pending.length}</div>
      {pending.length === 0 ? (
        <div className="px-14 pb-12 text-11 text-faint">Nothing waiting on you right now.</div>
      ) : (
        pending.map((t) => (
          <Link
            key={t.taskId}
            href={`/respond/task/${t.taskId}`}
            className="w-full flex items-center gap-12 px-14 py-8 border-b border-border text-left hover:bg-panel2 hover:no-underline"
          >
            <div className="w-3 h-30 rounded-2 flex-none" style={{ background: urgencyColor(t.closesAt?.toISOString() ?? null) }} />
            <div className="flex-1 min-w-0">
              <div className="text-12.5 font-medium truncate text-text">{t.teacherName}</div>
              {/* Without the course, a student with six pending forms sees the same teacher
                  name twice and cannot tell the rows apart. */}
              <div className="text-11 text-faint truncate">
                {t.courseTitle ? `${t.courseTitle} · ${t.courseCode ?? ""}` : t.campaignName}
              </div>
            </div>
            <div className="text-11 text-dim w-130 hidden sm:block flex-none">{ROLE_LABEL[t.targetGroup]}</div>
            <div className="text-11 text-dim w-96 hidden md:block font-mono flex-none">
              {t.itemCount} items · ~{t.estimatedMinutes} min
            </div>
            <div className="w-120 text-right flex-none">
              <div className="text-11.5 font-medium" style={{ color: urgencyColor(t.closesAt?.toISOString() ?? null) }}>
                {closeLabel(t.closesAt?.toISOString() ?? null)}
              </div>
              <div className="text-10 text-faint font-mono">{shortDate(t.closesAt?.toISOString() ?? null)}</div>
            </div>
            <span className="border border-accent bg-accent text-white h-23 px-10 rounded-3 text-11.5 font-medium flex items-center flex-none">
              Start
            </span>
          </Link>
        ))
      )}

      <div className="px-14 pt-12 pb-4 text-11 font-semibold uppercase tracking-widest text-dim">Completed · {completed.length}</div>
      {completed.length === 0 ? (
        <div className="px-14 pb-12 text-11 text-faint">Nothing submitted yet.</div>
      ) : (
        completed.map((t) => (
          <div key={t.taskId} className="flex items-center gap-12 px-14 py-6 border-b border-border" style={{ opacity: 0.72 }}>
            <div className="w-3 h-22 bg-border2 rounded-2 flex-none" />
            <div className="flex-1 min-w-0">
              <div className="text-12 truncate">{t.teacherName}</div>
              <div className="text-10.5 text-faint truncate">
                {t.courseTitle ? `${t.courseTitle} · ${t.courseCode ?? ""}` : t.campaignName}
              </div>
            </div>
            <div className="text-11 text-dim w-130 hidden sm:block flex-none">{ROLE_LABEL[t.targetGroup]}</div>
            <div className="text-11 text-good flex-none whitespace-nowrap">✓ submitted {shortDate(t.completedAt.toISOString())}</div>
          </div>
        ))
      )}

      {completed.length > 0 && (
        <div className="px-14 py-10 text-11 text-faint leading-loose max-w-[760px]">
          Submitted forms cannot be reopened or amended — a form that could be edited after the fact would let a
          respondent be identified by comparing versions.
        </div>
      )}
    </div>
  );
}
