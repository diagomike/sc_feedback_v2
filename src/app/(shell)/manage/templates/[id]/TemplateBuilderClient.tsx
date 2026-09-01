"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { getTemplateDetail } from "@/server/templates/templates";
import { updateTemplateAction, publishTemplateAction, archiveTemplateAction, cloneTemplateAction } from "@/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

type Detail = Awaited<ReturnType<typeof getTemplateDetail>>;
type ScaleOption = { id: string; name: string };

interface ItemState {
  text: string;
  weight: number;
  required: boolean;
}
interface SectionState {
  title: string;
  description: string | null;
  type: "LIKERT_GRID" | "FREE_TEXT";
  scaleId: string | null;
  weight: number;
  isOverall: boolean;
  allowNotApplicable: boolean;
  items: ItemState[];
}

function toSectionState(s: Detail["sections"][number]): SectionState {
  return {
    title: s.title,
    description: s.description,
    type: s.type,
    scaleId: s.scaleId,
    weight: s.weight,
    isOverall: s.isOverall,
    allowNotApplicable: s.allowNotApplicable,
    items: s.items.map((it) => ({ text: it.text, weight: it.weight, required: it.required })),
  };
}

export default function TemplateBuilderClient({ template, scales }: { template: Detail; scales: ScaleOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(template.title);
  const [sections, setSections] = useState<SectionState[]>(template.sections.map(toSectionState));
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editable = template.editable;

  function update(i: number, patch: Partial<SectionState>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        title: "Untitled section",
        description: null,
        type: "LIKERT_GRID",
        scaleId: scales[0]?.id ?? null,
        weight: 1,
        isOverall: false,
        // On by default: every ASTU questionnaire carries the column, and a section that
        // silently lacks it makes a required item unanswerable when it genuinely does not
        // apply to the teacher being rated.
        allowNotApplicable: true,
        items: [{ text: "Untitled statement", weight: 1, required: true }],
      },
    ]);
  }
  function removeSection(i: number) {
    setSections((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addItem(i: number) {
    update(i, { items: [...sections[i].items, { text: "New statement", weight: 1, required: true }] });
  }
  function removeItem(i: number, j: number) {
    update(i, { items: sections[i].items.filter((_, idx) => idx !== j) });
  }
  function updateItem(i: number, j: number, patch: Partial<ItemState>) {
    update(i, { items: sections[i].items.map((it, idx) => (idx === j ? { ...it, ...patch } : it)) });
  }

  function save() {
    setSaved(false);
    startSaving(async () => {
      const res = await updateTemplateAction(template.id, { title, sections });
      if (!res.ok) setError(res.error ?? "Could not save");
      else {
        setError(null);
        setSaved(true);
        router.refresh();
      }
    });
  }
  function publish() {
    startSaving(async () => {
      const res = await publishTemplateAction(template.id);
      if (!res.ok) setError(res.error ?? "Could not publish");
      else router.refresh();
    });
  }
  function archive() {
    startSaving(async () => {
      const res = await archiveTemplateAction(template.id);
      if (!res.ok) setError(res.error ?? "Could not archive");
      else router.refresh();
    });
  }
  function clone() {
    startSaving(async () => {
      const res = await cloneTemplateAction(template.id);
      if (!res.ok) setError(res.error ?? "Could not clone");
      else if (res.id) router.push(`/manage/templates/${res.id}`);
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14 max-w-1000">
      <div className="flex items-center gap-10 flex-wrap">
        <Badge variant={template.status === "PUBLISHED" ? "good" : template.status === "DRAFT" ? "warn" : "default"}>
          {template.status.toLowerCase()}
        </Badge>
        <span className="text-10.5 text-dim">{template.targetGroup} · owned by {template.isOwn ? "you" : template.ownerNodeName}</span>
        <div className="flex-1" />
        {template.status !== "DRAFT" && (
          <span className="text-10.5 text-faint">Published templates are immutable — clone to edit.</span>
        )}
        <Button size="sm" variant="outline" disabled={saving} onClick={clone}>
          Clone
        </Button>
        {template.isOwn && template.status !== "ARCHIVED" && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={archive}>
            Archive
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="secondary" disabled={saving} onClick={publish}>
            Publish
          </Button>
        )}
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}
      {saved && <div className="text-11 text-good">Saved.</div>}

      <div>
        <Label>Title</Label>
        <Input value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} className="mt-3 max-w-420" />
      </div>

      <div className="flex flex-col gap-12">
        {sections.map((s, i) => {
          const contributing = s.type === "LIKERT_GRID" && !s.isOverall;
          return (
            <div key={i} className="border border-border rounded-3 bg-panel">
              <div className="flex items-center gap-8 px-12 py-9 border-b border-border bg-panel2 flex-wrap">
                <Input
                  value={s.title}
                  disabled={!editable}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="flex-1 min-w-160 h-22"
                />
                <Select value={s.type} disabled={!editable} onChange={(e) => update(i, { type: e.target.value as SectionState["type"] })} className="w-140 h-22">
                  <option value="LIKERT_GRID">Likert grid</option>
                  <option value="FREE_TEXT">Free text</option>
                </Select>
                {s.type === "LIKERT_GRID" && (
                  <Select value={s.scaleId ?? ""} disabled={!editable} onChange={(e) => update(i, { scaleId: e.target.value })} className="w-160 h-22">
                    <option value="">— pick a scale —</option>
                    {scales.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name}
                      </option>
                    ))}
                  </Select>
                )}
                <label className="flex items-center gap-4 text-10.5">
                  weight
                  <Input
                    type="number"
                    step="0.1"
                    value={s.weight}
                    disabled={!editable}
                    onChange={(e) => update(i, { weight: Number(e.target.value) })}
                    className="w-60 h-22"
                  />
                </label>
                {s.type === "LIKERT_GRID" && (
                  <label className="flex items-center gap-4 text-10.5">
                    <Checkbox checked={s.isOverall} disabled={!editable} onChange={(e) => update(i, { isOverall: e.target.checked })} />
                    holistic (excluded from composite)
                  </label>
                )}
                {s.type === "LIKERT_GRID" && (
                  <label className="flex items-center gap-4 text-10.5">
                    <Checkbox
                      checked={s.allowNotApplicable}
                      disabled={!editable}
                      onChange={(e) => update(i, { allowNotApplicable: e.target.checked })}
                    />
                    offer &ldquo;not applicable&rdquo;
                  </label>
                )}
                {contributing && <Badge variant="accent">contributes to composite</Badge>}
                {editable && (
                  <div className="flex gap-4 ml-auto">
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>
                      ▲
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>
                      ▼
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeSection(i)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <div className="px-12 py-9 flex flex-col gap-6">
                {s.items.map((it, j) => (
                  <div key={j} className="flex items-center gap-8">
                    <Input
                      value={it.text}
                      disabled={!editable}
                      onChange={(e) => updateItem(i, j, { text: e.target.value })}
                      className="flex-1 h-22"
                    />
                    {s.type === "LIKERT_GRID" && (
                      <label className="flex items-center gap-4 text-10.5">
                        weight
                        <Input
                          type="number"
                          step="0.1"
                          value={it.weight}
                          disabled={!editable}
                          onChange={(e) => updateItem(i, j, { weight: Number(e.target.value) })}
                          className="w-56 h-22"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-4 text-10.5">
                      <Checkbox checked={it.required} disabled={!editable} onChange={(e) => updateItem(i, j, { required: e.target.checked })} />
                      required
                    </label>
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => removeItem(i, j)}>
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button size="sm" variant="outline" className="w-fit" onClick={() => addItem(i)}>
                    + item
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="flex gap-8">
          <Button variant="outline" onClick={addSection}>
            + Section
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      )}
    </div>
  );
}
