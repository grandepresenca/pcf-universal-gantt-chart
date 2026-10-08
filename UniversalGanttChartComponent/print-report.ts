// print-report.ts — builds the printable Gantt report as one HTML document.
// Pure (string in, string out): print-delivery.ts puts it in front of the
// browser's print dialog, where "Save as PDF" produces the file.
//
// Layout: a header (project name + generation date), then one table row per
// task — the indented name, start, end, and a timeline cell where the bar is
// positioned by print-timeline.ts. Browser pagination does the page breaks:
// the table header (columns + timeline ticks) repeats on every page and a row
// never splits. The timeline fits the page width, so there are no horizontal
// page splits. Every text and colour from the data is escaped/validated.

import { BarGeometry, barGeometry, printScale, PrintScale, TickUnit } from "./print-timeline";

/** One task line of the report, in display (tree) order. */
export interface PrintRow {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly start: Date;
  readonly end: Date;
  readonly kind: "task" | "milestone" | "project";
  readonly color: string | null;
  readonly startText: string;
  readonly endText: string;
}

export interface PrintModel {
  /** Project name (or view title) — the report heading. */
  readonly title: string;
  /** The localized "Generated …" line. */
  readonly generatedText: string;
  /** Becomes the document title, which browsers use as the PDF file name. */
  readonly fileName: string;
  readonly columns: { readonly task: string; readonly start: string; readonly end: string };
  readonly rows: readonly PrintRow[];
  readonly tickLabel: (date: Date, unit: TickUnit) => string;
}

export const DEFAULT_BAR_COLOR = "#2975b2";
/** Indent per tree level in the printed list. */
export const INDENT_MM = 4;
/** Deeper levels print at this indent (keeps names readable). */
export const MAX_INDENT_DEPTH = 10;
const FILE_NAME_MAX = 80;

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text safe to place in HTML content or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** A CSS colour only if it is a plain hex or rgb()/rgba() value; otherwise null. */
export function safeColor(color: string | null | undefined): string | null {
  if (color === null || color === undefined) {
    return null;
  }
  const c = color.trim();
  return /^#[0-9a-f]{3,8}$/i.test(c) || /^rgba?\(\s*[\d.\s,%]+\)$/i.test(c) ? c : null;
}

/** The project name when every row shares one; otherwise the view title; otherwise "Gantt". */
export function reportTitle(projectNames: readonly (string | null)[], viewTitle: string | null): string {
  const names = projectNames.map((n) => (n ?? "").trim());
  const first = names[0];
  if (first !== undefined && first !== "" && names.every((n) => n === first)) {
    return first;
  }
  const view = (viewTitle ?? "").trim();
  return view === "" ? "Gantt" : view;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Characters a file name can't hold (Windows rules), plus control characters. */
const isFileUnsafe = (c: string): boolean => '\\/:*?"<>|'.indexOf(c) >= 0 || c.charCodeAt(0) < 32;

/** "Gantt - <title> - YYYY-MM-DD" (local date), with characters files can't hold removed. */
export function exportFileName(title: string, date: Date): string {
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const safe = title.split("").map((c) => (isFileUnsafe(c) ? " " : c)).join("");
  const clean = safe.replace(/\s+/g, " ").trim().slice(0, FILE_NAME_MAX).trim();
  return clean === "" ? `Gantt - ${day}` : `Gantt - ${clean} - ${day}`;
}

const STYLE = `
@page { size: A3 landscape; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; color: #1f1f1f; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #999; margin-bottom: 3mm; }
h1 { margin: 0 0 1.5mm; font-size: 14pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { height: 6mm; padding: 0 1.5mm; border-bottom: 1px solid #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
th { font-weight: 600; border-bottom: 1px solid #999; }
col.task { width: 28%; } col.date { width: 8%; }
.parent td.name { font-weight: 600; }
td.tl, th.tl { position: relative; padding: 0; }
.grid { position: absolute; top: 0; bottom: 0; border-left: 1px solid #e6e6e6; }
.tick { position: absolute; top: 1.5mm; padding-left: 1mm; font-size: 7pt; font-weight: 400; border-left: 1px solid #999; height: 4.5mm; }
.bar { position: absolute; top: 1.5mm; height: 3mm; border-radius: 0.5mm; }
.bar.project { top: 2mm; height: 2mm; border-radius: 0; }
.milestone { position: absolute; top: 1.6mm; width: 2.8mm; height: 2.8mm; margin-left: -1.4mm; transform: rotate(45deg); }
.empty { padding: 4mm 0; color: #666; }
`;

function barHtml(geometry: BarGeometry, row: PrintRow): string {
  const color = safeColor(row.color) ?? DEFAULT_BAR_COLOR;
  if (geometry.kind === "milestone") {
    return `<span class="milestone" style="left:${geometry.leftPct}%;background:${color}"></span>`;
  }
  if (geometry.kind === "bar") {
    const cls = row.kind === "project" ? "bar project" : "bar";
    return `<span class="${cls}" style="left:${geometry.leftPct}%;width:${geometry.widthPct}%;background:${color}"></span>`;
  }
  return "";
}

function rowHtml(row: PrintRow, scale: PrintScale | null, grid: string): string {
  const indent = Math.min(Math.max(row.depth, 0), MAX_INDENT_DEPTH) * INDENT_MM;
  const bar = scale === null ? "" : barHtml(barGeometry(row, scale.range, row.kind === "milestone"), row);
  const name = escapeHtml(row.name);
  return (
    `<tr${row.hasChildren ? ' class="parent"' : ""}>` +
    `<td class="name" title="${name}"><span style="padding-left:${indent}mm">${name}</span></td>` +
    `<td>${escapeHtml(row.startText)}</td><td>${escapeHtml(row.endText)}</td>` +
    `<td class="tl">${grid}${bar}</td></tr>`
  );
}

function headHtml(model: PrintModel, scale: PrintScale | null): string {
  const ticks = scale === null
    ? ""
    : scale.ticks.map((t) => `<span class="tick" style="left:${t.xPct}%">${escapeHtml(model.tickLabel(t.date, scale.unit))}</span>`).join("");
  const c = model.columns;
  return `<thead><tr><th>${escapeHtml(c.task)}</th><th>${escapeHtml(c.start)}</th><th>${escapeHtml(c.end)}</th><th class="tl">${ticks}</th></tr></thead>`;
}

/** The complete printable document. */
export function buildPrintHtml(model: PrintModel): string {
  const scale = printScale(model.rows);
  const grid = scale === null ? "" : scale.ticks.map((t) => `<span class="grid" style="left:${t.xPct}%"></span>`).join("");
  const body = model.rows.length === 0
    ? '<tr><td colspan="4" class="empty">—</td></tr>'
    : model.rows.map((r) => rowHtml(r, scale, grid)).join("");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(model.fileName)}</title><style>${STYLE}</style></head><body>` +
    `<header><h1>${escapeHtml(model.title)}</h1><div>${escapeHtml(model.generatedText)}</div></header>` +
    `<table><colgroup><col class="task"><col class="date"><col class="date"><col class="timeline"></colgroup>` +
    `${headHtml(model, scale)}<tbody>${body}</tbody></table></body></html>`
  );
}
