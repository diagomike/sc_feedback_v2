import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ResponseFormDto, AnswerInput } from "@sc-feedback/shared";
import { api, ApiError } from "../lib/api";

export default function ResponseFormPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<ResponseFormDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<ResponseFormDto>(`/response-tasks/${token}`)
      .then((f) => {
        setForm(f);
        if (f.completed) setSubmitted(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load form"))
      .finally(() => setLoading(false));
  }, [token]);

  function setLikertAnswer(itemId: string, pointValue: number) {
    setAnswers((prev) => ({ ...prev, [itemId]: { itemId, pointValue } }));
  }

  function setTextAnswer(itemId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: { itemId, text } }));
  }

  async function onSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/response-tasks/${token}/submit`, { answers: Object.values(answers) });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (error && !form) return <div className="p-8 text-red-600">{error}</div>;
  if (!form) return null;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md text-center bg-white p-8 rounded-lg shadow">
          <h1 className="text-lg font-semibold text-slate-900">Thank you!</h1>
          <p className="text-sm text-slate-500 mt-2">Your feedback has been recorded.</p>
        </div>
      </div>
    );
  }

  const requiredItems = form.sections.flatMap((s) => s.items.filter((i) => i.required));
  const missingRequired = requiredItems.filter((i) => !answers[i.id]);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="bg-white rounded-lg shadow p-6">
          <p className="text-xs uppercase tracking-wide text-slate-400">{form.campaignName}</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Feedback for {form.teacherName}</h1>
          <p className="text-sm text-slate-500 mt-1">Your response is anonymous — {form.teacherName} will only ever see aggregated results.</p>
        </header>

        {form.sections.map((section) => (
          <section key={section.id} className="bg-white rounded-lg shadow p-6">
            <h2 className="font-medium text-slate-900">{section.title}</h2>
            {section.description && <p className="text-sm text-slate-500 mt-1">{section.description}</p>}

            {section.type === "LIKERT_GRID" && section.scale && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left font-normal text-slate-500 pb-2 pr-2 w-1/3">&nbsp;</th>
                      {section.scale.map((p) => (
                        <th key={p.id} className="font-normal text-slate-500 text-center pb-2 px-1">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="py-3 pr-2 text-slate-800">
                          {item.text}
                          {item.required && <span className="text-red-500"> *</span>}
                        </td>
                        {section.scale!.map((p) => (
                          <td key={p.id} className="text-center px-1">
                            <input
                              type="radio"
                              name={item.id}
                              checked={answers[item.id]?.pointValue === p.value}
                              onChange={() => setLikertAnswer(item.id, p.value)}
                              className="h-4 w-4"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {section.type === "FREE_TEXT" && (
              <div className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <div key={item.id}>
                    <label className="block text-sm text-slate-700 mb-1">
                      {item.text}
                      {item.required && <span className="text-red-500"> *</span>}
                    </label>
                    <textarea
                      rows={3}
                      value={answers[item.id]?.text ?? ""}
                      onChange={(e) => setTextAnswer(item.id, e.target.value)}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {missingRequired.length > 0
              ? `${missingRequired.length} required item(s) remaining`
              : "All required items answered"}
          </p>
          <button
            onClick={onSubmit}
            disabled={submitting || missingRequired.length > 0}
            className="rounded bg-slate-900 text-white px-6 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
