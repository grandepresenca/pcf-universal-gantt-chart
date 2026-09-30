// columns.ts — pure logic for the configurable extra list columns (fork
// customization #2).
//
// Parses the maker's extra-columns JSON configuration into typed column
// definitions and validates them against the dataset's available columns.
// Pure by design: no React, no PCF runtime objects. The PCF glue maps
// dataset.columns / records onto the small structural types below, so this
// module is testable in Jest's node environment (see columns.test.ts).
//
// Values are shown as the platform's formatted text only (getFormattedValue);
// this module never reads or converts raw values, and never touches dates.

export type ExtraColumnKind =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "lookup"
  | "optionset"
  | "boolean";

/** A dataset column as far as extra columns care (mapped from dataset.columns). */
export interface AvailableColumn {
  readonly name: string;
  readonly displayName: string;
  /** PCF manifest type name, e.g. "SingleLine.Text". */
  readonly dataType: string;
}

/** A validated extra column, ready to render. */
export interface ExtraColumnDef {
  /** Canonical dataset column name (as in dataset.columns[].name). */
  readonly name: string;
  readonly label: string;
  readonly widthPx: number;
  readonly kind: ExtraColumnKind;
}

/** One syntactically valid config entry, before validation against the dataset. */
export interface ExtraColumnEntry {
  /** Zero-based position in the configured JSON array. */
  readonly index: number;
  /** Trimmed. */
  readonly name: string;
  readonly label?: string;
  readonly width?: number;
}

export type ColumnIssue =
  | { readonly type: "invalid-json"; readonly message: string }
  | { readonly type: "not-an-array" }
  | { readonly type: "invalid-entry"; readonly index: number; readonly reason: string }
  | { readonly type: "unknown-column"; readonly index: number; readonly name: string }
  | { readonly type: "duplicate-column"; readonly index: number; readonly name: string }
  | {
      readonly type: "unsupported-type";
      readonly index: number;
      readonly name: string;
      readonly dataType: string;
    }
  | {
      readonly type: "width-clamped";
      readonly index: number;
      readonly requested: number;
      readonly applied: number;
    }
  | { readonly type: "too-many-columns"; readonly max: number; readonly dropped: number };

export interface ParsedExtraColumnsConfig {
  readonly entries: readonly ExtraColumnEntry[];
  readonly issues: readonly ColumnIssue[];
}

export interface ExtraColumnsOptions {
  /** Width for entries without "width"; the caller passes listCellWidth. */
  readonly defaultWidthPx: number;
}

export interface ExtraColumnsResult {
  readonly columns: readonly ExtraColumnDef[];
  readonly issues: readonly ColumnIssue[];
}

/** Anything that can return a record's formatted value (a PCF EntityRecord fits). */
export interface FormattedValueSource {
  getFormattedValue(columnName: string): string | null | undefined;
}

export const EXTRA_COLUMN_LIMITS = {
  maxColumns: 8,
  minWidthPx: 40,
  maxWidthPx: 600,
} as const;

/**
 * Supported PCF dataType strings and how they are classified.
 * TO CONFIRM IN A REAL ENVIRONMENT: these are the documented manifest type
 * names; the exact strings Dataverse puts in dataset.columns[].dataType have
 * not yet been checked against a live org. A Map (not an object literal) so
 * keys like "constructor" can never match a prototype property.
 */
const DATA_TYPE_KINDS: ReadonlyMap<string, ExtraColumnKind> = new Map<
  string,
  ExtraColumnKind
>([
  ["SingleLine.Text", "text"],
  ["SingleLine.Email", "text"],
  ["SingleLine.URL", "text"],
  ["SingleLine.Phone", "text"],
  ["SingleLine.TextArea", "text"],
  ["SingleLine.Ticker", "text"],
  ["Multiple", "text"],
  ["Whole.None", "number"],
  ["Decimal", "number"],
  ["FP", "number"],
  ["Currency", "currency"],
  ["DateAndTime.DateOnly", "date"],
  ["DateAndTime.DateAndTime", "date"],
  ["Lookup.Simple", "lookup"],
  ["Lookup.Customer", "lookup"],
  ["Lookup.Owner", "lookup"],
  ["OptionSet", "optionset"],
  ["MultiSelectOptionSet", "optionset"],
  ["TwoOptions", "boolean"],
]);

