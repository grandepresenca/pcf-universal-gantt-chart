// report.ts — renders a ValidationResult as Markdown. Pure.

import { ParentRow, ParentVerdict, ProjectRow, TaskRef, ValidationResult } from "./analysis";
import { ExtractHeader } from "./extracts";
import { Listing } from "./levels";

export interface ReportContext {
  readonly generatedAt: string;
  readonly pwa: ExtractHeader;
  readonly dataverse: ExtractHeader;
}

const cell = (text: string | number | null | undefined): string =>
  text === null || text === undefined || text === "" ? "—" : String(text).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const task = (t: TaskRef | null): string => (t === null ? "— (root)" : `${cell(t.wbs)} ${cell(t.name)}`);

const shown = (l: Listing<unknown>): string =>
  l.count > l.items.length ? ` (first ${l.items.length} of ${l.count})` : "";

const table = (header: readonly string[], rows: readonly (readonly string[])[]): string[] => [
  `| ${header.join(" | ")} |`,
  `|${header.map(() => "---").join("|")}|`,
  ...rows.map((r) => `| ${r.join(" | ")} |`),
];

function summary(r: ValidationResult): string[] {
  const t = r.totals;
  return [
    "## Summary",
    "",
    ...table(
      ["", "PWA", "Dataverse"],
      [
        ["Tasks (level 0 excluded)", cell(t.pwaTasks), cell(t.dvTasks)],
        ["Level-0 rows (not compared)", cell(t.pwaLevel0), cell(t.dvLevel0)],
        ["Joined on TaskId = klein_legacyid", cell(t.joined), cell(t.joined)],
        ["In PWA, missing in Dataverse", cell(r.missingInDv.count), "—"],
        ["In Dataverse, not in PWA", "—", cell(r.extraInDv.count)],
      ]
    ),
    "",
    `Dataverse rows without klein_legacyid (not compared): ${t.dvWithoutLegacyId}`,
    "",
  ];
}

const VERDICTS: readonly [ParentVerdict, string, string][] = [
  ["agree", "All three agree", "—"],
  ["dataverse-differs", "Dataverse differs (PWA = WBS)", "The klein_parenttaskid lookup is wrong: a migration issue"],
  ["wbs-differs", "WBS differs (PWA = Dataverse)", "The WBS code does not match the source hierarchy"],
  ["pwa-differs", "PWA differs (Dataverse = WBS)", "The source's own parent disagrees with its WBS"],
  ["all-differ", "All three differ", "Inspect individually"],
];

const parentRows = (rows: readonly ParentRow[]): string[][] =>
  rows.map((p) => [cell(p.task.project), cell(p.task.wbs), cell(p.task.name), task(p.pwa), task(p.dataverse), task(p.wbs)]);

function parents(r: ValidationResult): string[] {
  const { verdicts, pairs, examples } = r.parents;
  const out = [
    "## 1. Parents: three-way check",
    "",
    "PWA source parent (ParentTaskId) vs Dataverse lookup (klein_parenttaskid) vs WBS-derived parent (wbs.ts), for every joined task. A parent that is the level-0 summary counts as root on every side.",
    "",
    ...table(["Verdict", "Tasks", "Meaning"], VERDICTS.map(([v, label, meaning]) => [label, cell(verdicts[v]), meaning])),
    "",
    ...table(
      ["Pair", "Agree", "Disagree", "Only left has a parent", "Only right has a parent"],
      [
        ["PWA vs Dataverse", ...pairCells(pairs.pwaVsDataverse)],
        ["PWA vs WBS", ...pairCells(pairs.pwaVsWbs)],
        ["Dataverse vs WBS", ...pairCells(pairs.dataverseVsWbs)],
      ]
    ),
    "",
  ];
  VERDICTS.slice(1).forEach(([v, label]) => {
    const l = examples[v as Exclude<ParentVerdict, "agree">];
    if (l.count > 0) {
      out.push(`### ${label}${shown(l)}`, "", ...table(["Project", "WBS", "Task", "PWA parent", "Dataverse parent", "WBS parent"], parentRows(l.items)), "");
    }
  });
  return out;
}

const pairCells = (p: { agree: number; disagree: number; onlyLeft: number; onlyRight: number }): string[] =>
  [p.agree, p.disagree, p.onlyLeft, p.onlyRight].map(cell);

const taskRows = (refs: readonly TaskRef[]): string[][] =>
  refs.map((t) => [cell(t.project), cell(t.wbs), cell(t.outlineLevel), cell(t.name), cell(t.id)]);

function dataverse(r: ValidationResult): string[] {
  const d = r.dataverse;
  const checks: [string, Listing<unknown>, string][] = [
    ["Orphans (outline level > 1, no parent)", d.orphans, "0"],
    ["Parent lookup points outside the extract", d.danglingParents, "0"],
    ["Duplicate klein_legacyid", d.duplicateLegacyIds, "0"],
    ["Unusable WBS (missing or malformed)", d.wbsUnusable, "0"],
    ["Duplicate WBS within a project", d.wbsDuplicates, "0"],
    ["WBS gaps (parent found by skipping levels)", d.wbsGaps, "0"],
    ["klein_outlinelevel ≠ WBS depth", d.outlineVsDepth, "0"],
    ["klein_wbs ≠ PWA TaskWBS", d.wbsVsPwa, "0"],
  ];
  const out = ["## 2. Dataverse internal checks", "", ...table(["Check", "Count", "Expected"], checks.map(([n, l, e]) => [n, cell(l.count), e])), ""];
  const header = ["Project", "WBS", "Level", "Task", "Id"];
  const examples: [string, Listing<TaskRef>][] = [
    ["Orphans", d.orphans],
    ["Dangling parent lookups", d.danglingParents],
    ["Unusable WBS", d.wbsUnusable],
    ["WBS gaps", d.wbsGaps],
  ];
  examples.forEach(([title, l]) => {
    if (l.count > 0) {
      out.push(`### ${title}${shown(l)}`, "", ...table(header, taskRows(l.items)), "");
    }
  });
  return out.concat(dataverseDetail(r));
}

