// projects.ts — per-project task counts, PWA vs Dataverse. Pure.
//
// A Dataverse project is matched to its PWA project through its own tasks:
// each joined task (TaskId = klein_legacyid) says which PWA project it came
// from. So the Dataverse project table never needs to be read. A Dataverse
// project whose tasks came from more than one PWA project is reported as a
// conflict and left unmapped. Level 0 is excluded from the counts and shown
// in its own columns (see BASIS in analysis.ts).

import { normalizeId } from "../../../UniversalGanttChartComponent/hierarchy";
import type { ProjectRow } from "./analysis";
import { DvTask, PwaTask } from "./extracts";
import { isDvLevel0, isPwaLevel0, listing } from "./levels";

export interface ProjectInput {
  readonly dvRows: readonly DvTask[];
  readonly pwaRows: readonly PwaTask[];
  readonly joined: readonly string[];
  readonly dvByLegacy: ReadonlyMap<string, DvTask>;
  readonly pwaById: ReadonlyMap<string, PwaTask>;
  readonly missing: readonly PwaTask[];
  readonly extra: readonly DvTask[];
}

type MutableRow = { -readonly [K in keyof ProjectRow]: ProjectRow[K] };

interface Sources {
  readonly name: string | null;
  readonly pwaProjects: string[];
}

/** Dataverse project key -> its name and the distinct PWA projects its joined tasks came from. */
function dvToPwaProjects(input: ProjectInput): Map<string, Sources> {
  const sources = new Map<string, Sources>();
  input.joined.forEach((key) => {
    const dv = input.dvByLegacy.get(key) as DvTask;
    const pwa = input.pwaById.get(key) as PwaTask;
    if (dv.projectId === null) {
      return;
    }
    const dvProject = normalizeId(dv.projectId);
    const pwaProject = normalizeId(pwa.projectId);
    const entry = sources.get(dvProject) ?? { name: dv.projectName, pwaProjects: [] };
    if (entry.pwaProjects.indexOf(pwaProject) === -1) {
      entry.pwaProjects.push(pwaProject);
    }
    sources.set(dvProject, entry);
  });
  return sources;
}

/** One row per PWA project, with the PWA side filled in. */
function pwaRows(input: ProjectInput): Map<string, MutableRow> {
  const rows = new Map<string, MutableRow>();
  input.pwaRows.forEach((t) => {
    const key = normalizeId(t.projectId);
    let row = rows.get(key);
    if (row === undefined) {
      row = { projectId: t.projectId, name: t.projectName, pwaCount: 0, pwaInactive: 0, dvCount: 0, missingInDv: 0, extraInDv: 0, pwaLevel0: false, dvLevel0: false };
      rows.set(key, row);
    }
    if (isPwaLevel0(t)) {
      row.pwaLevel0 = true;
    } else {
      row.pwaCount++;
      row.pwaInactive += t.isActive === false ? 1 : 0;
    }
  });
  input.missing.forEach((t) => {
    (rows.get(normalizeId(t.projectId)) as MutableRow).missingInDv++;
  });
  return rows;
}

/** The PWA project a Dataverse task belongs to, or undefined if unmapped. */
function pwaProjectOf(input: ProjectInput, mapping: ReadonlyMap<string, string>, t: DvTask): string | undefined {
  const sameTask = input.pwaById.get(normalizeId(t.legacyId as string));
  if (isDvLevel0(t) && sameTask !== undefined) {
    return normalizeId(sameTask.projectId);
  }
  return t.projectId === null ? undefined : mapping.get(normalizeId(t.projectId));
}

interface Unmapped {
  dvProjectId: string;
  name: string | null;
  count: number;
}

/** Fills the Dataverse side; returns the Dataverse projects with no PWA match. */
function addDataverse(input: ProjectInput, rows: Map<string, MutableRow>, mapping: ReadonlyMap<string, string>): Unmapped[] {
  const unmapped = new Map<string, Unmapped>();
  const extraKeys = new Set(input.extra.map((t) => normalizeId(t.legacyId as string)));
  Array.from(input.dvByLegacy.values()).forEach((t) => {
    const row = rows.get(pwaProjectOf(input, mapping, t) ?? "");
    if (row === undefined) {
      const key = t.projectId === null ? "(none)" : normalizeId(t.projectId);
      const entry = unmapped.get(key) ?? { dvProjectId: t.projectId ?? "(none)", name: t.projectName, count: 0 };
      entry.count++;
      unmapped.set(key, entry);
    } else if (isDvLevel0(t)) {
      row.dvLevel0 = true;
    } else {
      row.dvCount++;
      row.extraInDv += extraKeys.has(normalizeId(t.legacyId as string)) ? 1 : 0;
    }
  });
  return Array.from(unmapped.values());
}

const differs = (r: ProjectRow): boolean =>
  r.pwaCount !== r.dvCount || r.missingInDv > 0 || r.extraInDv > 0 || r.pwaLevel0 !== r.dvLevel0;

/** Per-project comparison. Rows are sorted by project name. */
export function checkProjects(input: ProjectInput, limit: number) {
  const sources = dvToPwaProjects(input);
  const mapping = new Map<string, string>();
  const conflicts: { dvProjectId: string; name: string | null; pwaProjectIds: readonly string[] }[] = [];
  sources.forEach(({ name, pwaProjects }, dvProject) => {
    if (pwaProjects.length === 1) {
      mapping.set(dvProject, pwaProjects[0]);
    } else {
      conflicts.push({ dvProjectId: dvProject, name, pwaProjectIds: pwaProjects });
    }
  });
  const rows = pwaRows(input);
  const unmapped = addDataverse(input, rows, mapping);
  const all = Array.from(rows.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return {
    withDifferences: all.filter(differs),
    all,
    unmappedDvProjects: listing(unmapped, limit),
    conflictingDvProjects: listing(conflicts, limit),
  };
}
