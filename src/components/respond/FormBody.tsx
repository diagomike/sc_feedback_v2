"use client";

import { useMemo } from "react";
import TrustBanner from "./TrustBanner";
import type { AnswerInput } from "@/lib/schemas/responses";

export interface FormRenderableSection {
  id: string;
  title: string;
  description: string | null;
  type: "LIKERT_GRID" | "FREE_TEXT";
  isOverall: boolean;
  order: number;
  scale: { id: string; label: string; value: number; order: number }[] | null;
  items: { id: string; text: string; required: boolean; order: number }[];
}

export interface FormRenderable {
  campaignName: string;
  teacherName: string;
  targetGroup: "STUDENT" | "PEER" | "MANAGER";
  sections: FormRenderableSection[];
}

/**
 * The actual feedback card — teacher header, trust banner, every section, and the
 * sticky submit footer. Shared between the standalone token-link form, the in-shell
 * session form, and the unauthenticated guest form. Ported from v1's FormBody.tsx.
 */
export default function FormBody({
  form,
  answers,
  onLikert,
  onText,
  onSubmit,
  submitting,
  error,
  minResponses = 5,
  isGuest = false,
}: {
  form: FormRenderable;
  answers: Record<string, AnswerInput>;
  onLikert: (itemId: string, pointValue: number) => void;
  onText: (itemId: string, text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  minResponses?: number;
  isGuest?: boolean;
}) {
  const requiredItems = useMemo(() => form.sections.flatMap((s) => s.items.filter((i) => i.required)), [form]);
  const answeredRequired = requiredItems.filter((i) => {
    const a = answers[i.id];
    return a && (a.pointValue != null || (a.text ?? "").trim().length > 0);
  }).length;
  const remaining = requiredItems.length - answeredRequired;
  const pct = requiredItems.length === 0 ? 100 : Math.round((answeredRequired / requiredItems.length) * 100);

  return (
    <>
      <div className="px-14 py-11 border-b border-border">
        <div className="text-10 uppercase tracking-caps text-faint font-semibold">
          Adama Science and Technology University
        </div>
        <div className="text-11 text-dim mt-1">{form.campaignName}</div>
      </div>

      <div className="px-14 pt-12 pb-10 border-b border-border">
        <div className="text-11 text-dim">You are giving feedback on</div>
        <div className="text-17 font-semibold leading-snug mt-1">{form.teacherName}</div>
      </div>

      <TrustBanner targetGroup={form.targetGroup} teacherName={form.teacherName} minResponses={minResponses} isGuest={isGuest} />

      {form.sections.map((section) => (
        <div key={section.id} className="border-b border-border">
          <div className="px-12 md:px-14 pt-10 pb-4 md:pb-6 sticky top-0 md:static bg-panel border-b border-border md:border-0 z-2">
            <div className="text-13 font-semibold">{section.title}</div>
            <div className="text-10.5 md:text-11 text-faint mt-1">
              {section.type === "FREE_TEXT"
                ? "Optional · not scored"
                : section.isOverall
                  ? "One holistic judgement · reported separately from the composite"
                  : `${section.items.length} statements`}
            </div>
          </div>

          {section.type === "LIKERT_GRID" && section.scale && (
            <>
              <table className="hidden md:table w-full border-collapse text-12">
                <thead>
                  <tr className="bg-panel2">
                    <th className="text-left px-14 py-5 font-normal text-10 uppercase tracking-widest text-faint">Statement</th>
                    {section.scale.map((p) => (
                      <th key={p.id} className="px-4 py-5 font-medium text-10.5 text-dim text-center w-88 leading-tight">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.id} className="border-t border-border hover:bg-panel2">
                      <td className="px-14 py-8 leading-normal">
                        {item.text}
                        {item.required && <span className="text-bad"> *</span>}
                      </td>
                      {section.scale!.map((p) => (
                        <td key={p.id} className="text-center px-4 py-8">
                          <input
                            type="radio"
                            name={item.id}
                            checked={answers[item.id]?.pointValue === p.value}
                            onChange={() => onLikert(item.id, p.value)}
                            aria-label={`${item.text}: ${p.label}`}
                            style={{ width: 15, height: 15, accentColor: "var(--accent)" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="md:hidden">
                {section.items.map((item) => (
                  <div key={item.id} className="px-12 py-10 border-b border-border last:border-b-0">
                    <div className="text-12.5 leading-normal mb-8">
                      {item.text}
                      {item.required && <span className="text-bad"> *</span>}
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      {section.scale!.map((p) => {
                        const on = answers[item.id]?.pointValue === p.value;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onLikert(item.id, p.value)}
                            aria-pressed={on}
                            aria-label={`${item.text}: ${p.label}`}
                            style={{
                              minHeight: 52,
                              borderColor: on ? "var(--accent)" : "var(--border2)",
                              background: on ? "var(--soft)" : "var(--panel)",
                            }}
                            className="border rounded-3 px-2 pt-7 pb-6 flex flex-col items-center justify-center gap-3"
                          >
                            <span style={{ color: on ? "var(--accent)" : "var(--dim)" }} className="font-mono text-13 font-semibold">
                              {p.value}
                            </span>
                            <span className="text-8.5 text-faint leading-tight text-center">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {section.type === "FREE_TEXT" && (
            <div className="px-12 md:px-14 pb-12 pt-4">
              {section.items.map((item) => (
                <div key={item.id}>
                  <textarea
                    rows={4}
                    value={answers[item.id]?.text ?? ""}
                    onChange={(e) => onText(item.id, e.target.value)}
                    placeholder="Optional. Keep it about what happened in class rather than anything that could identify you."
                    aria-label={item.text}
                    className="w-full border border-border2 bg-panel rounded-3 px-9 py-7 text-12 leading-loose resize-y outline-none focus:border-accent"
                  />
                  <div className="text-10.5 text-faint mt-4 leading-loose">
                    Written comments are shown word for word. Specific incidents and distinctive phrasing can
                    identify you even though your name is never stored with the answer.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && (
        <div className="flex gap-9 px-14 py-10 border-b border-border">
          <div className="w-3 bg-bad rounded-2 flex-none" />
          <div className="text-11 text-bad leading-loose">{error}</div>
        </div>
      )}

      <div className="sticky bottom-0 bg-panel2 border-t border-border px-14 py-9 flex items-center gap-12">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-7">
            <div className="flex-1 h-5 bg-panel3 rounded-3 overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-11 text-dim whitespace-nowrap font-mono">
              {answeredRequired} / {requiredItems.length}
            </span>
          </div>
          {remaining > 0 && (
            <div className="text-10.5 text-warn mt-3">
              {remaining} required item{remaining === 1 ? "" : "s"} remaining
            </div>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting || remaining > 0}
          style={{ opacity: submitting || remaining > 0 ? 0.45 : 1 }}
          className="border border-accent bg-accent text-white h-32 px-16 rounded-3 text-12.5 font-medium flex-none"
        >
          {submitting ? "Submitting…" : "Submit feedback"}
        </button>
      </div>
    </>
  );
}