function dataverseDetail(r: ValidationResult): string[] {
  const d = r.dataverse;
  const out: string[] = [];
  if (d.duplicateLegacyIds.count > 0) {
    out.push(`### Duplicate klein_legacyid${shown(d.duplicateLegacyIds)}`, "",
      ...table(["klein_legacyid", "activityids"], d.duplicateLegacyIds.items.map((x) => [cell(x.legacyId), cell(x.activityIds.join(", "))])), "");
  }
  if (d.wbsDuplicates.count > 0) {
    out.push(`### Duplicate WBS${shown(d.wbsDuplicates)}`, "",
      ...table(["Project", "WBS", "Tasks"], d.wbsDuplicates.items.map((x) => [cell(x.project), cell(x.wbs), cell(x.tasks.map((t) => t.name).join("; "))])), "");
  }
  if (d.outlineVsDepth.count > 0) {
    out.push(`### klein_outlinelevel ≠ WBS depth${shown(d.outlineVsDepth)}`, "",
      ...table(["Project", "WBS", "Level", "WBS depth", "Task"], d.outlineVsDepth.items.map((x) => [cell(x.task.project), cell(x.task.wbs), cell(x.task.outlineLevel), cell(x.depth), cell(x.task.name)])), "");
  }
  if (d.wbsVsPwa.count > 0) {
    out.push(`### klein_wbs ≠ PWA TaskWBS${shown(d.wbsVsPwa)}`, "",
      ...table(["Project", "Task", "Dataverse WBS", "PWA WBS"], d.wbsVsPwa.items.map((x) => [cell(x.task.project), cell(x.task.name), cell(x.task.wbs), cell(x.pwaWbs)])), "");
  }
  return out;
}

const projectRow = (p: ProjectRow): string[] => [
  cell(p.name),
  cell(p.pwaCount),
  cell(p.dvCount),
  cell(p.dvCount - p.pwaCount),
  cell(p.missingInDv),
  cell(p.extraInDv),
  cell(p.pwaInactive),
  p.pwaLevel0 ? "yes" : "NO",
  p.dvLevel0 ? "yes" : "NO",
];

function projects(r: ValidationResult): string[] {
  const p = r.projects;
  const out = [
    "## 3. Per-project task counts",
    "",
    `> **Basis:** ${r.basis}`,
    "",
    `${p.all.length - p.withDifferences.length} of ${p.all.length} projects match exactly (same count, same tasks, same level-0 status).`,
    "",
  ];
  if (p.withDifferences.length > 0) {
    out.push(
      "### Projects with differences",
      "",
      ...table(["Project", "PWA", "Dataverse", "Δ (DV − PWA)", "Missing in DV", "Extra in DV", "PWA inactive", "L0 in PWA", "L0 in DV"], p.withDifferences.map(projectRow)),
      ""
    );
  }
  if (p.unmappedDvProjects.count > 0) {
    out.push(`### Dataverse projects with no matching PWA project${shown(p.unmappedDvProjects)}`, "",
      ...table(["Dataverse project", "Id", "Tasks"], p.unmappedDvProjects.items.map((u) => [cell(u.name), cell(u.dvProjectId), cell(u.count)])), "");
  }
  if (p.conflictingDvProjects.count > 0) {
    out.push(`### Dataverse projects whose tasks come from several PWA projects${shown(p.conflictingDvProjects)}`, "",
      ...table(["Dataverse project", "Id", "PWA projects"], p.conflictingDvProjects.items.map((c) => [cell(c.name), cell(c.dvProjectId), cell(c.pwaProjectIds.join(", "))])), "");
  }
  return out;
}

function unmatched(r: ValidationResult): string[] {
  const out = ["## 4. Unmatched tasks", ""];
  const header = ["Project", "WBS", "Level", "Task", "Id"];
  out.push(`### In PWA, missing in Dataverse${shown(r.missingInDv)}`, "",
    ...(r.missingInDv.count > 0 ? table(header, taskRows(r.missingInDv.items)) : ["None."]), "");
  out.push(`### In Dataverse, not in PWA${shown(r.extraInDv)}`, "",
    ...(r.extraInDv.count > 0 ? table(header, taskRows(r.extraInDv.items)) : ["None."]), "");
  return out;
}

/** The full Markdown report. */
export function renderReport(r: ValidationResult, ctx: ReportContext): string {
  const source = (h: ExtractHeader): string => `${h.count} rows extracted ${h.extractedAt} from ${h.url}`;
  return [
    "# Migration validation: PWA vs Dataverse",
    "",
    `Generated ${ctx.generatedAt}. Read-only: built from two browser extracts, no writes to either system.`,
    "",
    `- **PWA:** ${source(ctx.pwa)}`,
    `- **Dataverse:** ${source(ctx.dataverse)}`,
    "",
    `> **Comparison basis:** ${r.basis}`,
    "",
    ...summary(r),
    ...parents(r),
    ...dataverse(r),
    ...projects(r),
    ...unmatched(r),
  ].join("\n");
}
