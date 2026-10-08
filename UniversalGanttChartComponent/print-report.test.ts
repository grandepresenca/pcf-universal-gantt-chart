// print-report.test.ts — the printable document: header, rows, bars, escaping.

import { buildPrintHtml, DEFAULT_BAR_COLOR, escapeHtml, exportFileName, INDENT_MM, MAX_INDENT_DEPTH, PrintModel, PrintRow, reportTitle, safeColor } from "./print-report";

const row = (id: string, o: Partial<PrintRow> = {}): PrintRow => ({
  id,
  name: `Task ${id}`,
  depth: 0,
  hasChildren: false,
  start: new Date(2026, 0, 1),
  end: new Date(2026, 1, 1),
  kind: "task",
  color: "#112233",
  startText: "1/1/2026",
  endText: "2/1/2026",
  ...o,
});

const model = (rows: PrintRow[], o: Partial<PrintModel> = {}): PrintModel => ({
  title: "Alazan",
  generatedText: "Generated 10/8/2026",
  fileName: "Gantt - Alazan - 2026-10-08",
  columns: { task: "Title", start: "Start", end: "End" },
  rows,
  tickLabel: (date) => `T${date.getMonth() + 1}`,
  ...o,
});

describe("reportTitle", () => {
  test("the project name when every row shares it", () => {
    expect(reportTitle(["Alazan", " Alazan "], "Tasks")).toBe("Alazan");
  });

  test.each([
    ["several projects", ["Alazan", "Borrego"]],
    ["a row without a project", ["Alazan", null]],
    ["no rows", []],
    ["blank names", ["", " "]],
  ])("%s -> the view title", (_label, names) => {
    expect(reportTitle(names, " Active Projects ")).toBe("Active Projects");
  });

  test("no usable view title -> 'Gantt'", () => {
    expect(reportTitle([], null)).toBe("Gantt");
    expect(reportTitle(["A", "B"], "  ")).toBe("Gantt");
  });
});

describe("exportFileName", () => {
  const day = new Date(2026, 9, 8);
  test("'Gantt - <title> - YYYY-MM-DD' with zero-padded local date", () => {
    expect(exportFileName("Alazan", new Date(2026, 0, 5))).toBe("Gantt - Alazan - 2026-01-05");
  });

  test("characters a file can't hold become spaces; runs collapse", () => {
    expect(exportFileName('A/B\\C:D*E?F"G<H>I|J\u0001K', day)).toBe("Gantt - A B C D E F G H I J K - 2026-10-08");
    expect(exportFileName("  many   spaces ", day)).toBe("Gantt - many spaces - 2026-10-08");
  });

  test("long titles are cut to 80 characters; empty titles are left out", () => {
    expect(exportFileName("x".repeat(200), day)).toBe(`Gantt - ${"x".repeat(80)} - 2026-10-08`);
    expect(exportFileName(" /// ", day)).toBe("Gantt - 2026-10-08");
  });
});

describe("escapeHtml and safeColor", () => {
  test("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<b a="1">'&'</b>`)).toBe("&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
  });

  test.each(["#abc", "#A1B2C3", "#11223344", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)", " #abc "])("%p is a safe colour", (c) => {
    expect(safeColor(c)).toBe(c.trim());
  });

  test.each(["red", "#12", "#ggg", "url(x)", "rgb(1,2,3);background:url(x)", "expression(alert(1))", null, undefined])("%p is rejected", (c) => {
    expect(safeColor(c)).toBeNull();
  });
});

describe("buildPrintHtml — document", () => {
  test("header has the title and generated line; the document title is the file name; A3 landscape", () => {
    const html = buildPrintHtml(model([row("a")]));
    expect(html).toContain("<title>Gantt - Alazan - 2026-10-08</title>");
    expect(html).toContain("<header><h1>Alazan</h1><div>Generated 10/8/2026</div></header>");
    expect(html).toContain("@page { size: A3 landscape;");
  });

  test("the column header is a <thead> (repeats on every printed page) with the timeline ticks", () => {
    const html = buildPrintHtml(model([row("a")]));
    expect(html).toContain("thead { display: table-header-group; }");
    expect(html).toContain('<thead><tr><th>Title</th><th>Start</th><th>End</th><th class="tl"><span class="tick" style="left:0%">T1</span>');
    expect(html).toContain("tr { break-inside: avoid;");
  });

  test("every text from the data is escaped", () => {
    const html = buildPrintHtml(model([row("a", { name: "<img src=x>", startText: "<s>", endText: "&" })], { title: "<T>", generatedText: '"g"', fileName: "<f>", columns: { task: "<c>", start: "s", end: "e" } }));
    expect(html).not.toMatch(/<img|<s>|<T>|<f>|<c>/);
    expect(html).toContain("&lt;img src=x&gt;");
  });

  test("no rows: an empty table, no ticks, no crash", () => {
    const html = buildPrintHtml(model([]));
    expect(html).toContain('<td colspan="4" class="empty">—</td>');
    expect(html).not.toContain('class="tick"');
  });
});

describe("buildPrintHtml — rows", () => {
  test("rows in the given (tree) order, indented by depth, parents bold", () => {
    const html = buildPrintHtml(model([row("p", { hasChildren: true }), row("c", { depth: 2 })]));
    expect(html.indexOf("Task p")).toBeLessThan(html.indexOf("Task c"));
    expect(html).toContain('<tr class="parent"><td class="name" title="Task p"><span style="padding-left:0mm">Task p</span>');
    expect(html).toContain(`<span style="padding-left:${2 * INDENT_MM}mm">Task c</span>`);
  });

  test("indent is capped for very deep rows; negative depth prints at 0", () => {
    const html = buildPrintHtml(model([row("deep", { depth: 99 }), row("neg", { depth: -3 })]));
    expect(html).toContain(`padding-left:${MAX_INDENT_DEPTH * INDENT_MM}mm">Task deep`);
    expect(html).toContain('padding-left:0mm">Task neg');
  });

  test("a bar is placed by its dates, in its colour; one gridline per tick", () => {
    // Range aligns to Jan 1 .. Mar 1 (59 days): Jan 1 -> 0%, Feb 1 -> 52.542%.
    const html = buildPrintHtml(model([row("a")]));
    expect(html).toContain('<span class="bar" style="left:0%;width:52.542%;background:#112233"></span>');
    expect(html.match(/class="grid"/g)).toHaveLength(2);
  });

  test("project bars have their own style; milestones are diamonds; bad colours fall back", () => {
    const html = buildPrintHtml(model([row("p", { kind: "project" }), row("m", { kind: "milestone", color: "url(x)" })]));
    expect(html).toContain('<span class="bar project" style="left:0%;width:52.542%;background:#112233">');
    expect(html).toContain(`<span class="milestone" style="left:0%;background:${DEFAULT_BAR_COLOR}"></span>`);
  });

  test("rows but no valid dates at all: rows print, without ticks, gridlines or bars", () => {
    const html = buildPrintHtml(model([row("x", { start: new Date("x"), end: new Date("y") })]));
    expect(html).toContain("Task x");
    expect(html).not.toMatch(/class="(tick|grid|bar|milestone)/);
  });

  test("a row with invalid dates prints without a bar", () => {
    const html = buildPrintHtml(model([row("ok"), row("bad", { start: new Date("x"), end: new Date("x") })]));
    expect(html.match(/class="bar"/g)).toHaveLength(1);
  });
});
