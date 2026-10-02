// task-mapping.ts — pure pieces of turning a dataset record into a Gantt Task.
//
// Separate from hierarchy.ts on purpose: hierarchy.ts is framework-free tree
// logic, while these helpers speak gantt-task-react's types.

import { Task } from "gantt-task-react";
import { TaskType } from "gantt-task-react/dist/types/public-types";
import {
  HierNode,
  HierarchyRow,
  buildRows,
  findCycleIds,
  orderByHierarchy,
  sortByStart,
} from "./hierarchy";

/** A built task plus its parent's record id (null if none in the view). */
export interface TaskNode extends HierNode {
  readonly task: Task;
}

/**
 * How a task attaches to its parent in gantt-task-react: under a "project"
 * parent it joins that project's group (task.project, which drives
 * collapse); under any other parent it gets a dependency arrow from it.
 */
export function linkParent(
  parentType: TaskType,
  parentRecordId: string
): Pick<Task, "project" | "dependencies"> {
  return parentType === "project"
    ? { project: parentRecordId }
    : { dependencies: [parentRecordId] };
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
