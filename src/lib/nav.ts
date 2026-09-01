import type { NodeType, RoleKind } from "@prisma/client";

/**
 * Navigation model + role-based visibility. Ported from v1 (apps/web/src/lib/nav.ts).
 *
 * The four modes are the design's answer to the stacked-roles problem: one person is
 * routinely a department head AND a teacher AND a peer respondent, so navigation is
 * organised by what you are DOING rather than by which role you hold.
 *
 * Roles then decide which of those doings are yours:
 *   ADMIN    — sets up the org chart and semesters. Structure only; not an academic manager.
 *   MANAGER  — the whole of Manage (bar Structure) and Analyse.
 *   TEACHER  — Respond, and Me including their own feedback.
 *   STUDENT  — Respond, and Me limited to profile and password.
 *
 * Hiding a menu item is NOT access control — it only keeps the UI honest. Every route is
 * additionally checked by requireAccess() in the (shell) layout, and every server action
 * enforces scope independently.
 */

export type Mode = "manage" | "analyse" | "respond" | "me";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  /** Visible when the user holds ANY of these roles. */
  roles: RoleKind[];
  /** People/Groups/Import/Letters/Campaigns are department-roster-and-launch activity —
   *  a manager whose own node is an Office or College (AVP, a College, QA) never has a
   *  roster of their own to run a campaign against, so these are hidden (and refused
   *  server-side) for anyone but a DEPARTMENT head. Templates (authored for reuse down
   *  the hierarchy) and Analyse (read-only across the whole visible scope) stay
   *  available to every manager. */
  deptOnly?: boolean;
  count?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const MODES: { key: Mode; label: string }[] = [
  { key: "manage", label: "Manage" },
  { key: "analyse", label: "Analyse" },
  { key: "respond", label: "Respond" },
  { key: "me", label: "Me" },
];

const MANAGER: RoleKind[] = ["MANAGER"];
const ADMIN: RoleKind[] = ["ADMIN"];
const RESPONDS: RoleKind[] = ["MANAGER", "TEACHER", "STUDENT"];
const EVERYONE: RoleKind[] = ["ADMIN", "MANAGER", "TEACHER", "STUDENT"];

export const NAV: Record<Mode, NavGroup[]> = {
  manage: [
    {
      label: "Campaigns",
      items: [
        { key: "campaigns", label: "All campaigns", icon: "▤", path: "/manage/campaigns", roles: MANAGER, deptOnly: true },
        { key: "builder", label: "New campaign", icon: "＋", path: "/manage/campaigns/new", roles: MANAGER, deptOnly: true },
      ],
    },
    {
      label: "Templates",
      items: [
        { key: "templates", label: "Template library", icon: "▣", path: "/manage/templates", roles: MANAGER },
        { key: "scales", label: "Likert scales", icon: "⋮", path: "/manage/scales", roles: MANAGER },
      ],
    },
    {
      label: "People",
      items: [
        { key: "people", label: "Teachers & students", icon: "◍", path: "/manage/people", roles: MANAGER, deptOnly: true },
        { key: "groups", label: "Student groups", icon: "⬚", path: "/manage/groups", roles: MANAGER, deptOnly: true },
        { key: "import", label: "CSV import", icon: "↥", path: "/manage/import", roles: MANAGER, deptOnly: true },
        { key: "offerings", label: "Course offerings", icon: "▥", path: "/manage/offerings", roles: MANAGER, deptOnly: true },
      ],
    },
    {
      label: "Reports",
      items: [
        { key: "letters", label: "Evaluation letters", icon: "⎙", path: "/manage/letters", roles: MANAGER, deptOnly: true },
      ],
    },
    {
      // Only the system admin lays out the org chart and the university's semester
      // calendar. Org structure is ONE screen: canvas, inspector and a filterable list, in
      // place of the five it replaced (Personnel/Offices/Colleges/Departments/Structure) —
      // they were four views of one listGraph() payload plus a shape editor.
      label: "Structure",
      items: [
        { key: "structure", label: "Org structure", icon: "⌗", path: "/manage/structure", roles: ADMIN },
        { key: "semesters", label: "Semesters", icon: "◷", path: "/manage/semesters", roles: ADMIN },
      ],
    },
  ],
  analyse: [
    {
      label: "Overview",
      items: [
        { key: "overview", label: "Scope overview", icon: "▦", path: "/analyse/overview", roles: MANAGER },
        { key: "results", label: "Teacher results", icon: "◔", path: "/analyse/results", roles: MANAGER },
      ],
    },
    {
      label: "Compare",
      items: [{ key: "compare", label: "Across campaigns", icon: "⇄", path: "/analyse/compare", roles: MANAGER }],
    },
  ],
  respond: [
    {
      label: "Assigned to you",
      items: [
        { key: "tasks", label: "Pending forms", icon: "◷", path: "/respond/tasks", roles: RESPONDS },
        { key: "done", label: "Completed", icon: "✓", path: "/respond/done", roles: RESPONDS },
      ],
    },
  ],
  me: [
    {
      label: "About you",
      items: [
        { key: "selfview", label: "My feedback", icon: "◕", path: "/me/feedback", roles: ["TEACHER"] },
        { key: "profile", label: "Profile & password", icon: "◌", path: "/me/profile", roles: EVERYONE },
      ],
    },
  ],
};

