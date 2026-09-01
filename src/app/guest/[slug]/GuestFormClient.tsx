"use client";

import { useEffect, useState } from "react";
import FormBody, { type FormRenderable } from "@/components/respond/FormBody";
import FormTerminalState, { type TerminalKind } from "@/components/respond/FormTerminalState";
import { startBallotAction, submitBallotAction, type StartBallotResult } from "@/actions/public";
import type { AnswerInput } from "@/lib/schemas/responses";

interface CampaignInfo {
  campaignName: string;
  departmentName: string;
  status: "open" | "closed" | "not_open";
  capReached: boolean;
  teachers: { id: string; name: string }[];
}

export default function GuestFormClient({ slug, info }: { slug: string; info: CampaignInfo }) {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [ballotToken, setBallotToken] = useState<string | null>(null);
  const [form, setForm] = useState<NonNullable<StartBallotResult["form"]> | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [terminal, setTerminal] = useState<TerminalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  async function startFor(id: string) {
    setTeacherId(id);
    setStarting(true);
    setError(null);
    const res = await startBallotAction(slug, id);
    setStarting(false);
    if (res.ok && res.ballotToken && res.form) {
      setBallotToken(res.ballotToken);
      setForm(res.form);
    } else {
      if (res.terminal) setTerminal(res.terminal);
      else setError(res.error ?? "Could not open this form");
      setTeacherId(null);
    }
  }

  useEffect(() => {
    if (!autoStarted && info.teachers.length === 1) {
      setAutoStarted(true);
      startFor(info.teachers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLikert = (itemId: string, pointValue: number) => setAnswers((p) => ({ ...p, [itemId]: { itemId, pointValue } }));
  // Selecting N/A clears any rating: the two are mutually exclusive on the paper form, and
  // response-validation.ts refuses a payload that claims both.
  const onNotApplicable = (itemId: string) =>
    setAnswers((p) => ({ ...p, [itemId]: { itemId, pointValue: null, notApplicable: true } }));
  const onText = (itemId: string, text: string) => setAnswers((p) => ({ ...p, [itemId]: { itemId, text } }));

  async function onSubmit() {
    if (!ballotToken) return;
    setError(null);
    setSubmitting(true);
    const res = await submitBallotAction(ballotToken, Object.values(answers));
    setSubmitting(false);
    if (res.ok) setTerminal("submitted");
    else if (res.terminal) setTerminal(res.terminal);
    else setError(res.error ?? "Could not submit your feedback");
  }

  if (terminal) return <FormTerminalState kind={terminal} />;

  const showPicker = info.teachers.length > 1 && teacherId === null;
  const renderableForm: FormRenderable | null = form
    ? { campaignName: form.campaignName, teacherName: form.teacherName, targetGroup: form.targetGroup, sections: form.sections }
    : null;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="h-38 bg-top text-topfg flex items-center gap-8 px-10 flex-none">
        <div className="w-18 h-18 bg-white text-top text-9.5 font-bold flex items-center justify-center rounded-2">AS</div>
        <div className="text-12 font-semibold tracking-wide">
          ASTU <span className="opacity-60 font-normal">Teaching Feedback</span>
        </div>
      </div>
      <div className="flex-1 flex justify-center px-0 md:px-14 md:py-14">
        <div className="w-full md:max-w-[760px] bg-panel md:border md:border-border md:rounded-3 overflow-hidden">
          {showPicker && (
            <div className="px-14 py-14">
              <div className="text-11 text-dim">You are giving feedback to</div>
              <div className="text-15 font-semibold mt-2 mb-10">Pick a teacher</div>
              <div className="flex flex-col gap-6">
                {info.teachers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={starting}
                    onClick={() => startFor(t.id)}
                    style={{ opacity: starting ? 0.6 : 1 }}
                    className="text-left border border-border2 bg-panel hover:bg-panel2 rounded-3 px-12 py-10 text-13 font-medium"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {error && <div className="text-11 text-bad mt-10">{error}</div>}
            </div>
          )}
          {!showPicker && !renderableForm && <div className="px-14 py-30 text-center text-11.5 text-faint">Loading your form…</div>}
          {!showPicker && renderableForm && (
            <FormBody
              form={renderableForm}
              answers={answers}
              onLikert={onLikert}
              onNotApplicable={onNotApplicable}
              onText={onText}
              onSubmit={onSubmit}
              submitting={submitting}
              error={error}
              minResponses={form!.minResponses}
              isGuest
            />
          )}
        </div>
      </div>
    </div>
  );
}
