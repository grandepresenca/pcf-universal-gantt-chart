// hierarchy.ts — pure tree logic for the Gantt (fork customization #1).
//
// Pure by design (ADR: keep logic pure, testable, out of the render path):
// input is a flat list of nodes with an optional parent id; output is an
// ordered, depth-annotated list ready for the list grid to indent. No React,
// no PCF, no Dataverse types in here. The contract is pinned by
// hierarchy.test.ts.
//
// Everything is iterative (explicit stacks, visited flags), never recursive:
// a 10,000-deep chain must not overflow the stack, and a parent cycle must
// terminate. gantt-task-react's own getChildren recurses with no cycle
// protection, which is why the tree is built here and not in the library.

/** A task as far as hierarchy cares — the Gantt/PCF types map onto this. */
export interface HierNode {
  id: string;
  parentId: string | null;
}

/** A node plus where it sits in the tree, in display order. */
export interface OrderedNode<T extends HierNode> {
  node: T;
  /** 0 for roots, parent depth + 1 otherwise. */
  depth: number;
}

/** First index per id (a duplicate id never replaces the first). */
function indexById<T extends HierNode>(nodes: readonly T[]): ReadonlyMap<string, number> {
  const byId = new Map<string, number>();
  nodes.forEach((node, i) => {
    if (!byId.has(node.id)) {
      byId.set(node.id, i);
    }
  });
  return byId;
}

/** A root has no parent id, or a parent id that is not in the set (orphan). */
function isRoot(node: HierNode, byId: ReadonlyMap<string, number>): boolean {
  return node.parentId === null || !byId.has(node.parentId);
}

/** Parent id -> child indexes, in input order (so siblings stay stable). */
function indexChildren<T extends HierNode>(
  nodes: readonly T[],
  byId: ReadonlyMap<string, number>
): ReadonlyMap<string, readonly number[]> {
  const children = new Map<string, number[]>();
  nodes.forEach((node, i) => {
    if (node.parentId === null || isRoot(node, byId)) {
      return;
    }
    const list = children.get(node.parentId);
    if (list === undefined) {
      children.set(node.parentId, [i]);
    } else {
      list.push(i);
    }
  });
  return children;
}

interface TreeIndex<T extends HierNode> {
  readonly nodes: readonly T[];
  readonly children: ReadonlyMap<string, readonly number[]>;
  readonly visited: boolean[];
  readonly out: OrderedNode<T>[];
}

/**
 * Emit the subtree under `start` depth-first (pre-order), skipping nodes
 * already emitted. Iterative: children are pushed in reverse so they pop in
 * input order.
 */
function emitSubtree<T extends HierNode>(tree: TreeIndex<T>, start: number): void {
  const stack: { index: number; depth: number }[] = [{ index: start, depth: 0 }];
  while (stack.length > 0) {
    const top = stack.pop() as { index: number; depth: number };
    if (tree.visited[top.index]) {
      continue;
    }
    tree.visited[top.index] = true;
    const node = tree.nodes[top.index];
    tree.out.push({ node, depth: top.depth });
    const kids = tree.children.get(node.id) ?? [];
    for (let k = kids.length - 1; k >= 0; k--) {
      if (!tree.visited[kids[k]]) {
        stack.push({ index: kids[k], depth: top.depth + 1 });
      }
    }
  }
}

/**
 * Order a flat node list into parent-before-children display order, annotating
 * each with its depth for indentation.
 *
 * Contract (see hierarchy.test.ts):
 * - Roots (parentId null, or parentId not present in the set) come out at
 *   depth 0, in their original relative order.
 * - Each node appears immediately within its parent's subtree, before the
 *   parent's later siblings (depth-first).
 * - depth is exactly the distance to the nearest root.
 * - Every input node appears exactly once in the output (no drops, no dupes).
 * - Orphans (parentId points to a non-existent id) are treated as roots, not
 *   dropped.
 * - Cycles (a -> b -> a, or a -> a) must NOT cause infinite recursion or a
 *   stack overflow; each node in a cycle still appears exactly once. The
 *   function must terminate on any input.
 * - Order among siblings preserves input order (stable).
 *
 * Cycles: nodes on a parent cycle have no root above them. After all real
 * roots are emitted, the first not-yet-emitted node in input order becomes a
 * depth-0 entry point and its subtree is emitted; repeat until every node is
 * out. Nodes sharing a duplicate id are each emitted once (by index).
 */
export function orderByHierarchy<T extends HierNode>(nodes: readonly T[]): OrderedNode<T>[] {
  const byId = indexById(nodes);
  const tree: TreeIndex<T> = {
    nodes,
    children: indexChildren(nodes, byId),
    visited: nodes.map(() => false),
    out: [],
  };
  nodes.forEach((node, i) => {
    if (!tree.visited[i] && isRoot(node, byId)) {
      emitSubtree(tree, i);
    }
  });
  // Anything left is on (or hangs below) a parent cycle.
  nodes.forEach((_node, i) => {
    if (!tree.visited[i]) {
      emitSubtree(tree, i);
    }
  });
  return tree.out;
}

/**
 * Depth of a single node by walking parents, cycle-safe (returns a finite
 * number even if the chain loops). Exposed for reuse/testing; orderByHierarchy
 * does not use it.
 *
 * Counts parent steps until a node with no parent, a parent missing from
 * byId, or a node already seen on this walk (a cycle). An id that is not in
 * byId has depth 0.
 */
export function depthOf<T extends HierNode>(
  id: string,
  byId: ReadonlyMap<string, T>
): number {
  const seen = new Set<string>([id]);
  let current = byId.get(id);
  let depth = 0;
  while (current !== undefined && current.parentId !== null) {
    const parentId = current.parentId;
    if (seen.has(parentId) || !byId.has(parentId)) {
      break;
    }
    seen.add(parentId);
    current = byId.get(parentId);
    depth++;
  }
  return depth;
}
