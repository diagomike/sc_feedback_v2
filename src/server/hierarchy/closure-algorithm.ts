/**
 * Pure BFS over the hierarchy edge set — no Prisma/Next dependency, so it's directly
 * unit-testable and reusable from the seed script. Ported unchanged from v1
 * (apps/api/src/hierarchy/closure-algorithm.ts).
 */

export interface ClosureEdge {
  parentId: string;
  childId: string;
}

export interface ClosureRow {
  ancestorId: string;
  descendantId: string;
  depth: number;
}

/**
 * For every node, BFS outward over `edges` and record the shortest depth to each
 * reachable node (including itself at depth 0). A node may have multiple parents
 * (this is a DAG) — when several paths reach the same descendant, the minimum
 * depth wins.
 */
export function computeClosureRows(nodeIds: string[], edges: ClosureEdge[]): ClosureRow[] {
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    const list = childrenOf.get(edge.parentId) ?? [];
    list.push(edge.childId);
    childrenOf.set(edge.parentId, list);
  }

  const rows: ClosureRow[] = [];

  for (const root of nodeIds) {
    const depthOf = new Map<string, number>([[root, 0]]);
    const queue: string[] = [root];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const currentDepth = depthOf.get(current)!;
      for (const child of childrenOf.get(current) ?? []) {
        if (!depthOf.has(child)) {
          depthOf.set(child, currentDepth + 1);
          queue.push(child);
        }
      }
    }
    for (const [descendantId, depth] of depthOf) {
      rows.push({ ancestorId: root, descendantId, depth });
    }
  }

  return rows;
}
