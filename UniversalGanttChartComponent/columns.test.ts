// columns.test.ts — the contract for the extra-columns config parser/validator.
// Covers the malformed-input surface (the real failure mode: makers type this
// JSON by hand) plus the decisions recorded for the extra-columns feature:
// formatted text only, max 8 columns, widths 40..600 px, case-insensitive
// names, first duplicate wins, already-shown columns allowed.

import {
  AvailableColumn,
  ColumnIssue,
  ExtraColumnDef,
  ExtraColumnsResult,
  FormattedValueSource,
  classifyDataType,
  describeIssue,
  parseExtraColumnsConfig,
  readCellTexts,
  resolveExtraColumns,
} from "./columns";

const col = (name: string, dataType = "SingleLine.Text", displayName = `Display ${name}`): AvailableColumn => ({
  name,
  displayName,
  dataType,
});

const AVAILABLE: readonly AvailableColumn[] = [
  col("subject", "SingleLine.Text", "Subject"),
  col("scheduledstart", "DateAndTime.DateAndTime", "Start Date"),
  col("klein_wbs", "SingleLine.Text", "WBS"),
  col("klein_cost", "Currency", "Cost"),
  col("klein_projectid", "Lookup.Simple", "Project"),
  col("klein_photo", "Image", "Photo"),
  col("klein_nodisplay", "Whole.None", "   "),
];

const resolve = (raw: string | null | undefined): ExtraColumnsResult =>
  resolveExtraColumns(raw, AVAILABLE, { defaultWidthPx: 155 });
const names = (r: ExtraColumnsResult): string[] => r.columns.map((c) => c.name);
const issueTypes = (r: { issues: readonly ColumnIssue[] }): string[] => r.issues.map((i) => i.type);
const json = (value: unknown): string => JSON.stringify(value);

describe("resolveExtraColumns — empty and malformed config", () => {
  test.each([null, undefined, "", "   ", "\n\t "])("no config (%p) yields no columns and no issues", (raw) => {
    expect(resolve(raw)).toEqual({ columns: [], issues: [] });
  });

  test("[] yields no columns and no issues", () => {
    expect(resolve("[]")).toEqual({ columns: [], issues: [] });
  });

  test("invalid JSON yields no columns and one invalid-json issue with a message", () => {
    const r = resolve('[{"name": "klein_wbs"');
    expect(r.columns).toEqual([]);
    expect(issueTypes(r)).toEqual(["invalid-json"]);
    const issue = r.issues[0];
    expect(issue.type === "invalid-json" && issue.message.length > 0).toBe(true);
  });

  test.each(['{"name": "klein_wbs"}', '"klein_wbs"', "1", "null", "true"])(
    "valid JSON that is not an array (%s) yields not-an-array and no columns",
    (raw) => {
      expect(resolve(raw)).toEqual({ columns: [], issues: [{ type: "not-an-array" }] });
    }
  );
});

