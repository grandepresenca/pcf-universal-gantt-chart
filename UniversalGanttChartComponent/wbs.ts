// wbs.ts — derive a task's parent from its WBS code, and cross-check parents.
//
// Two roles: the parent source if the klein_parenttaskid lookups cannot be
// recovered (plan B), and the validation net for the lookup-derived parents
// (crossCheckParents). Pure: no React, no PCF, no Gantt types. The parentOf
// it produces is exactly a HierNode.parentId (original id or null), so
// buildHierarchy consumes it unchanged.

import { normalizeId } from "./hierarchy";

/** A task as far as WBS parenting cares. */
export interface WbsTask {
  readonly id: string;
  readonly wbs: unknown;
  readonly projectId: unknown;
}

/** The result of buildWbsParentMap, with diagnostics so it can be audited. */
export interface WbsParents {
  /** Task id -> parent task id (original form), or null for a root. Every input id is present. */
  readonly parentOf: ReadonlyMap<string, string | null>;
  /** Ids whose WBS or projectId could not be used (they get null and are nobody's parent). */
  readonly unusable: readonly string[];
  /** Same project and WBS on more than one task: the first is the parent; all ids listed. */
  readonly duplicates: readonly WbsDuplicate[];
  /** Ids whose parent was found only by skipping missing WBS levels. */
  readonly gapResolved: readonly string[];
}

export interface WbsDuplicate {
  /** The normalized project id. */
  readonly projectId: string;
  /** The canonical WBS (segments joined by "."). */
  readonly wbs: string;
  /** Every task id with that project and WBS, in input order. */
  readonly ids: readonly string[];
}

const NUMERIC_SEGMENT = /^\d+$/;

/**
 * The WBS segments ("5.15.4" -> ["5", "15", "4"]), or undefined when the
 * value is not a usable WBS: not a string, blank, an empty segment (leading,
 * trailing or double dot) or a non-numeric segment. Segments are trimmed and
 * compared exactly: no leading-zero folding, so "1" and "01" differ.
 */
export function parseWbs(wbs: unknown): readonly string[] | undefined {
  if (typeof wbs !== "string") {
    return undefined;
  }
  const segments = wbs.split(".").map((segment) => segment.trim());
  return segments.every((segment) => NUMERIC_SEGMENT.test(segment)) ? segments : undefined;
}

/** The normalized project id, or undefined when it cannot scope a match. */
function projectKey(projectId: unknown): string | undefined {
  if (typeof projectId !== "string") {
    return undefined;
  }
  const key = normalizeId(projectId);
  return key === "" ? undefined : key;
}

interface Located {
  readonly id: string;
  readonly project: string;
  readonly segments: readonly string[];
}

/** Splits tasks into usable (with project and segments) and unusable ids. */
function locate(tasks: readonly WbsTask[]): { located: Located[]; unusable: string[] } {
  const located: Located[] = [];
  const unusable: string[] = [];
  tasks.forEach((task) => {
    const project = projectKey(task.projectId);
    const segments = parseWbs(task.wbs);
    if (project === undefined || segments === undefined) {
      unusable.push(task.id);
    } else {
      located.push({ id: task.id, project, segments });
    }
  });
  return { located, unusable };
}

/** The tasks sharing one WBS in one project (more than one = duplicate). */
interface WbsGroup {
  readonly project: string;
  readonly wbs: string;
  readonly ids: string[];
}

/** Collision-free key for a (project, WBS) pair. */
const groupKey = (project: string, wbs: string): string => JSON.stringify([project, wbs]);

/** (project, WBS) -> its group, in first-seen order; ids in input order. */
function groupByWbs(located: readonly Located[]): ReadonlyMap<string, WbsGroup> {
  const groups = new Map<string, WbsGroup>();
  located.forEach((task) => {
    const wbs = task.segments.join(".");
    const key = groupKey(task.project, wbs);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { project: task.project, wbs, ids: [task.id] });
    } else {
      group.ids.push(task.id);
    }
  });
  return groups;
}