const NO_CONFIG: ParsedExtraColumnsConfig = { entries: [], issues: [] };

/** Kind for a supported dataType; null for anything else (exact match). */
export function classifyDataType(dataType: string): ExtraColumnKind | null {
  return DATA_TYPE_KINDS.get(dataType) ?? null;
}

type JsonParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

function parseJson(raw: string): JsonParseResult {
  try {
    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch (e) {
    // Not swallowed: becomes an "invalid-json" issue shown to the maker.
    return { ok: false, message: String(e) };
  }
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidEntry(index: number, reason: string): ColumnIssue {
  return { type: "invalid-entry", index, reason };
}

function isValidWidth(width: unknown): width is number | undefined {
  return width === undefined || (typeof width === "number" && Number.isFinite(width));
}

function parseEntry(item: unknown, index: number): ExtraColumnEntry | ColumnIssue {
  if (!isPlainObject(item)) {
    return invalidEntry(index, 'it must be an object like {"name": "klein_wbs"}');
  }
  const { name, label, width } = item;
  if (typeof name !== "string" || name.trim() === "") {
    return invalidEntry(index, '"name" must be a non-empty string');
  }
  if (label !== undefined && typeof label !== "string") {
    return invalidEntry(index, '"label" must be a string');
  }
  if (!isValidWidth(width)) {
    return invalidEntry(index, '"width" must be a finite number of pixels');
  }
  return { index, name: name.trim(), label, width };
}

/**
 * Syntax/shape check of the raw config. Empty or whitespace config means "no
 * extra columns" and is not an issue. Unknown keys in an entry are ignored.
 */
export function parseExtraColumnsConfig(
  raw: string | null | undefined
): ParsedExtraColumnsConfig {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return NO_CONFIG;
  }
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return { entries: [], issues: [{ type: "invalid-json", message: parsed.message }] };
  }
  if (!Array.isArray(parsed.value)) {
    return { entries: [], issues: [{ type: "not-an-array" }] };
  }
  const items: readonly unknown[] = parsed.value;
  const entries: ExtraColumnEntry[] = [];
  const issues: ColumnIssue[] = [];
  items.forEach((item, index) => {
    const result = parseEntry(item, index);
    if ("type" in result) {
      issues.push(result);
    } else {
      entries.push(result);
    }
  });
  return { entries, issues };
}

function indexAvailable(
  available: readonly AvailableColumn[]
): ReadonlyMap<string, AvailableColumn> {
  const byName = new Map<string, AvailableColumn>();
  available.forEach((column) => {
    const key = column.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, column);
    }
  });
  return byName;
}

function resolveLabel(label: string | undefined, column: AvailableColumn): string {
  const configured = label === undefined ? "" : label.trim();
  if (configured !== "") {
    return configured;
  }
  const displayName = column.displayName.trim();
  return displayName !== "" ? displayName : column.name;
}

function resolveWidth(
  entry: ExtraColumnEntry,
  defaultWidthPx: number
): { readonly widthPx: number; readonly issue?: ColumnIssue } {
  if (entry.width === undefined) {
    return { widthPx: defaultWidthPx };
  }
  const { minWidthPx, maxWidthPx } = EXTRA_COLUMN_LIMITS;
  const rounded = Math.round(entry.width);
  const applied = Math.min(maxWidthPx, Math.max(minWidthPx, rounded));
  if (applied === rounded) {
    return { widthPx: applied };
  }
  return {
    widthPx: applied,
    issue: { type: "width-clamped", index: entry.index, requested: entry.width, applied },
  };
}

interface EntryOutcome {
  readonly column?: ExtraColumnDef;
  readonly issues: readonly ColumnIssue[];
}

