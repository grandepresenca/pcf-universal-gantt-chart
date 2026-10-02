// analysis.ts — the three-way migration validation, pure. Input: the parsed
// Dataverse and PWA extracts. Output: a ValidationResult the report renders.
//
// Join: PWA TaskId = Dataverse klein_legacyid (confirmed on real data), both
// normalized (normalizeId), so GUID case and braces never break the join.
// All parent ids are compared in the PWA id space.
//
// Comparison basis (stated in every report): the level-0 project summary task
// is EXCLUDED on both sides — PWA rows with TaskIsProjectSummary = true or
// TaskOutlineLevel = 0, Dataverse rows with klein_outlinelevel = 0. Whether a
// project has its level-0 row is reported separately, so it can never show as
// a +1 count difference. A parent that IS the level-0 row counts as "no parent"
// on every side.

import { normalizeId } from "../../../UniversalGanttChartComponent/hierarchy";
import { buildWbsParentMap, crossCheckParents, parseWbs, WbsParents } from "../../../UniversalGanttChartComponent/wbs";
import { DvTask, PwaTask } from "./extracts";
import { Listing, isDvLevel0, isPwaLevel0, listing } from "./levels";
import { checkProjects } from "./projects";

export const BASIS =
  "Counts and comparisons EXCLUDE the level-0 project summary task on both sides " +
  "(PWA: TaskIsProjectSummary = true or TaskOutlineLevel = 0; Dataverse: klein_outlinelevel = 0). " +
  "Whether each project has its level-0 row is shown separately (L0 columns). " +
  "Inactive PWA tasks are counted; the 'PWA inactive' column shows how many.";

/** A Dataverse lookup whose target is not in the extract (or has no legacy id). */
export const DANGLING = "dangling:";

export type { Listing };

export type ParentVerdict = "agree" | "dataverse-differs" | "wbs-differs" | "pwa-differs" | "all-differ";

export interface TaskRef {
  readonly id: string;
  readonly name: string | null;
  readonly wbs: string | null;
  readonly outlineLevel: number | null;
  readonly project: string | null;
}

export interface ParentRow {
  readonly task: TaskRef;
  readonly pwa: TaskRef | null;
  readonly dataverse: TaskRef | null;
  readonly wbs: TaskRef | null;
}

export interface PairSummary {
  readonly agree: number;
  readonly disagree: number;
  readonly onlyLeft: number;
  readonly onlyRight: number;
}

export interface ProjectRow {
  readonly projectId: string;
  readonly name: string | null;
  readonly pwaCount: number;
  readonly pwaInactive: number;
  readonly dvCount: number;
  readonly missingInDv: number;
  readonly extraInDv: number;
  readonly pwaLevel0: boolean;
  readonly dvLevel0: boolean;
}

export interface ValidationResult {
  readonly basis: string;
  readonly totals: {
    readonly pwaTasks: number;
    readonly pwaLevel0: number;
    readonly dvTasks: number;
    readonly dvLevel0: number;
    readonly dvWithoutLegacyId: number;
    readonly joined: number;
  };
  readonly missingInDv: Listing<TaskRef>;
  readonly extraInDv: Listing<TaskRef>;
  readonly parents: {
    readonly verdicts: Readonly<Record<ParentVerdict, number>>;
    readonly pairs: { readonly pwaVsDataverse: PairSummary; readonly pwaVsWbs: PairSummary; readonly dataverseVsWbs: PairSummary };
    readonly examples: Readonly<Record<Exclude<ParentVerdict, "agree">, Listing<ParentRow>>>;
  };
  readonly dataverse: {
    readonly orphans: Listing<TaskRef>;
    readonly danglingParents: Listing<TaskRef>;
    readonly duplicateLegacyIds: Listing<{ legacyId: string; activityIds: readonly string[] }>;
    readonly wbsUnusable: Listing<TaskRef>;
    readonly wbsDuplicates: Listing<{ project: string | null; wbs: string; tasks: readonly TaskRef[] }>;
    readonly wbsGaps: Listing<TaskRef>;
    readonly outlineVsDepth: Listing<{ task: TaskRef; depth: number }>;
    readonly wbsVsPwa: Listing<{ task: TaskRef; pwaWbs: string | null }>;
  };
  readonly projects: {
    readonly withDifferences: readonly ProjectRow[];
    readonly all: readonly ProjectRow[];
    readonly unmappedDvProjects: Listing<{ dvProjectId: string; name: string | null; count: number }>;
    readonly conflictingDvProjects: Listing<{ dvProjectId: string; name: string | null; pwaProjectIds: readonly string[] }>;
  };
}

