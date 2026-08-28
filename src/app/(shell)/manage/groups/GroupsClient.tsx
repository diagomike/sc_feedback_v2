"use client";

import { useActionState, useState, useTransition } from "react";
import type { GroupSummary } from "@/server/groups";
import {
  createGroupAction,
  getGroupDetailAction,
  listCandidatesAction,
  addGroupMembersAction,
  removeGroupMemberAction,
} from "@/actions/groups";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const initialState: ActionResult = { ok: true };

type Detail = Awaited<ReturnType<typeof getGroupDetailAction>>;
type Candidate = Awaited<ReturnType<typeof listCandidatesAction>>[number];

export default function GroupsClient({ groups }: { groups: GroupSummary[] }) {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(groupId: string) {
    if (openId === groupId) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(groupId);
    setSelected(new Set());
    startLoading(async () => {
      const [d, c] = await Promise.all([getGroupDetailAction(groupId), listCandidatesAction(groupId)]);
      setDetail(d);
      setCandidates(c);
    });
  }

  function addSelected(groupId: string) {
    if (selected.size === 0) return;
    startLoading(async () => {
      const res = await addGroupMembersAction(groupId, [...selected]);
      if (!res.ok) {
        setError(res.error ?? "Could not add students");
        return;
      }
      const [d, c] = await Promise.all([getGroupDetailAction(groupId), listCandidatesAction(groupId)]);
      setDetail(d);
      setCandidates(c);
      setSelected(new Set());
      setError(null);
    });
  }

  function removeMember(groupId: string, userId: string) {
    startLoading(async () => {
      const res = await removeGroupMemberAction(groupId, userId);
      if (!res.ok) {
        setError(res.error ?? "Could not remove student");
        return;
      }
      const [d, c] = await Promise.all([getGroupDetailAction(groupId), listCandidatesAction(groupId)]);
      setDetail(d);
      setCandidates(c);
      setError(null);
    });
  }

  return (
    <div className="p-16 flex flex-col gap-14">
      <div className="flex items-center gap-10">
        <div className="text-10.5 text-dim">
          <span className="font-mono text-text font-semibold">{groups.length}</span> student groups
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          + New group
        </Button>
      </div>

      {showForm && (
        <form action={formAction} className="border border-border rounded-3 bg-panel2 p-14 flex flex-wrap items-end gap-10">
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="CSE Year 3 · Section A" className="mt-3 w-220" />
          </div>
          <div>
            <Label>Program</Label>
            <Select name="program" defaultValue="REGULAR" className="mt-3 w-140">
              <option value="REGULAR">Regular</option>
              <option value="WEEKEND">Weekend</option>
              <option value="EXTENSION">Extension</option>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </Button>
          {state.error && <div className="text-11 text-bad w-full">{state.error}</div>}
        </form>
      )}

      {error && <div className="text-11 text-bad">{error}</div>}

      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <div key={g.id} className="border border-border rounded-3 bg-panel">
            <button onClick={() => toggle(g.id)} className="w-full flex items-center gap-10 px-12 py-9 text-left">
              <span className="text-10 text-faint w-12">{openId === g.id ? "▾" : "▸"}</span>
              <span className="text-12 font-medium flex-1">{g.name}</span>
              <span className="text-10.5 font-mono text-dim">{g.memberCount} members</span>
              <span className="text-10.5 font-mono text-dim">{g.campaignCount} campaigns</span>
            </button>

            {openId === g.id && (
              <div className="border-t border-border px-16 py-12 flex flex-col gap-12">
                {loading && !detail && <div className="text-10.5 text-faint">Loading…</div>}
                {detail && (
                  <>
                    <div>
                      <div className="text-10 uppercase tracking-label text-faint font-semibold mb-6">
                        Members ({detail.members.length})
                      </div>
                      {detail.members.length === 0 ? (
                        <div className="text-10.5 text-faint">No members yet.</div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {detail.members.map((m) => (
                            <div key={m.id} className="flex items-center gap-8 text-11">
                              <span className="flex-1">{m.name}</span>
                              <span className="text-10.5 font-mono text-faint">{m.email}</span>
                              <Badge variant={m.registeredAt ? "good" : "default"}>
                                {m.registeredAt ? "registered" : "invited"}
                              </Badge>
                              <Button size="sm" variant="ghost" onClick={() => removeMember(g.id, m.id)}>
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-10 uppercase tracking-label text-faint font-semibold mb-6">
                        Add students already in your department
                      </div>
                      {candidates.length === 0 ? (
                        <div className="text-10.5 text-faint">No unassigned students to add.</div>
                      ) : (
                        <>
                          <select
                            multiple
                            className="w-full border border-border2 bg-panel rounded-2 h-90 text-11.5 px-6 py-4"
                            onChange={(e) =>
                              setSelected(new Set([...e.target.selectedOptions].map((o) => o.value)))
                            }
                          >
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} — {c.email}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" className="mt-8" disabled={selected.size === 0} onClick={() => addSelected(g.id)}>
                            Add {selected.size > 0 ? selected.size : ""} selected
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
