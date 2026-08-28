import "server-only";
import { prisma } from "@/server/db";

export interface ScopeInfo {
  nodeId: string;
  name: string;
  level: number;
  isLeaf: boolean;
  teacherCount: number;
  studentCount: number;
  path: string[];
}

export interface MeContext {
  scope: ScopeInfo | null;
  minN: number;
  pendingTaskCount: number;
}

/**
 * Shortest ancestor chain from a root down to `nodeId`, for the sidebar breadcrumb.
 * A node can have several parents (this is a DAG), so there is genuinely more than one
 * route to it — this walks the closure by descending depth and picks one ancestor per
 * level, yielding a stable shortest chain without raw SQL. Ported from v1's MeService.
 */
async function ancestorPath(nodeId: string): Promise<string[]> {
  const rows = await prisma.hierarchyClosure.findMany({
    where: { descendantId: nodeId },
    select: { ancestorId: true, depth: true },
    orderBy: { depth: "desc" },
  });
  if (rows.length === 0) return [];

  const nodes = await prisma.hierarchyNode.findMany({
    where: { id: { in: rows.map((r) => r.ancestorId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));

  const seenDepths = new Set<number>();
  const path: string[] = [];
  for (const row of rows) {
    if (seenDepths.has(row.depth)) continue;
    seenDepths.add(row.depth);
    const name = nameById.get(row.ancestorId);
    if (name) path.push(name);
  }
  return path;
}

async function getScope(userId: string): Promise<ScopeInfo | null> {
  const node = await prisma.hierarchyNode.findUnique({ where: { userId } });
  if (!node) return null; // teachers and students occupy no node

  const [childCount, teacherCount, studentCount] = await Promise.all([
    prisma.hierarchyEdge.count({ where: { parentId: node.id } }),
    prisma.membership.count({ where: { nodeId: node.id, kind: "TEACHER" } }),
    prisma.membership.count({ where: { nodeId: node.id, kind: "STUDENT" } }),
  ]);

  return {
    nodeId: node.id,
    name: node.name,
    level: node.level,
    isLeaf: childCount === 0,
    teacherCount,
    studentCount,
    path: await ancestorPath(node.id),
  };
}

/**
 * The min-N the status bar advertises. Deliberately ignores MANAGER-only campaigns (a
 * head's assessment legitimately runs at min-N 1 — a teacher has exactly one direct
 * manager, so that feedback is identified by design, not anonymous). Where several open
 * campaigns disagree, reports the LOWEST — this bar states a promise, so the weakest
 * protection actually in force is the only honest number to show.
 */
async function anonymousMinN(nodeId: string | undefined): Promise<number> {
  const DEFAULT_MIN_N = 5;
  if (!nodeId) return DEFAULT_MIN_N;

  const campaigns = await prisma.campaign.findMany({
    where: {
      nodeId,
      status: "OPEN",
      campaignTemplates: { some: { targetGroup: { in: ["STUDENT", "PEER"] } } },
    },
    select: { minResponses: true },
  });
  if (campaigns.length === 0) return DEFAULT_MIN_N;
  return Math.min(...campaigns.map((c) => c.minResponses));
}

/** Everything the app shell needs on mount: managerial scope for the sidebar and status
 *  bar, the min-N in force, and the pending-task badge. */
export async function getMeContext(userId: string): Promise<MeContext> {
  const [scope, pendingTaskCount] = await Promise.all([
    getScope(userId),
    prisma.responseTask.count({
      where: { respondentId: userId, completedAt: null, campaign: { status: "OPEN" } },
    }),
  ]);

  return { scope, minN: await anonymousMinN(scope?.nodeId), pendingTaskCount };
}

/**
 * All node ids visible to a manager: their own node plus every descendant reachable via
 * the closure table. ADMIN sees everything. Distinct from the department-scoping
 * `ownNode()` pattern used by People/Groups/Templates/Campaigns — this answers "what can
 * this manager see below them", ownNode answers "which single node do they operate".
 */
export async function visibleNodeIds(user: { id: string; roles: string[] }): Promise<string[]> {
  if (user.roles.includes("ADMIN")) {
    const all = await prisma.hierarchyNode.findMany({ select: { id: true } });
    return all.map((n) => n.id);
  }
  const node = await prisma.hierarchyNode.findUnique({ where: { userId: user.id } });
  if (!node) return [];
  const rows = await prisma.hierarchyClosure.findMany({
    where: { ancestorId: node.id },
    select: { descendantId: true },
  });
  return rows.map((r) => r.descendantId);
}

/** Throws unless the caller's own hierarchy node is a DEPARTMENT — the scoping guard
 *  behind People/Groups/CSV-import/Evaluation-letters/Campaigns. An Office/College
 *  manager has no roster of their own to act on (see nav.ts's `deptOnly` doc comment). */
export async function ownDepartmentNode(userId: string) {
  const node = await prisma.hierarchyNode.findUnique({ where: { userId } });
  if (!node) throw new Error("You do not occupy a hierarchy node");
  if (node.type !== "DEPARTMENT") {
    throw new Error("Only a department head can access this — your node is an Office/College");
  }
  return node;
}

/** The caller's own node, unrestricted by type — unlike ownDepartmentNode, any manager
 *  (Office/College/Department) may own templates, since templates are authored for
 *  reuse down the hierarchy, not tied to running a department's own roster. */
export async function ownNode(userId: string) {
  const node = await prisma.hierarchyNode.findUnique({ where: { userId } });
  if (!node) throw new Error("You do not manage a department");
  return node;
}