describe("parseExtraColumnsConfig — entry shape", () => {
  test("a bare string entry is invalid-entry (no shorthand); other entries are kept", () => {
    const r = parseExtraColumnsConfig(json(["klein_wbs", { name: "klein_cost" }]));
    expect(r.entries.map((e) => e.name)).toEqual(["klein_cost"]);
    expect(r.issues).toEqual([expect.objectContaining({ type: "invalid-entry", index: 0 })]);
  });

  test("non-object entries (number, null, nested array) are invalid-entry at their index", () => {
    const r = parseExtraColumnsConfig(json([1, null, [{ name: "klein_wbs" }], { name: "klein_wbs" }]));
    expect(r.entries.map((e) => e.index)).toEqual([3]);
    expect(r.issues.map((i) => (i.type === "invalid-entry" ? i.index : -1))).toEqual([0, 1, 2]);
  });

  test.each([{}, { name: "" }, { name: "   " }, { name: 42 }, { name: null }, { label: "WBS" }])(
    "missing, empty, whitespace-only or non-string name (%p) is invalid-entry",
    (entry) => {
      expect(issueTypes(parseExtraColumnsConfig(json([entry])))).toEqual(["invalid-entry"]);
    }
  );

  test.each([{ label: 7 }, { label: null }, { label: ["WBS"] }])("non-string label (%p) is invalid-entry", (extra) => {
    const r = parseExtraColumnsConfig(json([{ name: "klein_wbs", ...extra }]));
    expect(r.entries).toEqual([]);
    expect(issueTypes(r)).toEqual(["invalid-entry"]);
  });

  test.each(['"120"', "null", "true", "1e400"])("non-numeric or non-finite width (%s) is invalid-entry", (width) => {
    const r = parseExtraColumnsConfig(`[{"name": "klein_wbs", "width": ${width}}]`);
    expect(r.entries).toEqual([]);
    expect(issueTypes(r)).toEqual(["invalid-entry"]);
  });

  test("unknown keys are ignored", () => {
    const r = resolve(json([{ name: "klein_wbs", sortable: true, color: "red" }]));
    expect(names(r)).toEqual(["klein_wbs"]);
    expect(r.issues).toEqual([]);
  });

  test("names are trimmed and entries keep their original index", () => {
    const r = parseExtraColumnsConfig(json([5, { name: "  klein_wbs  ", label: "WBS", width: 80 }]));
    expect(r.entries).toEqual([{ index: 1, name: "klein_wbs", label: "WBS", width: 80 }]);
  });
});

describe("resolveExtraColumns — matching against the dataset", () => {
  test("an unknown column is skipped with unknown-column carrying its name and index", () => {
    const r = resolve(json([{ name: "klein_wbs" }, { name: "klein_ghost" }]));
    expect(names(r)).toEqual(["klein_wbs"]);
    expect(r.issues).toEqual([{ type: "unknown-column", index: 1, name: "klein_ghost" }]);
  });

  test("matching is case-insensitive and emits the dataset's canonical name", () => {
    const r = resolve(json([{ name: "KLEIN_Cost" }]));
    expect(names(r)).toEqual(["klein_cost"]);
    expect(r.issues).toEqual([]);
  });

  test("duplicates: the first wins, later ones are flagged, including case-only differences", () => {
    const r = resolve(json([{ name: "klein_wbs", label: "First" }, { name: "klein_wbs" }, { name: "KLEIN_WBS" }]));
    expect(r.columns).toHaveLength(1);
    expect(r.columns[0].label).toBe("First");
    expect(r.issues).toEqual([
      { type: "duplicate-column", index: 1, name: "klein_wbs" },
      { type: "duplicate-column", index: 2, name: "klein_wbs" },
    ]);
  });

  test("the configured order is preserved, not the dataset order", () => {
    const r = resolve(json([{ name: "klein_projectid" }, { name: "klein_wbs" }, { name: "subject" }]));
    expect(names(r)).toEqual(["klein_projectid", "klein_wbs", "subject"]);
  });

  test("valid entries survive alongside invalid ones", () => {
    const r = resolve(json([{ name: "klein_wbs" }, "bad", { name: "klein_ghost" }, { name: "klein_photo" }, { name: "klein_cost" }]));
    expect(names(r)).toEqual(["klein_wbs", "klein_cost"]);
    expect(issueTypes(r).sort()).toEqual(["invalid-entry", "unknown-column", "unsupported-type"]);
  });
});

describe("resolveExtraColumns — allowed, skipped and untouched inputs", () => {
  test("a column already shown as Title/Start/End (scheduledstart) is allowed, not blocked", () => {
    const r = resolve(json([{ name: "scheduledstart", label: "Start again" }]));
    expect(r.columns).toEqual([{ name: "scheduledstart", label: "Start again", widthPx: 155, kind: "date" }]);
    expect(r.issues).toEqual([]);
  });

  test("an unsupported data type is skipped with unsupported-type", () => {
    const r = resolve(json([{ name: "klein_photo" }]));
    expect(r.columns).toEqual([]);
    expect(r.issues).toEqual([{ type: "unsupported-type", index: 0, name: "klein_photo", dataType: "Image" }]);
  });

  test("inputs are not mutated (frozen available columns)", () => {
    const frozen = Object.freeze(AVAILABLE.map((c) => Object.freeze({ ...c })));
    const r = resolveExtraColumns(json([{ name: "klein_wbs" }, { name: "klein_wbs" }]), frozen, { defaultWidthPx: 155 });
    expect(names(r)).toEqual(["klein_wbs"]);
    expect(frozen).toEqual(AVAILABLE);
  });
});

