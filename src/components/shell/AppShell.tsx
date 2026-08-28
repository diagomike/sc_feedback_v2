"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { NodeType, RoleKind } from "@prisma/client";
import type { ScopeInfo } from "@/server/scope";
import { modeForPath, screenKeyForPath, META } from "@/lib/nav";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import ContentHeader from "./ContentHeader";
import StatusBar from "./StatusBar";

interface ShellHeader {
  crumb?: string;
  title?: string;
  subtitle?: string;
}

/** Lets a page override the 36px content header without prop-drilling through the
 *  server layout. Ported from v1's AppShell.tsx HeaderContext. */
const HeaderContext = createContext<(h: ShellHeader) => void>(() => {});
export function useShellHeader(header: ShellHeader, deps: unknown[] = []) {
  const set = useContext(HeaderContext);
  useEffect(() => {
    set(header);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function AppShell({
  user,
  scope,
  minN,
  pendingTaskCount,
  children,
}: {
  user: { name: string; roles: RoleKind[]; hierarchyNodeType: NodeType | null };
  scope: ScopeInfo | null;
  minN: number;
  pendingTaskCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [override, setOverride] = useState<ShellHeader>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setOverride({});
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const key = screenKeyForPath(pathname);
  const meta = META[key] ?? ["", "", ""];
  const mode = modeForPath(pathname);

  const counts: Record<string, string> = {};
  if (pendingTaskCount) counts.tasks = String(pendingTaskCount);

  return (
    <HeaderContext.Provider value={setOverride}>
      <div className="h-screen w-full grid grid-rows-[38px_1fr_24px] bg-bg overflow-hidden">
        <TopBar user={user} pendingCount={pendingTaskCount} onOpenMenu={() => setDrawerOpen(true)} />

        <div className="grid grid-cols-1 md:grid-cols-[236px_1fr] min-h-0 overflow-hidden relative">
          <div className="hidden md:block min-h-0">
            <Sidebar roles={user.roles} nodeType={user.hierarchyNodeType} scope={scope} counts={counts} />
          </div>

          {drawerOpen && (
            <>
              <div
                className="md:hidden fixed inset-0 bg-black opacity-40 z-40"
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
              />
              <div className="md:hidden fixed left-0 top-38 bottom-24 w-[min(280px,85vw)] z-50 shadow-none border-r border-border">
                <Sidebar
                  roles={user.roles}
                  nodeType={user.hierarchyNodeType}
                  scope={scope}
                  counts={counts}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </>
          )}

          <div className="flex flex-col min-w-0 min-h-0 bg-panel overflow-hidden">
            <ContentHeader
              crumb={override.crumb ?? meta[0]}
              title={override.title ?? meta[1]}
              subtitle={override.subtitle ?? meta[2]}
            />
            <div className="flex-1 overflow-auto min-h-0" key={mode}>
              {children}
            </div>
          </div>
        </div>

        <StatusBar scope={scope} minN={minN} />
      </div>
    </HeaderContext.Provider>
  );
}
