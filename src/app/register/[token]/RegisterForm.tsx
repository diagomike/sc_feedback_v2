"use client";

import { useActionState, useState } from "react";
import { registerAction, type ActionResult } from "@/actions/auth";

const initialState: ActionResult = { ok: true };

export default function RegisterForm({
  token,
  name,
  email,
  role,
}: {
  token: string;
  name: string | null;
  email: string | null;
  role: string;
}) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <form action={formAction} className="px-14 py-12">
      <input type="hidden" name="token" value={token} />
      <div className="text-11.5 text-dim leading-loose mb-10">
        {name}, you&apos;re invited as <span className="text-text font-medium">{role.toLowerCase()}</span>. Set a
        password to finish.
        <div className="text-10.5 text-faint mt-2 font-mono">{email}</div>
      </div>

      <label className="block">
        <span className="text-9.5 uppercase tracking-caps text-faint font-semibold">Password</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border2 bg-panel h-25 px-8 rounded-3 text-11.5 mt-3 outline-none focus:border-accent"
        />
      </label>

      <label className="block mt-10">
        <span className="text-9.5 uppercase tracking-caps text-faint font-semibold">Confirm password</span>
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-border2 bg-panel h-25 px-8 rounded-3 text-11.5 mt-3 outline-none focus:border-accent"
        />
      </label>

      {(mismatch || state.error) && (
        <div className="flex gap-8 mt-10">
          <div className="w-3 bg-bad rounded-2 flex-none" />
          <div className="text-11 text-bad leading-loose">
            {mismatch ? "Passwords do not match" : state.error}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || mismatch}
        style={{ opacity: pending ? 0.45 : 1 }}
        className="w-full border border-accent bg-accent text-white h-30 rounded-3 text-12 font-medium mt-14"
      >
        {pending ? "Setting password…" : "Complete registration"}
      </button>
    </form>
  );
}