describe("resolveExtraColumns — labels", () => {
  test("a configured label overrides displayName (and is trimmed)", () => {
    expect(resolve(json([{ name: "klein_wbs", label: "  Work Breakdown  " }])).columns[0].label).toBe("Work Breakdown");
  });

  test.each([{}, { label: "" }, { label: "   " }])("a missing or blank label (%p) falls back to displayName", (extra) => {
    expect(resolve(json([{ name: "klein_cost", ...extra }])).columns[0].label).toBe("Cost");
  });

  test("a blank displayName falls back to the column name", () => {
    expect(resolve(json([{ name: "klein_nodisplay" }])).columns[0].label).toBe("klein_nodisplay");
  });
});

describe("resolveExtraColumns — widths", () => {
  const widthOf = (width: number): { widthPx: number; issues: readonly ColumnIssue[] } => {
    const r = resolve(json([{ name: "klein_wbs", width }]));
    return { widthPx: r.columns[0].widthPx, issues: r.issues };
  };

  test("a missing width uses defaultWidthPx", () => {
    expect(resolveExtraColumns(json([{ name: "klein_wbs" }]), AVAILABLE, { defaultWidthPx: 212 }).columns[0].widthPx).toBe(212);
  });

  test("a width below 40 is clamped to 40 with a width-clamped issue", () => {
    expect(widthOf(10)).toEqual({ widthPx: 40, issues: [{ type: "width-clamped", index: 0, requested: 10, applied: 40 }] });
  });

  test("zero and negative widths are clamped to 40", () => {
    expect(widthOf(0).widthPx).toBe(40);
    expect(widthOf(-5).widthPx).toBe(40);
  });

  test("a width above 600 is clamped to 600 with a width-clamped issue", () => {
    expect(widthOf(900)).toEqual({ widthPx: 600, issues: [{ type: "width-clamped", index: 0, requested: 900, applied: 600 }] });
  });

  test("a non-integer width is rounded without an issue", () => {
    expect(widthOf(120.6)).toEqual({ widthPx: 121, issues: [] });
  });

  test("rounding happens before clamping (39.6 rounds to 40: no issue)", () => {
    expect(widthOf(39.6)).toEqual({ widthPx: 40, issues: [] });
  });

  test("the exact bounds 40 and 600 are accepted without an issue", () => {
    expect(widthOf(40)).toEqual({ widthPx: 40, issues: [] });
    expect(widthOf(600)).toEqual({ widthPx: 600, issues: [] });
  });
});

describe("resolveExtraColumns — column limit", () => {
  const many = (count: number): AvailableColumn[] =>
    Array.from({ length: count }, (_, i) => col(`klein_c${i}`));
  const config = (cols: readonly AvailableColumn[]): string => json(cols.map((c) => ({ name: c.name })));

  test("exactly 8 columns are all kept with no issue", () => {
    const cols = many(8);
    const r = resolveExtraColumns(config(cols), cols, { defaultWidthPx: 155 });
    expect(r.columns).toHaveLength(8);
    expect(r.issues).toEqual([]);
  });

  test("more than 8: the first 8 are kept and too-many-columns reports the dropped count", () => {
    const cols = many(11);
    const r = resolveExtraColumns(config(cols), cols, { defaultWidthPx: 155 });
    expect(names(r)).toEqual(cols.slice(0, 8).map((c) => c.name));
    expect(r.issues).toEqual([{ type: "too-many-columns", max: 8, dropped: 3 }]);
  });

  test("skipped entries do not count toward the limit", () => {
    const cols = many(8);
    const raw = json([{ name: "klein_ghost" }, "bad", ...cols.map((c) => ({ name: c.name }))]);
    const r = resolveExtraColumns(raw, cols, { defaultWidthPx: 155 });
    expect(r.columns).toHaveLength(8);
    expect(issueTypes(r)).not.toContain("too-many-columns");
  });
});

