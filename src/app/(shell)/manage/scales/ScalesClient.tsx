"use client";

import { useActionState, useState, useTransition } from "react";
import { createScaleAction, getScaleDetailAction, updateScaleAction } from "@/actions/scales";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScaleSummary {
  id: string;
  name: string;
  pointCount: number;
  sectionCount: number;
  templateCount: number;
}
type Detail = Awaited<ReturnType<typeof getScaleDetailAction>>;

const initialState: ActionResult = { ok: true };

export default function ScalesClient({ scales }: { scales: ScaleSummary[] }) {
  const [state, formAction, pending] = useActionState(createScaleAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [newPoints, setNewPoints] = useState([
    { label: "Strongly disagree", value: 1 },
    { label: "Disagree", value: 2 },
    { label: "Neutral", value: 3 },
    { label: "Agree", value: 4 },
    { label: "Strongly agree", value: 5 },
  ]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editName, setEditName] = useState("");
  const [editPoints, setEditPoints] = useState<{ label: string; value: number }[]>([]);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    startLoading(async () => {
      const d = await getScaleDetailAction(id);
      setDetail(d);
      setEditName(d.name);
      setEditPoints(d.points.map((p) => ({ label: p.label, value: p.value })));
    });
  }

  function saveEdit(id: string) {
    startLoading(async () => {
      const res = await updateScaleAction(id, { name: editName, points: editPoints });
      if (!res.ok) setError(res.error ?? "Could not save");
      else {
        setError(null);
        const d = await getScaleDetailAction(id);
        setDetail(d);
      }
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14 max-w-820">
      <div className="flex items-center gap-10">
        <div className="text-10.5 text-dim">
          <span className="font-mono text-text font-semibold">{scales.length}</span> reusable Likert scales
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          + New scale
        </Button>
      </div>

      {showForm && (
        <form action={formAction} className="border border-border rounded-3 bg-panel2 p-14 flex flex-col gap-9">
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="Agreement 5-point" className="mt-3 w-260" />
          </div>
          <div className="flex flex-col gap-4">
            {newPoints.map((p, i) => (
              <div key={i} className="flex items-center gap-8">
                <Input
                  name="pointLabel"
                  value={p.label}
                  onChange={(e) => setNewPoints((prev) => prev.map((pt, idx) => (idx === i ? { ...pt, label: e.target.value } : pt)))}
                  className="flex-1 h-22"
                />
                <Input
                  name="pointValue"
                  type="number"
                  value={p.value}
                  onChange={(e) => setNewPoints((prev) => prev.map((pt, idx) => (idx === i ? { ...pt, value: Number(e.target.value) } : pt)))}
                  className="w-70 h-22"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setNewPoints((prev) => prev.filter((_, idx) => idx !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => setNewPoints((prev) => [...prev, { label: "New point", value: prev.length + 1 }])}
            >
              + point
            </Button>
          </div>
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Creating…" : "Create scale"}
          </Button>
          {state.error && <div className="text-11 text-bad">{state.error}</div>}
        </form>
      )}

      {error && <div className="text-11 text-bad">{error}</div>}

      <div className="flex flex-col gap-8">
        {scales.map((s) => (
          <div key={s.id} className="border border-border rounded-3 bg-panel">
            <button onClick={() => toggle(s.id)} className="w-full flex items-center gap-10 px-12 py-9 text-left">
              <span className="text-10 text-faint w-12">{openId === s.id ? "▾" : "▸"}</span>
              <span className="text-12 font-medium flex-1">{s.name}</span>
              <span className="text-10.5 font-mono text-dim">{s.pointCount} points</span>
              <span className="text-10.5 font-mono text-dim">{s.templateCount} templates</span>
            </button>
            {openId === s.id && (
              <div className="border-t border-border px-16 py-12">
                {loading && !detail && <div className="text-10.5 text-faint">Loading…</div>}
                {detail && detail.id === s.id && (
                  <div className="flex flex-col gap-8">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-260" />
                    {editPoints.map((p, i) => (
                      <div key={i} className="flex items-center gap-8">
                        <Input
                          value={p.label}
                          onChange={(e) => setEditPoints((prev) => prev.map((pt, idx) => (idx === i ? { ...pt, label: e.target.value } : pt)))}
                          className="flex-1 h-22"
                        />
                        <Input
                          type="number"
                          value={p.value}
                          onChange={(e) => setEditPoints((prev) => prev.map((pt, idx) => (idx === i ? { ...pt, value: Number(e.target.value) } : pt)))}
                          className="w-70 h-22"
                        />
                        <span className="text-10 font-mono text-faint w-40">
                          {detail.points[i]?.normalized ?? "—"}
                        </span>
                      </div>
                    ))}
                    <div className="flex gap-8">
                      <Button size="sm" variant="outline" onClick={() => setEditPoints((prev) => [...prev, { label: "New point", value: prev.length + 1 }])}>
                        + point
                      </Button>
                      <Button size="sm" disabled={loading} onClick={() => saveEdit(s.id)}>
                        Save
                      </Button>
                    </div>
                    {detail.templateCount > 0 && (
                      <div className="text-10.5 text-warn">
                        Used by {detail.templateCount} template(s) — saving replaces the point scale for all of them.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
