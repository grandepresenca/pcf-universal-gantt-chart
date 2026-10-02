// task-mapping.ts — pure pieces of turning a dataset record into a Gantt Task.
//
// Separate from hierarchy.ts on purpose: hierarchy.ts is framework-free tree
// logic, while these helpers speak gantt-task-react's types.

import { Task } from "gantt-task-react";
import {
  HierNode,
  HierarchyRow,
  buildRows,
  findCycleIds,
  orderByHierarchy,
  sortByStart,
  visibleRows,
} from "./hierarchy";

/** A built task plus its parent's record id (null if none in the view). */
export interface TaskNode extends HierNode {
  readonly task: Task;
}

/** The ordered rows for the list and bars, plus the ids on parent cycles. */
export interface Hierarchy {
  readonly rows: readonly HierarchyRow<TaskNode>[];
  readonly cycleIds: readonly string[];
}

/**
 * The display pipeline: siblings sorted by start (view order breaks ties),
 * then parent-before-children depth-first order with depths, then
 * hasChildren for the expander. cycleIds lists the tasks on a parent cycle
 * (they are still each shown once) for the one-time warning.
 */
export function buildHierarchy(nodes: readonly TaskNode[]): Hierarchy {
  const sorted = sortByStart(nodes, (node) => node.task.start);
  return {
    rows: buildRows(orderByHierarchy(sorted)),
    cycleIds: findCycleIds(nodes),
  };
}

/**
 * The tasks <Gantt> draws: the rows still visible once every collapsed
 * task's whole subtree is hidden (the collapsed task itself stays), in tree
 * order.
 */
export function visibleTasks(
  rows: readonly HierarchyRow<TaskNode>[],
  collapsed: ReadonlySet<string>
): Task[] {
  return visibleRows(rows, collapsed).map((row) => row.node.task);
}

/** How many cycle ids the warning lists before summarizing the rest. */
const MAX_LISTED_CYCLE_IDS = 10;

/**
 * The console warning for tasks on a parent cycle, or undefined when there
 * are none. Maker-facing data error, English only (like the extra-columns
 * notice). Emitting it once per control is the caller's job.
 */
export function cycleWarning(cycleIds: readonly string[]): string | undefined {
  if (cycleIds.length === 0) {
    return undefined;
  }
  const listed = cycleIds.slice(0, MAX_LISTED_CYCLE_IDS).join(", ");
  const more =
    cycleIds.length > MAX_LISTED_CYCLE_IDS
      ? ` and ${cycleIds.length - MAX_LISTED_CYCLE_IDS} more`
      : "";
  return (
    `Hierarchy: ${cycleIds.length} task(s) have parent links that form a cycle ` +
    `(${listed}${more}). Each is still shown once; check their Parent Task values.`
  );
}