function resolveEntry(
  entry: ExtraColumnEntry,
  byName: ReadonlyMap<string, AvailableColumn>,
  accepted: ReadonlySet<string>,
  options: ExtraColumnsOptions
): EntryOutcome {
  const { index } = entry;
  const match = byName.get(entry.name.toLowerCase());
  if (match === undefined) {
    return { issues: [{ type: "unknown-column", index, name: entry.name }] };
  }
  const kind = classifyDataType(match.dataType);
  if (kind === null) {
    const { name, dataType } = match;
    return { issues: [{ type: "unsupported-type", index, name, dataType }] };
  }
  if (accepted.has(match.name.toLowerCase())) {
    return { issues: [{ type: "duplicate-column", index, name: match.name }] };
  }
  const width = resolveWidth(entry, options.defaultWidthPx);
  const label = resolveLabel(entry.label, match);
  return {
    column: { name: match.name, label, widthPx: width.widthPx, kind },
    issues: width.issue === undefined ? [] : [width.issue],
  };
}

function applyColumnLimit(
  columns: readonly ExtraColumnDef[],
  issues: readonly ColumnIssue[]
): ExtraColumnsResult {
  const { maxColumns } = EXTRA_COLUMN_LIMITS;
  if (columns.length <= maxColumns) {
    return { columns, issues };
  }
  const dropped = columns.length - maxColumns;
  return {
    columns: columns.slice(0, maxColumns),
    issues: issues.concat([{ type: "too-many-columns", max: maxColumns, dropped }]),
  };
}

/**
 * Parse the raw config and validate it against the dataset's columns.
 * Per-entry: valid entries survive next to invalid ones; every skipped or
 * adjusted entry produces an issue. Order follows the config, not the dataset.
 * Columns already shown as Title/Start/End are allowed (not blocked).
 */
export function resolveExtraColumns(
  raw: string | null | undefined,
  available: readonly AvailableColumn[],
  options: ExtraColumnsOptions
): ExtraColumnsResult {
  const parsed = parseExtraColumnsConfig(raw);
  const byName = indexAvailable(available);
  const columns: ExtraColumnDef[] = [];
  const issues: ColumnIssue[] = parsed.issues.slice();
  const accepted = new Set<string>();
  parsed.entries.forEach((entry) => {
    const outcome = resolveEntry(entry, byName, accepted, options);
    issues.push(...outcome.issues);
    if (outcome.column !== undefined) {
      columns.push(outcome.column);
      accepted.add(outcome.column.name.toLowerCase());
    }
  });
  return applyColumnLimit(columns, issues);
}

/** English, maker-facing text for an issue (1-based entry numbers). */
export function describeIssue(issue: ColumnIssue): string {
  switch (issue.type) {
    case "invalid-json":
      return `Extra columns: the configuration is not valid JSON (${issue.message}). No extra columns are shown.`;
    case "not-an-array":
      return 'Extra columns: the configuration must be a JSON array, e.g. [{"name": "klein_wbs"}]. No extra columns are shown.';
    case "invalid-entry":
      return `Extra columns: entry ${issue.index + 1} was skipped: ${issue.reason}.`;
    case "unknown-column":
      return `Extra columns: "${issue.name}" (entry ${issue.index + 1}) is not a column of this dataset and was skipped. Add it to the view (model-driven) or to Fields (canvas).`;
    case "duplicate-column":
      return `Extra columns: "${issue.name}" (entry ${issue.index + 1}) is listed more than once; only the first is shown.`;
    case "unsupported-type":
      return `Extra columns: "${issue.name}" (entry ${issue.index + 1}) has data type "${issue.dataType}", which cannot be shown, and was skipped.`;
    case "width-clamped":
      return `Extra columns: width ${issue.requested} for entry ${issue.index + 1} is outside ${EXTRA_COLUMN_LIMITS.minWidthPx}-${EXTRA_COLUMN_LIMITS.maxWidthPx} px; ${issue.applied} px is used.`;
    case "too-many-columns":
      return `Extra columns: at most ${issue.max} columns are shown; ${issue.dropped} more were ignored.`;
  }
}

/**
 * Formatted cell texts for one record, in column order. A missing record or a
 * null/undefined formatted value gives "" (an empty cell, not an issue).
 */
export function readCellTexts(
  record: FormattedValueSource | undefined,
  columns: readonly ExtraColumnDef[]
): readonly string[] {
  if (record === undefined) {
    return columns.map(() => "");
  }
  return columns.map((column) => record.getFormattedValue(column.name) ?? "");
}
