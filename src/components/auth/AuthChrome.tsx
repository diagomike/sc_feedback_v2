"use client";

import { useTheme } from "@/components/shell/theme-provider";

/** Same 38px top bar as the signed-in shell, so the standalone token-credential pages
 *  (login/register/respond/guest) feel like the front door of the system rather than a
 *  separate product. */
export default function AuthChrome({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
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
      <div className="flex-1 flex items-start justify-center pt-64 px-14">{children}</div>
    </div>
  );
}
