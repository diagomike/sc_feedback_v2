"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { getCampaignDetail } from "@/server/campaigns/campaigns";
import { updateCampaignAction, launchCampaignAction } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
interface TemplateOption {
  id: string;
  title: string;
  targetGroup: "STUDENT" | "PEER" | "MANAGER";
}
interface TeacherOption {
  id: string;
  name: string;
}
interface GroupOption {
  id: string;
  name: string;
  program: "REGULAR" | "WEEKEND" | "EXTENSION";
}

interface RowState {
  teacherId: string;
  studentGroupIds: Set<string>;
  offeringIds: Set<string>;
  peerIds: Set<string>;
  headIncluded: boolean;
}

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default function CampaignBuilderClient({
  campaign,
  publishedTemplates,
  teachers,
  groups,
}: {
  campaign: Detail;
  publishedTemplates: TemplateOption[];
  teachers: TeacherOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const editable = campaign.editable;
  const isInstant = campaign.type === "INSTANT";

  const [name, setName] = useState(campaign.name);
  const [audienceMode, setAudienceMode] = useState(campaign.audienceMode);
  const [opensAt, setOpensAt] = useState(toDateInput(campaign.opensAt));
  const [closesAt, setClosesAt] = useState(toDateInput(campaign.closesAt));
  const [maxResponses, setMaxResponses] = useState(campaign.maxResponses?.toString() ?? "");
  const [minResponses, setMinResponses] = useState(campaign.minResponses);
  const [minTeachers, setMinTeachers] = useState(campaign.minTeachers);
  const [minStudents, setMinStudents] = useState(campaign.minStudents);
  const [templates, setTemplates] = useState({
    STUDENT: campaign.templates.find((t) => t.targetGroup === "STUDENT")?.templateId ?? null,
    PEER: campaign.templates.find((t) => t.targetGroup === "PEER")?.templateId ?? null,
    MANAGER: campaign.templates.find((t) => t.targetGroup === "MANAGER")?.templateId ?? null,
  });
  const [rows, setRows] = useState<RowState[]>(
    campaign.assignments.map((a) => ({
      teacherId: a.teacherId,
      studentGroupIds: new Set(a.studentGroups.map((g) => g.id)),
      offeringIds: new Set(a.offeringIds),
      peerIds: new Set(a.peers.map((p) => p.id)),
      headIncluded: a.headIncluded,
    })),
  );
  const [addTeacherId, setAddTeacherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name ?? "?";
  const unassignedTeachers = teachers.filter((t) => !rows.some((r) => r.teacherId === t.id));

  // What this teacher actually taught in this campaign's semester, straight from the
  // registry import. Assigning one of these is what reaches its enrolled students — and
  // is also the only way to reach a section another department owns.
  const offeringsFor = (teacherId: string) => campaign.availableOfferings.filter((o) => o.teacherId === teacherId);

  function addRow() {
    if (!addTeacherId) return;
    setRows((prev) => [
      ...prev,
      { teacherId: addTeacherId, studentGroupIds: new Set(), offeringIds: new Set(), peerIds: new Set(), headIncluded: false },
    ]);
    setAddTeacherId("");
  }
  function removeRow(teacherId: string) {
    setRows((prev) => prev.filter((r) => r.teacherId !== teacherId));
  }
  function toggleOffering(teacherId: string, offeringId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.teacherId !== teacherId) return r;
        const next = new Set(r.offeringIds);
        next.has(offeringId) ? next.delete(offeringId) : next.add(offeringId);
        return { ...r, offeringIds: next };
      }),
    );
  }
  function setAllOfferings(teacherId: string, on: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.teacherId === teacherId
          ? { ...r, offeringIds: on ? new Set(offeringsFor(teacherId).map((o) => o.id)) : new Set<string>() }
          : r,
      ),
    );
  }
  /** Assign every teacher who taught anything this semester, every course they gave. This
   *  is the whole point of importing the registry: the mapping is already known, so the
   *  default action is to accept it, not to rebuild it by hand. */
  function assignEverythingTaught() {
    const byTeacher = new Map<string, Set<string>>();
    for (const o of campaign.availableOfferings) {
      const set = byTeacher.get(o.teacherId) ?? new Set<string>();
      set.add(o.id);
      byTeacher.set(o.teacherId, set);
    }
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, offeringIds: new Set([...r.offeringIds, ...(byTeacher.get(r.teacherId) ?? [])]) }));
      for (const [teacherId, offeringIds] of byTeacher) {
        if (next.some((r) => r.teacherId === teacherId)) continue;
        next.push({ teacherId, studentGroupIds: new Set(), offeringIds, peerIds: new Set(), headIncluded: false });
      }
      return next;
    });
  }
  function toggleGroup(teacherId: string, groupId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.teacherId !== teacherId) return r;
        const next = new Set(r.studentGroupIds);
        next.has(groupId) ? next.delete(groupId) : next.add(groupId);
        return { ...r, studentGroupIds: next };
      }),
    );
  }
  function togglePeer(teacherId: string, peerId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.teacherId !== teacherId) return r;
        const next = new Set(r.peerIds);
        next.has(peerId) ? next.delete(peerId) : next.add(peerId);
        return { ...r, peerIds: next };
      }),
    );
  }
  function toggleHead(teacherId: string) {
    setRows((prev) => prev.map((r) => (r.teacherId === teacherId ? { ...r, headIncluded: !r.headIncluded } : r)));
  }

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await updateCampaignAction(campaign.id, {
        name,
        audienceMode,
        opensAt: opensAt || null,
        closesAt: closesAt || null,
        maxResponses: maxResponses ? Number(maxResponses) : null,
        minResponses,
        minTeachers,
        minStudents,
        templates,
        assignments: rows.map((r) => ({
          teacherId: r.teacherId,
          studentGroupIds: [...r.studentGroupIds],
          offeringIds: [...r.offeringIds],
          peerIds: [...r.peerIds],
          headIncluded: r.headIncluded,
        })),
      });
      if (!res.ok) setError(res.error ?? "Could not save");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function launch() {
    startTransition(async () => {
      const res = await launchCampaignAction(campaign.id);
      if (!res.ok) setError(res.error ?? "Could not launch");
      else router.push(`/manage/campaigns/${campaign.id}/monitor`);
    });
  }

  const templatesFor = (tg: "STUDENT" | "PEER" | "MANAGER") => publishedTemplates.filter((t) => t.targetGroup === tg);

  return (
    <div className="p-16 flex flex-col gap-14 max-w-1000">
      <div className="flex items-center gap-10 flex-wrap">
        <Badge variant={campaign.status === "OPEN" ? "good" : campaign.status === "DRAFT" ? "warn" : "default"}>
          {campaign.status.toLowerCase()}
        </Badge>
        <span className="text-10.5 text-dim">
          {campaign.type} · {campaign.semesterLabel}
        </span>
        <div className="flex-1" />
        {campaign.status !== "DRAFT" && (
          <Link href={`/manage/campaigns/${campaign.id}/monitor`}>
            <Button size="sm" variant="outline">
              Monitor
            </Button>
          </Link>
        )}
      </div>

      {error && <div className="text-11 text-bad">{error}</div>}
      {saved && <div className="text-11 text-good">Saved.</div>}

      <div className="grid grid-cols-2 gap-10 max-w-640">
        <div>
          <Label>Name</Label>
          <Input aria-label="Campaign name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} className="mt-3" />
        </div>
        <div>
          <Label>Audience mode</Label>
          <Select aria-label="Audience mode" value={audienceMode} disabled={!editable} onChange={(e) => setAudienceMode(e.target.value as typeof audienceMode)} className="mt-3">
            <option value="REGISTERED_ONLY">Registered only</option>
            <option value="GUEST_ALLOWED">Guest allowed</option>
          </Select>
        </div>
        <div>
          <Label>Opens</Label>
          <Input aria-label="Opens" type="date" value={opensAt} disabled={!editable} onChange={(e) => setOpensAt(e.target.value)} className="mt-3" />
        </div>
        <div>
          <Label>Closes</Label>
          <Input aria-label="Closes" type="date" value={closesAt} disabled={!editable} onChange={(e) => setClosesAt(e.target.value)} className="mt-3" />
        </div>
        {isInstant && (
          <div>
            <Label>Max responses (cap)</Label>
            <Input aria-label="Maximum responses" type="number" value={maxResponses} disabled={!editable} onChange={(e) => setMaxResponses(e.target.value)} className="mt-3" />
          </div>
        )}
        <div>
          <Label>Min-N (anonymity gate)</Label>
          <Input aria-label="Minimum responses" type="number" value={minResponses} disabled={!editable} onChange={(e) => setMinResponses(Number(e.target.value))} className="mt-3" />
        </div>
        <div>
          <Label>Min teachers (launch guard)</Label>
          <Input aria-label="Minimum teachers" type="number" value={minTeachers} disabled={!editable} onChange={(e) => setMinTeachers(Number(e.target.value))} className="mt-3" />
        </div>
        {!isInstant && (
          <div>
            <Label>Min students (launch guard)</Label>
          <Input aria-label="Minimum students" type="number" value={minStudents} disabled={!editable} onChange={(e) => setMinStudents(Number(e.target.value))} className="mt-3" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-8">
        <div className="text-11 font-semibold">Templates</div>
        <div className="flex gap-16 flex-wrap">
          <div>
            <Label>Student</Label>
            <Select aria-label="Student template" value={templates.STUDENT ?? ""} disabled={!editable} onChange={(e) => setTemplates((p) => ({ ...p, STUDENT: e.target.value || null }))} className="mt-3 w-220">
              <option value="">—</option>
              {templatesFor("STUDENT").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
          {!isInstant && (
            <>
              <div>
                <Label>Peer</Label>
                <Select aria-label="Peer template" value={templates.PEER ?? ""} disabled={!editable} onChange={(e) => setTemplates((p) => ({ ...p, PEER: e.target.value || null }))} className="mt-3 w-220">
                  <option value="">—</option>
                  {templatesFor("PEER").map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Manager (head)</Label>
                <Select aria-label="Manager template" value={templates.MANAGER ?? ""} disabled={!editable} onChange={(e) => setTemplates((p) => ({ ...p, MANAGER: e.target.value || null }))} className="mt-3 w-220">
                  <option value="">—</option>
                  {templatesFor("MANAGER").map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-10 flex-wrap">
          <div className="text-11 font-semibold">Audience — teacher by teacher</div>
          {editable && !isInstant && campaign.availableOfferings.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={assignEverythingTaught}>
                Select all {campaign.availableOfferings.length} offerings
              </Button>
              <span className="text-10 text-faint">
                from the registry import for {campaign.semesterLabel}
              </span>
            </>
          )}
        </div>
        {editable && !isInstant && campaign.availableOfferings.length === 0 && (
          <div className="text-10.5 text-warn leading-relaxed">
            No course offerings are loaded for {campaign.semesterLabel}. Import them under
            Manage › CSV import, or assign student groups directly below.
          </div>
        )}
        {editable && (
          <div className="flex items-center gap-8">
            <Select aria-label="Add teacher" value={addTeacherId} onChange={(e) => setAddTeacherId(e.target.value)} className="w-260">
              <option value="">— add a teacher —</option>
              {unassignedTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" disabled={!addTeacherId} onClick={addRow}>
              + Assign
            </Button>
          </div>
        )}

        {rows.map((r) => (
          <div key={r.teacherId} data-testid={`campaign-teacher-${r.teacherId}`} className="border border-border rounded-3 bg-panel px-12 py-9">
            <div className="flex items-center gap-8">
              <span className="text-12 font-medium flex-1">{teacherName(r.teacherId)}</span>
              {editable && (
                <Button size="sm" variant="ghost" onClick={() => removeRow(r.teacherId)}>
                  Remove
                </Button>
              )}
            </div>

            {!isInstant && (
              <div className="mt-8 flex flex-col gap-6">
                {offeringsFor(r.teacherId).length > 0 && (
                  <>
                    <div className="flex items-center gap-8">
                      <div className="text-10 uppercase tracking-label text-faint font-semibold">
                        Courses taught · {campaign.semesterLabel}
                      </div>
                      {editable && (
                        <div className="flex gap-4">
                          <Button size="sm" variant="ghost" onClick={() => setAllOfferings(r.teacherId, true)}>
                            all
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAllOfferings(r.teacherId, false)}>
                            none
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-4">
                      {offeringsFor(r.teacherId).map((o) => (
                        <label key={o.id} className="flex items-center gap-6 text-10.5">
                          <Checkbox
                            checked={r.offeringIds.has(o.id)}
                            disabled={!editable}
                            onChange={() => toggleOffering(r.teacherId, o.id)}
                          />
                          <span className="font-medium">{o.courseTitle}</span>
                          <span className="font-mono text-9.5 text-faint">{o.courseCode}</span>
                          <span className="text-faint">· {o.sectionName}</span>
                          <span className="text-faint">· {o.enrolledCount} students</span>
                          {o.sectionNodeId !== campaign.departmentNodeId && (
                            <Badge variant="warn">{o.sectionNodeName}</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="text-10 uppercase tracking-label text-faint font-semibold mt-4">
                  Student groups (no course)
                </div>
                <div className="flex flex-wrap gap-8">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-4 text-10.5">
                      <Checkbox checked={r.studentGroupIds.has(g.id)} disabled={!editable} onChange={() => toggleGroup(r.teacherId, g.id)} />
                      {g.name}
                    </label>
                  ))}
                </div>

                <div className="text-10 uppercase tracking-label text-faint font-semibold mt-4">Peer respondents</div>
                <div className="flex flex-wrap gap-8">
                  {teachers.filter((t) => t.id !== r.teacherId).map((t) => (
                    <label key={t.id} className="flex items-center gap-4 text-10.5">
                      <Checkbox checked={r.peerIds.has(t.id)} disabled={!editable} onChange={() => togglePeer(r.teacherId, t.id)} />
                      {t.name}
                    </label>
                  ))}
                </div>

                <label className="flex items-center gap-4 text-10.5 mt-4">
                  <Checkbox checked={r.headIncluded} disabled={!editable} onChange={() => toggleHead(r.teacherId)} />
                  Include department head
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="flex gap-8">
          <Button disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={launch}>
            Launch
          </Button>
        </div>
      )}
    </div>
  );
}