/** Everything the checks look up, built once. Keys are normalized ids. */
interface Index {
  readonly pwaById: ReadonlyMap<string, PwaTask>;
  readonly dvByActivity: ReadonlyMap<string, DvTask>;
  /** First Dataverse row per legacy id. */
  readonly dvByLegacy: ReadonlyMap<string, DvTask>;
  readonly legacyDuplicates: ReadonlyMap<string, string[]>;
  readonly pwaTasks: readonly PwaTask[];
  readonly dvTasks: readonly DvTask[];
  /** Keys (normalized TaskId) present as non-level-0 on both sides. */
  readonly joined: readonly string[];
}

function indexDataverse(dvRows: readonly DvTask[]): Pick<Index, "dvByActivity" | "dvByLegacy" | "legacyDuplicates"> {
  const dvByActivity = new Map<string, DvTask>();
  const dvByLegacy = new Map<string, DvTask>();
  const legacyDuplicates = new Map<string, string[]>();
  dvRows.forEach((t) => {
    dvByActivity.set(normalizeId(t.activityid), t);
    if (t.legacyId === null) {
      return;
    }
    const key = normalizeId(t.legacyId);
    const seen = legacyDuplicates.get(key);
    if (seen === undefined) {
      legacyDuplicates.set(key, [t.activityid]);
      dvByLegacy.set(key, t);
    } else {
      seen.push(t.activityid);
    }
  });
  return { dvByActivity, dvByLegacy, legacyDuplicates };
}

function buildIndex(dvRows: readonly DvTask[], pwaRows: readonly PwaTask[]): Index {
  const pwaById = new Map<string, PwaTask>();
  pwaRows.forEach((t) => pwaById.set(normalizeId(t.taskId), t));
  const dv = indexDataverse(dvRows);
  const pwaTasks = pwaRows.filter((t) => !isPwaLevel0(t));
  const dvTasks = Array.from(dv.dvByLegacy.values()).filter((t) => !isDvLevel0(t));
  const dvKeys = new Set(dvTasks.map((t) => normalizeId(t.legacyId as string)));
  const joined = pwaTasks.map((t) => normalizeId(t.taskId)).filter((key) => dvKeys.has(key));
  return { pwaById, ...dv, pwaTasks, dvTasks, joined };
}

/** Only ever called on rows that have a klein_legacyid (the compared set). */
const dvRef = (t: DvTask): TaskRef => ({
  id: t.legacyId as string,
  name: t.subject,
  wbs: t.wbs,
  outlineLevel: t.outlineLevel,
  project: t.projectName,
});

const pwaRef = (t: PwaTask): TaskRef => ({
  id: t.taskId,
  name: t.name,
  wbs: t.wbs,
  outlineLevel: t.outlineLevel,
  project: t.projectName,
});

/** A parent id (PWA id space) as a readable reference. */
function parentRef(index: Index, id: string | null): TaskRef | null {
  if (id === null) {
    return null;
  }
  if (id.startsWith(DANGLING)) {
    return { id: id.slice(DANGLING.length), name: "(lookup target not in the extract)", wbs: null, outlineLevel: null, project: null };
  }
  const pwa = index.pwaById.get(id);
  if (pwa !== undefined) {
    return pwaRef(pwa);
  }
  const dv = index.dvByLegacy.get(id);
  return dv !== undefined ? dvRef(dv) : { id, name: null, wbs: null, outlineLevel: null, project: null };
}