/**
 * The nearest existing ancestor of `task` in its own project, walking up one
 * level at a time ("5.15.4.12" -> 5.15.4, then 5.15, then 5). `skipped` says
 * whether a missing level had to be skipped.
 */
function nearestAncestor(
  task: Located,
  groups: ReadonlyMap<string, WbsGroup>
): { parent: string; skipped: boolean } | undefined {
  for (let length = task.segments.length - 1; length >= 1; length--) {
    const group = groups.get(groupKey(task.project, task.segments.slice(0, length).join(".")));
    if (group !== undefined) {
      return { parent: group.ids[0], skipped: length < task.segments.length - 1 };
    }
  }
  return undefined;
}

/**
 * Each task's parent by WBS: the task in the SAME project whose WBS is the
 * nearest existing ancestor of this task's WBS. Level-1 WBS ("13") is a
 * root; so is a task with no existing ancestor. Unusable WBS or project ->
 * no parent. Duplicates: the first task (input order) is the parent for its
 * WBS. A parent always has fewer segments, so the result has no cycles.
 * O(n * depth). Does not mutate `tasks`.
 */
export function buildWbsParentMap(tasks: readonly WbsTask[]): WbsParents {
  const { located, unusable } = locate(tasks);
  const groups = groupByWbs(located);
  const parentOf = new Map<string, string | null>();
  tasks.forEach((task) => parentOf.set(task.id, null));
  const gapResolved: string[] = [];
  located.forEach((task) => {
    const found = nearestAncestor(task, groups);
    if (found !== undefined) {
      parentOf.set(task.id, found.parent);
      if (found.skipped) {
        gapResolved.push(task.id);
      }
    }
  });
  const duplicates = Array.from(groups.values())
    .filter((group) => group.ids.length > 1)
    .map((group) => ({ projectId: group.project, wbs: group.wbs, ids: group.ids }));
  return { parentOf, unusable, duplicates, gapResolved };
}

/** How two parent sources compare, per task. */
export interface ParentCrossCheck {
  /** Same parent in both (ids compared normalized), including both roots. */
  readonly agree: readonly string[];
  /** Both have a parent, but different ones. */
  readonly disagree: readonly { id: string; lookup: string; wbs: string }[];
  /** Only the lookup gives a parent; WBS says root. */
  readonly lookupOnly: readonly { id: string; lookup: string }[];
  /** Only WBS gives a parent; the lookup says root. */
  readonly wbsOnly: readonly { id: string; wbs: string }[];
}

/**
 * Compares lookup-derived parents (klein_parenttaskid) with WBS-derived
 * parents, task by task. A task missing from one map counts as having no
 * parent there (only happens when the maps were built from different task
 * sets). Order: the lookup map's ids, then ids only in the WBS map.
 */
export function crossCheckParents(
  lookupParentOf: ReadonlyMap<string, string | null>,
  wbsParentOf: ReadonlyMap<string, string | null>
): ParentCrossCheck {
  const agree: string[] = [];
  const disagree: { id: string; lookup: string; wbs: string }[] = [];
  const lookupOnly: { id: string; lookup: string }[] = [];
  const wbsOnly: { id: string; wbs: string }[] = [];
  const ids = Array.from(lookupParentOf.keys()).concat(
    Array.from(wbsParentOf.keys()).filter((id) => !lookupParentOf.has(id))
  );
  ids.forEach((id) => {
    const lookup = lookupParentOf.get(id) ?? null;
    const wbs = wbsParentOf.get(id) ?? null;
    if (lookup === null) {
      if (wbs === null) {
        agree.push(id);
      } else {
        wbsOnly.push({ id, wbs });
      }
    } else if (wbs === null) {
      lookupOnly.push({ id, lookup });
    } else if (normalizeId(lookup) === normalizeId(wbs)) {
      agree.push(id);
    } else {
      disagree.push({ id, lookup, wbs });
    }
  });
  return { agree, disagree, lookupOnly, wbsOnly };
}
