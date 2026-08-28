"use client";

import { useActionState } from "react";
import { useTheme } from "@/components/shell/theme-provider";
import { updateProfileAction, changePasswordAction } from "@/actions/auth";
import type { ActionResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionResult = { ok: true };

const FONT_SIZES = [
  { key: "small", label: "Small" },
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
  { key: "xlarge", label: "X-large" },
] as const;
const FONT_FAMILIES = [
  { key: "sans", label: "IBM Plex Sans" },
  { key: "system", label: "System" },
  { key: "serif", label: "Serif" },
] as const;

export default function ProfileClient({ profile }: { profile: { name: string; email: string; phone: string | null } }) {
  const { theme, toggle, fontSize, setFontSize, fontFamily, setFontFamily } = useTheme();
  const [profileState, profileAction, profilePending] = useActionState(updateProfileAction, initialState);
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, initialState);

  return (
    <div className="p-16 max-w-560 flex flex-col gap-20">
      <section>
        <div className="text-11 font-semibold uppercase tracking-label text-faint mb-8">Display</div>
        <div className="flex flex-col gap-10">
          <Field label="Theme">
            <button type="button" onClick={toggle} className="border border-border2 bg-panel h-28 px-9 rounded-3 text-12.5">
              {theme === "dark" ? "◑ Dark" : "◐ Light"} — switch to {theme === "dark" ? "light" : "dark"}
            </button>
          </Field>
          <Field label="Text size">
            <Segmented options={FONT_SIZES} value={fontSize} onChange={setFontSize} />
          </Field>
          <Field label="Typeface">
            <Segmented options={FONT_FAMILIES} value={fontFamily} onChange={setFontFamily} />
            <div className="text-10.5 text-faint mt-3">Numbers, scores, and dates always stay in IBM Plex Mono, whatever you pick here.</div>
          </Field>
        </div>
      </section>

      <section>
        <div className="text-11 font-semibold uppercase tracking-label text-faint mb-8">Profile</div>
        <form action={profileAction} className="flex flex-col gap-9">
          <div>
            <Label>Name</Label>
            <Input name="name" defaultValue={profile.name} required className="mt-3" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={profile.email} disabled className="mt-3" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input name="phone" defaultValue={profile.phone ?? ""} className="mt-3" />
          </div>
          {profileState.error && <div className="text-11 text-bad">{profileState.error}</div>}
          {profileState !== initialState && profileState.ok && !profilePending && <div className="text-11 text-good">Saved.</div>}
          <Button type="submit" disabled={profilePending} className="w-fit">
            {profilePending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </section>

      <section>
        <div className="text-11 font-semibold uppercase tracking-label text-faint mb-8">Password</div>
        <form action={pwAction} className="flex flex-col gap-9">
          <div>
            <Label>Current password</Label>
            <Input name="currentPassword" type="password" required className="mt-3" />
          </div>
          <div>
            <Label>New password</Label>
            <Input name="newPassword" type="password" required minLength={8} className="mt-3" />
          </div>
          {pwState.error && <div className="text-11 text-bad">{pwState.error}</div>}
          {pwState !== initialState && pwState.ok && !pwPending && <div className="text-11 text-good">Password changed.</div>}
          <Button type="submit" disabled={pwPending} className="w-fit">
            {pwPending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-9.5 uppercase tracking-caps text-faint font-semibold mb-3">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: readonly { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-px bg-panel3 p-2 rounded-3 w-fit flex-wrap">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{ background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--dim)" }}
            className="h-24 px-9 rounded-2 text-11 font-medium"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