/** PWA parent: ParentTaskId, or null when absent or the level-0 summary. */
function pwaParent(index: Index, t: PwaTask): string | null {
  if (t.parentTaskId === null) {
    return null;
  }
  const key = normalizeId(t.parentTaskId);
  const parent = index.pwaById.get(key);
  return parent !== undefined && isPwaLevel0(parent) ? null : key;
}

/** Dataverse parent in the PWA id space: the lookup target's klein_legacyid. */
function dvParent(index: Index, t: DvTask): string | null {
  if (t.parentActivityId === null) {
    return null;
  }
  const lookup = normalizeId(t.parentActivityId);
  const target = index.dvByActivity.get(lookup);
  if (target === undefined || target.legacyId === null) {
    return DANGLING + lookup;
  }
  return isDvLevel0(target) ? null : normalizeId(target.legacyId);
}

/** WBS-derived parents over every non-level-0 Dataverse task (ids = legacy keys). */
function wbsParents(index: Index): WbsParents {
  return buildWbsParentMap(
    index.dvTasks.map((t) => ({ id: normalizeId(t.legacyId as string), wbs: t.wbs, projectId: t.projectId }))
  );
}

function verdictOf(pwa: string | null, dv: string | null, wbs: string | null): ParentVerdict {
  if (pwa === dv && pwa === wbs) {
    return "agree";
  }
  if (pwa === wbs) {
    return "dataverse-differs";
  }
  if (pwa === dv) {
    return "wbs-differs";
  }
  return dv === wbs ? "pwa-differs" : "all-differ";
}

const pair = (left: ReadonlyMap<string, string | null>, right: ReadonlyMap<string, string | null>): PairSummary => {
  const check = crossCheckParents(left, right);
  return {
    agree: check.agree.length,
    disagree: check.disagree.length,
    onlyLeft: check.lookupOnly.length,
    onlyRight: check.wbsOnly.length,
  };
};

/** Parent id per joined task, from each of the three sources. */
function parentMaps(index: Index, wbs: WbsParents) {
  const pwa = new Map<string, string | null>();
  const dv = new Map<string, string | null>();
  const fromWbs = new Map<string, string | null>();
  index.joined.forEach((key) => {
    pwa.set(key, pwaParent(index, index.pwaById.get(key) as PwaTask));
    dv.set(key, dvParent(index, index.dvByLegacy.get(key) as DvTask));
    fromWbs.set(key, wbs.parentOf.get(key) ?? null);
  });
  return { pwa, dv, fromWbs };
}

function checkParents(index: Index, wbs: WbsParents, limit: number): ValidationResult["parents"] {
  const maps = parentMaps(index, wbs);
  const verdicts: Record<ParentVerdict, number> = { agree: 0, "dataverse-differs": 0, "wbs-differs": 0, "pwa-differs": 0, "all-differ": 0 };
  const rows: Record<Exclude<ParentVerdict, "agree">, ParentRow[]> = {
    "dataverse-differs": [],
    "wbs-differs": [],
    "pwa-differs": [],
    "all-differ": [],
  };
  index.joined.forEach((key) => {
    const [p, d, w] = [maps.pwa.get(key) ?? null, maps.dv.get(key) ?? null, maps.fromWbs.get(key) ?? null];
    const verdict = verdictOf(p, d, w);
    verdicts[verdict]++;
    if (verdict !== "agree") {
      const task = pwaRef(index.pwaById.get(key) as PwaTask);
      rows[verdict].push({ task, pwa: parentRef(index, p), dataverse: parentRef(index, d), wbs: parentRef(index, w) });
    }
  });
  return {
    verdicts,
    pairs: {
      pwaVsDataverse: pair(maps.pwa, maps.dv),
      pwaVsWbs: pair(maps.pwa, maps.fromWbs),
      dataverseVsWbs: pair(maps.dv, maps.fromWbs),
    },
    examples: {
      "dataverse-differs": listing(rows["dataverse-differs"], limit),
      "wbs-differs": listing(rows["wbs-differs"], limit),
      "pwa-differs": listing(rows["pwa-differs"], limit),
      "all-differ": listing(rows["all-differ"], limit),
    },
  };
}

