// task-mapping.ts — pure pieces of turning a dataset record into a Gantt Task.
//
// Separate from hierarchy.ts on purpose: hierarchy.ts is framework-free tree
// logic, while these helpers speak gantt-task-react's types.

import { Task } from "gantt-task-react";
import { TaskType } from "gantt-task-react/dist/types/public-types";
import { HierNode } from "./hierarchy";

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
