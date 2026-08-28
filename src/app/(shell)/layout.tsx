import { headers } from "next/headers";
import { requireUser } from "@/server/auth/session";
import { getMeContext } from "@/server/scope";
import { canAccessPath } from "@/lib/nav";
import AppShell from "@/components/shell/AppShell";
import Forbidden from "@/components/shell/Forbidden";

/** Every screen under Manage/Analyse/Respond/Me lives inside this layout. requireUser()
 *  redirects to /login when not signed in — this is the real authentication boundary,
 *  not just the hidden-nav-row convenience in nav.ts. canAccessPath() is the second of
 *  v1's three independent RBAC layers (nav filtering / route guard / server
 *  enforcement) — it refuses a direct URL to a deptOnly or role-gated screen even
 *  though the sidebar never showed it. Each page's own server actions are the third
 *  layer and must re-assert scope themselves regardless of this check. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const me = await getMeContext(user.id);
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const allowed = canAccessPath(pathname, user.roles, user.hierarchyNodeType);

  return (
    <AppShell
      user={{ name: user.name, roles: user.roles, hierarchyNodeType: user.hierarchyNodeType }}
      scope={me.scope}
      minN={me.minN}
      pendingTaskCount={me.pendingTaskCount}
    >
      {allowed ? children : <Forbidden />}
    </AppShell>
  );
}
