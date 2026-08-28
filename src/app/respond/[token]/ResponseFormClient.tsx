"use client";

import { useState } from "react";
import FormBody, { type FormRenderable } from "@/components/respond/FormBody";
import FormTerminalState, { type TerminalKind } from "@/components/respond/FormTerminalState";
import { submitByTokenAction } from "@/actions/responses";
import type { AnswerInput } from "@/lib/schemas/responses";

export default function ResponseFormClient({ token, form }: { token: string; form: FormRenderable }) {
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [terminal, setTerminal] = useState<TerminalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onLikert = (itemId: string, pointValue: number) => setAnswers((p) => ({ ...p, [itemId]: { itemId, pointValue } }));
  const onText = (itemId: string, text: string) => setAnswers((p) => ({ ...p, [itemId]: { itemId, text } }));

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    const res = await submitByTokenAction(token, Object.values(answers));
    setSubmitting(false);
    if (res.ok) setTerminal("submitted");
    else if (res.terminal) setTerminal(res.terminal);
    else setError(res.error ?? "Could not submit your feedback");
  }

  if (terminal) return <FormTerminalState kind={terminal} />;

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
          <FormBody form={form} answers={answers} onLikert={onLikert} onText={onText} onSubmit={onSubmit} submitting={submitting} error={error} />
        </div>
      </div>
    </div>
  );
}
