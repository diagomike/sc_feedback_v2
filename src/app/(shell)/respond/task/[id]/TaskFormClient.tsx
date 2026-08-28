"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FormBody, { type FormRenderable } from "@/components/respond/FormBody";
import FormTerminalState, { type TerminalKind } from "@/components/respond/FormTerminalState";
import { submitByTaskIdAction } from "@/actions/responses";
import type { AnswerInput } from "@/lib/schemas/responses";

/** In-shell counterpart to the standalone /respond/[token] form, reached by clicking
 *  "Start" on a task in /respond/tasks. Ported from v1's TaskFormPage.tsx. */
export default function TaskFormClient({ taskId, form }: { taskId: string; form: FormRenderable }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [terminal, setTerminal] = useState<TerminalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onLikert = (itemId: string, pointValue: number) => setAnswers((p) => ({ ...p, [itemId]: { itemId, pointValue } }));
  const onText = (itemId: string, text: string) => setAnswers((p) => ({ ...p, [itemId]: { itemId, text } }));

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    const res = await submitByTaskIdAction(taskId, Object.values(answers));
    setSubmitting(false);
    if (res.ok) {
      setTerminal("submitted");
    } else if (res.terminal) {
      setTerminal(res.terminal);
    } else {
      setError(res.error ?? "Could not submit your feedback");
    }
  }

  if (terminal) {
    return (
      <div>
        <FormTerminalState kind={terminal} embedded />
        <div className="flex justify-center pb-16">
          <button
            onClick={() => router.push("/respond/tasks")}
            className="border border-border2 bg-panel h-25 px-11 rounded-3 text-11.5 text-accent"
          >
            See your other pending forms →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center px-0 md:px-14 md:py-14 bg-bg min-h-full">
      <div className="w-full md:max-w-[760px] bg-panel md:border md:border-border md:rounded-3 overflow-hidden self-start">
        <FormBody form={form} answers={answers} onLikert={onLikert} onText={onText} onSubmit={onSubmit} submitting={submitting} error={error} />
      </div>
    </div>
  );
}