describe("classifyDataType", () => {
  test.each([
    ["SingleLine.Text", "text"], ["SingleLine.Email", "text"], ["SingleLine.URL", "text"],
    ["SingleLine.Phone", "text"], ["SingleLine.TextArea", "text"], ["SingleLine.Ticker", "text"],
    ["Multiple", "text"], ["Whole.None", "number"], ["Decimal", "number"], ["FP", "number"],
    ["Currency", "currency"], ["DateAndTime.DateOnly", "date"], ["DateAndTime.DateAndTime", "date"],
    ["Lookup.Simple", "lookup"], ["Lookup.Customer", "lookup"], ["Lookup.Owner", "lookup"],
    ["OptionSet", "optionset"], ["MultiSelectOptionSet", "optionset"], ["TwoOptions", "boolean"],
  ])("%s is classified as %s", (dataType, kind) => {
    expect(classifyDataType(dataType)).toBe(kind);
  });

  test.each(["", "Image", "File", "Lookup.PartyList", "singleline.text", "constructor", "__proto__", "toString"])(
    "%p is unsupported (null)",
    (dataType) => {
      expect(classifyDataType(dataType)).toBeNull();
    }
  );
});

describe("describeIssue — English maker-facing text", () => {
  test.each<[ColumnIssue, string[]]>([
    [{ type: "invalid-json", message: "Unexpected end" }, ["not valid JSON", "Unexpected end"]],
    [{ type: "not-an-array" }, ["JSON array"]],
    [{ type: "invalid-entry", index: 0, reason: '"name" must be a non-empty string' }, ["entry 1", '"name" must be']],
    [{ type: "unknown-column", index: 2, name: "klein_ghost" }, ['"klein_ghost"', "entry 3", "view"]],
    [{ type: "duplicate-column", index: 1, name: "klein_wbs" }, ['"klein_wbs"', "entry 2", "more than once"]],
    [{ type: "unsupported-type", index: 0, name: "klein_photo", dataType: "Image" }, ['"klein_photo"', '"Image"']],
    [{ type: "width-clamped", index: 4, requested: 900, applied: 600 }, ["900", "entry 5", "40-600", "600 px"]],
    [{ type: "too-many-columns", max: 8, dropped: 3 }, ["at most 8", "3 more"]],
  ])("%p names what went wrong", (issue, fragments) => {
    const text = describeIssue(issue);
    expect(text.startsWith("Extra columns: ")).toBe(true);
    fragments.forEach((fragment) => expect(text).toContain(fragment));
  });
});

describe("readCellTexts", () => {
  const defs: readonly ExtraColumnDef[] = [
    { name: "klein_wbs", label: "WBS", widthPx: 80, kind: "text" },
    { name: "klein_cost", label: "Cost", widthPx: 90, kind: "currency" },
    { name: "klein_projectid", label: "Project", widthPx: 150, kind: "lookup" },
  ];
  const record = (values: Record<string, string | null | undefined>): FormattedValueSource & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, getFormattedValue: (name) => { calls.push(name); return values[name]; } };
  };

  test("returns formatted values in column order", () => {
    const r = record({ klein_projectid: "Ranch Ops", klein_wbs: "1.2.3", klein_cost: "$1,234.00" });
    expect(readCellTexts(r, defs)).toEqual(["1.2.3", "$1,234.00", "Ranch Ops"]);
  });

  test("null or undefined formatted values become empty strings", () => {
    expect(readCellTexts(record({ klein_wbs: null, klein_cost: "$5.00" }), defs)).toEqual(["", "$5.00", ""]);
  });

  test("an undefined record yields one empty string per column", () => {
    expect(readCellTexts(undefined, defs)).toEqual(["", "", ""]);
  });

  test("no columns yields an empty array and reads nothing", () => {
    const r = record({ klein_wbs: "x" });
    expect(readCellTexts(r, [])).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  test("only configured columns are read", () => {
    const r = record({});
    readCellTexts(r, defs.slice(0, 2));
    expect(r.calls).toEqual(["klein_wbs", "klein_cost"]);
  });
});
