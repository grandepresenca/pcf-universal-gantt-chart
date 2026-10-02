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

// ---------------------------------------------------------------------------
// Helpers around the tree: reading and normalizing parent ids, sibling order,
// expander rows, collapse filtering and cycle reporting. All pure.
// ---------------------------------------------------------------------------

/**
 * Canonical form of a record id for matching parent links: trimmed, one pair
 * of surrounding braces removed, lower-cased. Applied to BOTH sides (record
 * ids and parent ids) when building nodes, so "{ABC-1}" and "abc-1" match.
 * Only for matching: the Gantt keeps the record's original id.
 */
export function normalizeId(id: string): string {
  const trimmed = id.trim();
  const unbraced =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  return unbraced.trim().toLowerCase();
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** The raw id inside a lookup's `id`: `{ guid: string }`, or a plain string. */
function rawLookupId(id: unknown): string | undefined {
  if (typeof id === "string") {
    return id;
  }
  if (isObject(id) && typeof id.guid === "string") {
    return id.guid;
  }
  return undefined;
}

/**
 * The normalized parent id from a dataset lookup value, or undefined when the
 * value is not a lookup with a usable id. Replaces the unchecked
 * EntityReference cast: anything unexpected (null, a raw string such as the
 * harness's mock "val", a number, a missing or blank guid) means "no parent",
 * never a crash. Deliberately strict: a plain string value is NOT accepted
 * as an id.
 */
export function readParentId(value: unknown): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const raw = rawLookupId(value.id);
  if (raw === undefined) {
    return undefined;
  }
  const id = normalizeId(raw);
  return id === "" ? undefined : id;
}

/**
 * Normalized id -> original record id, for matching parent lookups against
 * the records in the view. First wins: a later id that normalizes the same
 * never replaces an earlier one (same convention as orderByHierarchy). Ids
 * that normalize to "" are skipped. Values keep the record's original form.
 */
export function indexRecordIds(recordIds: readonly string[]): ReadonlyMap<string, string> {
  const byNormalized = new Map<string, string>();
  recordIds.forEach((recordId) => {
    const key = normalizeId(recordId);
    if (key !== "" && !byNormalized.has(key)) {
      byNormalized.set(key, recordId);
    }
  });
  return byNormalized;
}

/**
 * The original record id of the parent a lookup value points at, or
 * undefined when the value is not a usable lookup (see readParentId) or its
 * parent is not among the indexed records.
 */
export function resolveParentRecordId(
  value: unknown,
  byNormalized: ReadonlyMap<string, string>
): string | undefined {
  const parentId = readParentId(value);
  return parentId === undefined ? undefined : byNormalized.get(parentId);
}

/** getTime(), with an invalid date sorting after every valid one. */
function sortableTime(date: Date): number {
  const time = date.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Stable sort by start date, earliest first; equal (or both invalid) starts
 * keep their input order, i.e. the view's order breaks ties. Run BEFORE
 * orderByHierarchy: because that keeps siblings in input order, siblings at
 * every level (roots included) come out by start date. In-memory only — the
 * view still defines which records arrive. Does not mutate `items`.
 */
export function sortByStart<T>(items: readonly T[], startOf: (item: T) => Date): T[] {
  return items
    .map((item, index) => ({ item, index, time: sortableTime(startOf(item)) }))
    .sort((a, b) => (a.time === b.time ? a.index - b.index : a.time < b.time ? -1 : 1))
    .map((entry) => entry.item);
}

/** An ordered node plus whether it has children (drives the expander). */
export interface HierarchyRow<T extends HierNode> extends OrderedNode<T> {
  hasChildren: boolean;
}

/**
 * Adds hasChildren to orderByHierarchy's output. In depth-first order a node
 * has children exactly when the next row is one level deeper.
 */
export function buildRows<T extends HierNode>(
  ordered: readonly OrderedNode<T>[]
): HierarchyRow<T>[] {
  return ordered.map((row, i) => {
    const next = ordered[i + 1];
    return {
      node: row.node,
      depth: row.depth,
      hasChildren: next !== undefined && next.depth === row.depth + 1,
    };
  });
}

/**
 * The rows still shown when the nodes in `collapsed` (by node id) are
 * collapsed: a collapsed node stays visible, its whole subtree (children,
 * grandchildren, ...) is hidden. One pass over depth-first rows. Ids in
 * `collapsed` that match no row, or a row without children, change nothing.
 * Returns `rows` itself when nothing is collapsed.
 */
export function visibleRows<T extends HierNode>(
  rows: readonly HierarchyRow<T>[],
  collapsed: ReadonlySet<string>
): readonly HierarchyRow<T>[] {
  if (collapsed.size === 0) {
    return rows;
  }
  const out: HierarchyRow<T>[] = [];
  let hiddenBelowDepth: number | null = null;
  rows.forEach((row) => {
    if (hiddenBelowDepth !== null && row.depth > hiddenBelowDepth) {
      return;
    }
    hiddenBelowDepth = null;
    out.push(row);
    if (row.hasChildren && collapsed.has(row.node.id)) {
      hiddenBelowDepth = row.depth;
    }
  });
  return out;
}

/**
 * The collapsed set with `id` toggled: added if absent, removed if present.
 * Always returns a NEW set and never mutates `collapsed`, so a React state
 * update sees the change.
 */
export function toggleCollapsed(collapsed: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(collapsed);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** The parent index of node i (first index for its parent id), or -1. */
function parentIndex<T extends HierNode>(
  nodes: readonly T[],
  byId: ReadonlyMap<string, number>,
  i: number
): number {
  const parentId = nodes[i].parentId;
  return parentId === null ? -1 : byId.get(parentId) ?? -1;
}

const UNSEEN = 0;
const ON_WALK = 1;
const DONE = 2;

/** Walk parents from `start`; mark nodes that close a loop on this walk. */
function markCyclesFrom<T extends HierNode>(
  nodes: readonly T[],
  byId: ReadonlyMap<string, number>,
  state: number[],
  onCycle: boolean[],
  start: number
): void {
  const walk: number[] = [];
  let i = start;
  while (i !== -1 && state[i] === UNSEEN) {
    state[i] = ON_WALK;
    walk.push(i);
    i = parentIndex(nodes, byId, i);
  }
  if (i !== -1 && state[i] === ON_WALK) {
    // i is on this walk again: everything from i onwards is the loop.
    walk.slice(walk.indexOf(i)).forEach((k) => (onCycle[k] = true));
  }
  walk.forEach((k) => (state[k] = DONE));
}

/**
 * Ids of nodes that lie ON a parent cycle (a -> a, a -> b -> a, ...), in
 * input order, each once. Nodes that merely hang below a cycle are not
 * included. For a one-time warning; orderByHierarchy already renders cycles
 * safely. Iterative, O(n).
 */
export function findCycleIds<T extends HierNode>(nodes: readonly T[]): string[] {
  const byId = indexById(nodes);
  const state = nodes.map(() => UNSEEN);
  const onCycle = nodes.map(() => false);
  nodes.forEach((_node, i) => markCyclesFrom(nodes, byId, state, onCycle, i));
  const ids = nodes.filter((_node, i) => onCycle[i]).map((node) => node.id);
  return Array.from(new Set(ids));
}