/** crumb · title · subtitle for the 36px content header. */
export const META: Record<string, [string, string, string]> = {
  campaigns: ["Manage ›", "Campaigns", ""],
  monitor: ["Manage › Campaigns ›", "Campaign monitor", ""],
  builder: ["Manage › Campaigns ›", "New campaign — draft", ""],
  templates: ["Manage ›", "Template library", ""],
  tbuilder: ["Manage › Templates ›", "Template builder", ""],
  scales: ["Manage › Templates ›", "Likert scales", ""],
  people: ["Manage ›", "Teachers & students", ""],
  groups: ["Manage ›", "Student groups", ""],
  import: ["Manage › People ›", "CSV import — dry run", "nothing committed yet"],
  letters: ["Manage ›", "Evaluation letters", ""],
  structure: ["Manage ›", "Org structure", ""],
  offerings: ["Manage ›", "Course offerings", ""],
  semesters: ["Manage ›", "Semesters", ""],
  overview: ["Analyse ›", "Scope overview", ""],
  results: ["Analyse ›", "Teacher results", ""],
  compare: ["Analyse ›", "Compare", ""],
  tasks: ["Respond ›", "Your feedback tasks", ""],
  done: ["Respond ›", "Completed", ""],
  selfview: ["Me ›", "Your feedback", ""],
  profile: ["Me ›", "Profile & password", ""],
};

function allows(item: NavItem, userRoles: RoleKind[], nodeType: NodeType | null): boolean {
  if (!item.roles.some((r) => userRoles.includes(r))) return false;
  if (item.deptOnly && nodeType !== "DEPARTMENT") return false;
  return true;
}

/** Nav groups for a mode, with items the user cannot reach removed and empty groups dropped. */
export function navFor(mode: Mode, roles: RoleKind[], nodeType: NodeType | null): NavGroup[] {
  return NAV[mode]
    .map((g) => ({ ...g, items: g.items.filter((i) => allows(i, roles, nodeType)) }))
    .filter((g) => g.items.length > 0);
}

/** Modes with at least one reachable item. An admin sees Manage and Me but not Analyse. */
export function modesFor(roles: RoleKind[], nodeType: NodeType | null): { key: Mode; label: string }[] {
  return MODES.filter((m) => navFor(m.key, roles, nodeType).length > 0);
}

/** Where a given role set should land after signing in. */
export function landingPathFor(roles: RoleKind[], nodeType: NodeType | null): string {
  const modes = modesFor(roles, nodeType);
  if (modes.length === 0) return "/me/profile";
  return navFor(modes[0].key, roles, nodeType)[0].items[0].path;
}

/** True when the user may open this path at all. Backs the (shell) layout's server-side
 *  requireAccess() check. */
export function canAccessPath(pathname: string, roles: RoleKind[], nodeType: NodeType | null): boolean {
  const item = allItems().find((i) => pathname === i.path || pathname.startsWith(i.path + "/"));
  if (!item) return true; // not a nav destination (e.g. a detail route) — let the page/action decide
  return allows(item, roles, nodeType);
}

function allItems(): NavItem[] {
  return (Object.keys(NAV) as Mode[]).flatMap((m) => NAV[m].flatMap((g) => g.items));
}

/** Which mode owns a given pathname — drives both the top-bar highlight and the sidebar. */
export function modeForPath(pathname: string): Mode {
  if (pathname.startsWith("/analyse")) return "analyse";
  if (pathname.startsWith("/respond")) return "respond";
  if (pathname.startsWith("/me")) return "me";
  return "manage";
}

/** The nav key for a pathname, used to highlight the active sidebar row. */
export function screenKeyForPath(pathname: string): string {
  const mode = modeForPath(pathname);
  const items = NAV[mode].flatMap((g) => g.items);
  const match = items
    .filter((i) => pathname === i.path || pathname.startsWith(i.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match?.key ?? items[0]?.key ?? "";
}
