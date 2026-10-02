// report.test.ts — the Markdown report states its basis and shows every finding.

import { analyse, BASIS } from "./analysis";
import { renderReport } from "./report";
import { act, dv, pwa } from "./test-builders";

const ctx = {
  generatedAt: "2026-10-02T12:00:00Z",
  pwa: { source: "pwa" as const, extractedAt: "t1", url: "https://pwa/x", count: 3 },
  dataverse: { source: "dataverse" as const, extractedAt: "t2", url: "https://dv/x", count: 3 },
};

/** A small world with one finding of each kind. */
function messy(): string {
  const pwaRows = [
    pwa("r1", "P", { wbs: "1" }),
    pwa("r2", "P", { wbs: "2" }),
    pwa("c", "P", { wbs: "2.1", outlineLevel: 2, parentTaskId: "r2", name: "Pipe | name" }),
    pwa("m", "P", { wbs: "9" }),
  ];
  const dvRows = [
    dv("r1", "D", { wbs: "1" }),
    dv("r2", "D", { wbs: "2" }),
    dv("c", "D", { wbs: "2.1", outlineLevel: 2, parentActivityId: act("r1") }),
    dv("x", "D", { wbs: "x", outlineLevel: 3 }),
    dv("dup", "D", { activityid: "d1" }),
    dv("dup", "D", { activityid: "d2" }),
    dv("o", "D", { wbs: "1.1.1", outlineLevel: 2 }),
    dv("w1", "D", { wbs: "5" }),
    dv("w2", "D", { wbs: "5" }),
    dv("z", "Z"),
    dv("a", "MIX"),
    dv("b", "MIX"),
  ];
  return renderReport(analyse(dvRows, [...pwaRows, pwa("a", "P"), pwa("b", "Q"), pwa("x", "P", { wbs: "8" })], 1), ctx);
}

describe("renderReport", () => {
  test("states the comparison basis at the top and again in the per-project section", () => {
    const md = renderReport(analyse([], []), ctx);
    expect(md.split(BASIS)).toHaveLength(3);
    expect(md).toContain("Read-only");
    expect(md).toContain("3 rows extracted t1 from https://pwa/x");
  });

  test("every section is present and empty lists say so", () => {
    const md = renderReport(analyse([], []), ctx);
    ["## Summary", "## 1. Parents", "## 2. Dataverse internal checks", "## 3. Per-project task counts", "## 4. Unmatched tasks"].forEach((h) =>
      expect(md).toContain(h)
    );
    expect(md).toContain("0 of 0 projects match exactly");
    expect(md.match(/None\./g)).toHaveLength(2);
  });

});

describe("renderReport — findings", () => {
  test("findings are rendered with headings, capped examples and escaped pipes", () => {
    const md = messy();
    [
      "### Dataverse differs (PWA = WBS)",
      "### Orphans",
      "### Unusable WBS",
      "### Duplicate klein_legacyid",
      "### Duplicate WBS",
      "### klein_outlinelevel ≠ WBS depth",
      "### klein_wbs ≠ PWA TaskWBS",
      "### Projects with differences",
      "### Dataverse projects with no matching PWA project",
      "### Dataverse projects whose tasks come from several PWA projects",
      "### In PWA, missing in Dataverse",
      "### In Dataverse, not in PWA",
    ].forEach((h) => expect(md).toContain(h));
    expect(md).toContain("Pipe \\| name");
    expect(md).toMatch(/\(first 1 of \d+\)/);
  });

  test("a level 0 missing on the PWA side reads as NO in the PWA column", () => {
    const md = renderReport(analyse([dv("p0", "D", { outlineLevel: 0 }), dv("a", "D")], [pwa("a", "P")]), ctx);
    expect(md).toContain("| NO | yes |");
  });

  test("a root parent reads as '— (root)'; a missing level 0 reads as NO", () => {
    const md = renderReport(analyse([dv("c", "D", { parentActivityId: act("r") }), dv("r", "D")], [pwa("c", "P"), pwa("r", "P"), pwa("p0", "P", { isProjectSummary: true, outlineLevel: 0 })]), ctx);
    expect(md).toContain("— (root)");
    expect(md).toContain("| yes | NO |");
  });
});
