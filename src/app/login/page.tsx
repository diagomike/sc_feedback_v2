"use client";

import { useActionState } from "react";
import { loginAction, type ActionResult } from "@/actions/auth";
import { useTheme } from "@/components/shell/theme-provider";

const initialState: ActionResult = { ok: true };

export default function LoginPage() {
  const { theme, toggle } = useTheme();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="h-38 bg-top text-topfg flex items-center gap-12 px-10 flex-none">
        <div className="flex items-center gap-8">
          <div className="w-18 h-18 bg-white text-top text-9.5 font-bold flex items-center justify-center tracking-tight rounded-2">
            AS
          </div>
          <div className="text-12 font-semibold tracking-wide">
            ASTU <span className="opacity-60 font-normal">Teaching Feedback</span>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={toggle}
          title="Toggle theme"
          className="border border-topline2 bg-topfill2 text-current h-24 px-9 rounded-3 text-11 flex items-center gap-5"
        >
          {theme === "light" ? "◐" : "◑"}
          <span className="opacity-70">{theme === "light" ? "Light" : "Dark"}</span>
        </button>
      </div>

      <div className="flex-1 flex items-start justify-center pt-64 px-14">
        <div className="w-full max-w-[380px]">
          <div className="bg-panel border border-border rounded-3 overflow-hidden">
            <div className="px-14 py-12 border-b border-border">
              <div className="text-10 uppercase tracking-caps text-faint font-semibold">
                Adama Science and Technology University
              </div>
              <div className="text-15 font-semibold mt-2">Sign in</div>
            </div>

            <form action={formAction} className="px-14 py-12">
              <label className="block">
                <span className="text-9.5 uppercase tracking-caps text-faint font-semibold">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="you@astu.edu.et"
                  className="w-full border border-border2 bg-panel h-25 px-8 rounded-3 text-11.5 mt-3 outline-none focus:border-accent"
                />
              </label>

              <label className="block mt-10">
                <span className="text-9.5 uppercase tracking-caps text-faint font-semibold">Password</span>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full border border-border2 bg-panel h-25 px-8 rounded-3 text-11.5 mt-3 outline-none focus:border-accent"
                />
              </label>

              {state.error && (
                <div className="flex gap-8 mt-10">
                  <div className="w-3 bg-bad rounded-2 flex-none" />
                  <div className="text-11 text-bad leading-loose">{state.error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={pending}
                style={{ opacity: pending ? 0.45 : 1 }}
                className="w-full border border-accent bg-accent text-white h-30 rounded-3 text-12 font-medium mt-14"
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="px-14 py-10 bg-panel2 border-t border-border text-10.5 text-faint leading-loose">
              Access is by invitation. If your department registered you, the link in your email sets your password —
              use it rather than signing in here.
            </div>
          </div>

          <div className="text-10.5 text-faint leading-loose mt-12 px-2">
            Feedback you give through this system is anonymous to everyone who reads it. Your identity is stored only so
            you are not asked to respond twice.
          </div>
        </div>
      </div>
    </div>
  );
}