/** Dataverse rows whose WBS depth differs from klein_outlinelevel. */
function outlineVsDepth(dvTasks: readonly DvTask[]): { task: TaskRef; depth: number }[] {
  const out: { task: TaskRef; depth: number }[] = [];
  dvTasks.forEach((t) => {
    const segments = parseWbs(t.wbs);
    if (segments !== undefined && t.outlineLevel !== null && segments.length !== t.outlineLevel) {
      out.push({ task: dvRef(t), depth: segments.length });
    }
  });
  return out;
}

function checkDataverse(index: Index, wbs: WbsParents, limit: number): ValidationResult["dataverse"] {
  const byKey = (key: string): TaskRef => dvRef(index.dvByLegacy.get(key) as DvTask);
  const duplicates = Array.from(index.legacyDuplicates.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([legacyId, activityIds]) => ({ legacyId, activityIds }));
  const wbsVsPwa = index.joined
    .map((key) => ({ dv: index.dvByLegacy.get(key) as DvTask, pwa: index.pwaById.get(key) as PwaTask }))
    .filter(({ dv, pwa }) => (dv.wbs ?? "").trim() !== (pwa.wbs ?? "").trim())
    .map(({ dv, pwa }) => ({ task: dvRef(dv), pwaWbs: pwa.wbs }));
  return {
    orphans: listing(index.dvTasks.filter((t) => (t.outlineLevel ?? 0) > 1 && t.parentActivityId === null).map(dvRef), limit),
    danglingParents: listing(
      index.dvTasks.filter((t) => (dvParent(index, t) ?? "").startsWith(DANGLING)).map(dvRef),
      limit
    ),
    duplicateLegacyIds: listing(duplicates, limit),
    wbsUnusable: listing(wbs.unusable.map(byKey), limit),
    wbsDuplicates: listing(
      wbs.duplicates.map((d) => ({ project: byKey(d.ids[0]).project, wbs: d.wbs, tasks: d.ids.map(byKey) })),
      limit
    ),
    wbsGaps: listing(wbs.gapResolved.map(byKey), limit),
    outlineVsDepth: listing(outlineVsDepth(index.dvTasks), limit),
    wbsVsPwa: listing(wbsVsPwa, limit),
  };
}

/** Runs every check. `limit` caps each example list (counts are always complete). */
export function analyse(dvRows: readonly DvTask[], pwaRows: readonly PwaTask[], limit = 50): ValidationResult {
  const index = buildIndex(dvRows, pwaRows);
  const wbs = wbsParents(index);
  const joinedKeys = new Set(index.joined);
  const missing = index.pwaTasks.filter((t) => !joinedKeys.has(normalizeId(t.taskId)));
  const extra = index.dvTasks.filter((t) => !joinedKeys.has(normalizeId(t.legacyId as string)));
  return {
    basis: BASIS,
    totals: {
      pwaTasks: index.pwaTasks.length,
      pwaLevel0: pwaRows.length - index.pwaTasks.length,
      dvTasks: index.dvTasks.length,
      dvLevel0: Array.from(index.dvByLegacy.values()).filter(isDvLevel0).length,
      dvWithoutLegacyId: dvRows.filter((t) => t.legacyId === null).length,
      joined: index.joined.length,
    },
    missingInDv: listing(missing.map(pwaRef), limit),
    extraInDv: listing(extra.map(dvRef), limit),
    parents: checkParents(index, wbs, limit),
    dataverse: checkDataverse(index, wbs, limit),
    projects: checkProjects({ dvRows, pwaRows, joined: index.joined, dvByLegacy: index.dvByLegacy, pwaById: index.pwaById, missing, extra }, limit),
  };
}
