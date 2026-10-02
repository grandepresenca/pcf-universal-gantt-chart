// levels.ts — shared rules used by analysis.ts and projects.ts.

import { DvTask, PwaTask } from "./extracts";

/** PWA's level-0 project summary task (excluded from every comparison). */
export const isPwaLevel0 = (t: PwaTask): boolean => t.isProjectSummary === true || t.outlineLevel === 0;

/** Dataverse's level-0 row (excluded from every comparison). */
export const isDvLevel0 = (t: DvTask): boolean => t.outlineLevel === 0;

/** A complete count plus the first `limit` items. */
export interface Listing<T> {
  readonly count: number;
  readonly items: readonly T[];
}

export const listing = <T>(items: readonly T[], limit: number): Listing<T> => ({
  count: items.length,
  items: items.slice(0, limit),
});
