/** Terminal states for the respondent form. Same chrome as the form itself. Ported from
 *  v1's FormTerminalState.tsx. */

export type TerminalKind = "submitted" | "already" | "closed" | "invalid" | "cap" | "not_open";

const STATES: Record<TerminalKind, { code: string; tone: "good" | "dim" | "bad" | "warn"; title: string; body: string }> = {
  submitted: {
    code: "✓",
    tone: "good",
    title: "Thank you — your feedback is recorded",
    body: "Answers cannot be changed once submitted. A form that could be edited afterwards would let a respondent be identified by comparing versions.",
  },
  already: {
    code: "409",
    tone: "good",
    title: "You have already responded",
    body: "Your feedback for this teacher was recorded earlier. Answers cannot be changed once submitted.",
  },
  closed: {
    code: "410",
    tone: "dim",
    title: "This campaign has closed",
    body: "Nothing entered now would reach the department. Results are being compiled from the responses that arrived before the deadline.",
  },
  invalid: {
    code: "404",
    tone: "bad",
    title: "This link is invalid or expired",
    body: "Private links are single-purpose and expire with the campaign. If you still have the email, use the most recent one.",
  },
  cap: {
    code: "cap",
    tone: "warn",
    title: "This form has reached its limit",
    body: "Instant campaigns accept a fixed number of responses. This one reached its cap and stopped accepting new answers.",
  },
  not_open: {
    code: "draft",
    tone: "dim",
    title: "This link isn't open yet",
    body: "The department hasn't launched this campaign yet. Check back later, or ask whoever shared this link with you.",
  },
};

const TONE: Record<string, { bg: string; fg: string }> = {
  good: { bg: "var(--goodbg)", fg: "var(--good)" },
  dim: { bg: "var(--panel3)", fg: "var(--dim)" },
  bad: { bg: "var(--badbg)", fg: "var(--bad)" },
  warn: { bg: "var(--warnbg)", fg: "var(--warn)" },
};

export default function FormTerminalState({
  kind,
  detail,
  embedded,
}: {
  kind: TerminalKind;
  detail?: string;
  embedded?: boolean;
}) {
  const s = STATES[kind];
  const tone = TONE[s.tone];

  const card = (
    <div className="w-full max-w-[520px] bg-panel border border-border rounded-3 px-14 py-14">
      <div style={{ background: tone.bg, color: tone.fg }} className="text-10 font-mono inline-block px-5 rounded-2">
        {s.code}
      </div>
      <div className="text-15 font-semibold mt-8">{s.title}</div>
      <div className="text-11.5 text-dim leading-loose mt-4">{detail ?? s.body}</div>
    </div>
  );

  if (embedded) {
    return <div className="flex justify-center px-14 pt-24">{card}</div>;
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="h-38 bg-top text-topfg flex items-center gap-8 px-10 flex-none">
        <div className="w-18 h-18 bg-white text-top text-9.5 font-bold flex items-center justify-center rounded-2">
          AS
        </div>
        <div className="text-12 font-semibold tracking-wide">
          ASTU <span className="font-normal">Teaching Feedback</span>
        </div>
      </div>

      <div className="flex-1 flex justify-center px-14 pt-64">{card}</div>
    </div>
  );
}
