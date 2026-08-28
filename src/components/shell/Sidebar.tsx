"use client";

import { usePathname, useRouter } from "next/navigation";
import { navFor, modesFor, modeForPath, screenKeyForPath } from "@/lib/nav";
import type { ScopeInfo } from "@/server/scope";
import type { NodeType, RoleKind } from "@prisma/client";
import { logoutAction } from "@/actions/auth";

function scopeMeta(scope: ScopeInfo): string {
  const parts = [`L${scope.level}`];
  if (scope.isLeaf) parts.push("leaf");
  if (scope.teacherCount > 0) parts.push(`${scope.teacherCount} teachers`);
  if (scope.studentCount > 0) parts.push(`${scope.studentCount} students`);
  return parts.join(" · ");
}

export default function Sidebar({
  roles,
  nodeType,
  scope,
  counts,
  onNavigate,
}: {
  roles: RoleKind[];
  nodeType: NodeType | null;
  scope: ScopeInfo | null;
  counts?: Record<string, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const mode = modeForPath(pathname);
  const activeKey = screenKeyForPath(pathname);
  const isAdmin = roles.includes("ADMIN");
  const modes = modesFor(roles, nodeType);

  const go = (path: string) => {
    router.push(path);
    onNavigate?.();
  };

  return (
    <div className="bg-panel2 md:border-r border-border flex flex-col min-h-0 h-full overflow-hidden">
      {modes.length > 1 && (
        <div className="md:hidden border-b border-border p-8 flex gap-4 flex-none">
          {modes.map((m) => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => go(navFor(m.key, roles, nodeType)[0].items[0].path)}
                style={{
                  background: on ? "var(--accent)" : "var(--panel)",
                  color: on ? "#fff" : "var(--dim)",
                  borderColor: on ? "var(--accent)" : "var(--border2)",
                }}
                className="flex-1 border h-30 rounded-3 text-11.5 font-medium"
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-12 pt-9 pb-8 border-b border-border flex-none">
        <div className="text-9.5 uppercase tracking-label text-faint font-semibold">Your scope</div>
        {scope ? (
          <>
            <div className="flex items-center gap-6 mt-4">
              <div className="w-6 h-6 bg-accent rounded-1 flex-none" />
              <div className="text-12 font-semibold leading-snug">{scope.name}</div>
            </div>
            <div className="text-10.5 text-dim mt-2 font-mono">{scopeMeta(scope)}</div>
            {scope.path.length > 0 && (
              <div className="text-10 text-faint mt-5 leading-normal">
                {scope.path.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="opacity-50"> › </span>}
                    {p}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : isAdmin ? (
          <>
            <div className="flex items-center gap-6 mt-4">
              <div className="w-6 h-6 bg-accent rounded-1 flex-none" />
              <div className="text-12 font-semibold leading-snug">Entire university</div>
            </div>
            <div className="text-10.5 text-dim mt-2 font-mono">system administrator</div>
          </>
        ) : (
          <div className="text-10.5 text-faint mt-4 leading-normal">
            No managerial scope — you respond to feedback requests and read your own results.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-6 pb-10">
        {navFor(mode, roles, nodeType).map((group) => (
          <div key={group.label} className="mb-9">
            <div className="text-9.5 uppercase tracking-label text-faint font-semibold px-12 pt-4 pb-3">
              {group.label}
            </div>
            {group.items.map((item) => {
              const on = item.key === activeKey;
              const count = counts?.[item.key] ?? item.count ?? "";
              return (
                <button
                  key={item.key}
                  onClick={() => go(item.path)}
                  style={{
                    borderLeftColor: on ? "var(--accent)" : "transparent",
                    background: on ? "var(--sel)" : "transparent",
                    color: on ? "var(--text)" : "var(--dim)",
                    fontWeight: on ? 600 : 400,
                  }}
                  className="w-full text-left border-0 border-l-2 text-12 pl-10 pr-12 py-6 md:py-4 flex items-center gap-7 leading-relaxed hover:bg-panel3"
                >
                  <span className="w-13 text-center text-10 opacity-75 flex-none">{item.icon}</span>
                  <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
                  {count && (
                    <span
                      style={{ color: on ? "var(--accent)" : "var(--faint)" }}
                      className="text-9.5 font-mono px-4 rounded-2"
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-border py-6 flex-none">
        <button
          onClick={() => void logoutAction()}
          className="w-full text-left border-0 bg-transparent text-dim text-11.5 px-12 py-6 md:py-4 flex items-center gap-7 hover:bg-panel3 hover:text-text"
        >
          <span className="w-13 text-center text-10 opacity-75">⏻</span>Sign out
        </button>
      </div>
    </div>
  );
}
