// hierarchy.ts  pure tree logic for the Gantt, extracted from generateTasks.
//
// Pure by design (ADR: keep logic pure, testable, out of the render path):
// input is a flat list of nodes with an optional parent id; output is an
// ordered, depth-annotated list ready for the list grid to indent. No React,
// no PCF, no Dataverse types in here.
//
// Implementation is intentionally omitted  this is the contract the tests in
// hierarchy.test.ts pin down. pcf-dev implements against these tests.

/** A task as far as hierarchy cares  the Gantt/PCF types map onto this. */
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
 */
export function orderByHierarchy<T extends HierNode>(nodes: readonly T[]): OrderedNode<T>[] {
  void nodes;
  throw new Error("not implemented  pcf-dev to implement against hierarchy.test.ts");
}

/**
 * Depth of a single node by walking parents, cycle-safe (returns a finite
 * number even if the chain loops). Exposed for reuse/testing; orderByHierarchy
 * may or may not use it internally.
 */
export function depthOf<T extends HierNode>(
  id: string,
  byId: ReadonlyMap<string, T>
): number {
  void id;
  void byId;
  throw new Error("not implemented  pcf-dev to implement against hierarchy.test.ts");
}
