"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SemesterOption {
  id: string;
  label: string;
  term: "FALL" | "SPRING" | "SUMMER";
}

const initialState: { ok: boolean; error?: string; id?: string } = { ok: true };

export default function NewCampaignClient({ semesters }: { semesters: SemesterOption[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCampaignAction, initialState);
  const [type, setType] = useState<"EMAIL" | "INSTANT">("EMAIL");
  const [semesterId, setSemesterId] = useState(semesters[0]?.id ?? "");

  useEffect(() => {
    if (state.ok && state.id) router.push(`/manage/campaigns/${state.id}`);
  }, [state, router]);

  return (
    <div className="p-16 max-w-560">
      <form action={formAction} className="border border-border rounded-3 bg-panel p-16 flex flex-col gap-12">
        <div>
          <Label>Campaign name</Label>
          <Input name="name" required placeholder="Fall 2026/27 Student Evaluation — CSE" className="mt-3" />
        </div>
        <div>
          <Label>Type</Label>
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as "EMAIL" | "INSTANT")} className="mt-3">
            <option value="EMAIL">Email — private links to a fixed audience</option>
            <option value="INSTANT">Instant — public link, optionally guest-allowed</option>
          </Select>
        </div>
        <div>
          <Label>Semester</Label>
          <Select name="semesterId" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="mt-3">
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {state.error && <div className="text-11 text-bad">{state.error}</div>}

        <Button type="submit" disabled={pending || semesters.length === 0} className="w-fit">
          {pending ? "Creating…" : "Create draft"}
        </Button>
        {semesters.length === 0 && (
          <div className="text-11 text-bad">No active semesters exist yet — ask your administrator to create one.</div>
        )}
      </form>
    </div>
  );
}
