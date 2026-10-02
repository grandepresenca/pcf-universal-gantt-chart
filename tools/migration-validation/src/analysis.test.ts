// analysis.test.ts — join, level-0 basis, three-way parents, Dataverse checks.

import { analyse, BASIS } from "./analysis";
import { act, dv, pwa } from "./test-builders";

/** A project with a level-0 summary and one child on each side. */
const withLevel0 = () => ({
  pwaRows: [
    pwa("p0", "P", { isProjectSummary: true, outlineLevel: 0, wbs: "0" }),
    pwa("a", "P", { wbs: "1", parentTaskId: "p0" }),
  ],
  dvRows: [dv("p0", "D", { outlineLevel: 0, wbs: "0" }), dv("a", "D", { wbs: "1", parentActivityId: act("p0") })],
});

describe("analyse — join and level-0 basis", () => {
  test("joins TaskId to klein_legacyid regardless of case and braces", () => {
    const r = analyse([dv("{ABC-1}", "D")], [pwa("abc-1", "P")]);
    expect(r.totals.joined).toBe(1);
    expect(r.missingInDv.count + r.extraInDv.count).toBe(0);
  });

  test("level 0 is excluded from counts on both sides, and the basis says so", () => {
    const { pwaRows, dvRows } = withLevel0();
    const r = analyse(dvRows, pwaRows);
    expect(r.totals).toMatchObject({ pwaTasks: 1, pwaLevel0: 1, dvTasks: 1, dvLevel0: 1, joined: 1 });
    expect(r.basis).toBe(BASIS);
    expect(BASIS).toContain("EXCLUDE the level-0 project summary task on both sides");
  });

  test("PWA level 0 is recognised by TaskIsProjectSummary OR outline level 0", () => {
    const r = analyse([], [pwa("s", "P", { isProjectSummary: true, outlineLevel: 1 }), pwa("z", "P", { isProjectSummary: null, outlineLevel: 0 })]);
    expect(r.totals.pwaLevel0).toBe(2);
    expect(r.totals.pwaTasks).toBe(0);
  });

  test("a parent that is the level-0 row counts as root on every side (no false disagreement)", () => {
    const { pwaRows, dvRows } = withLevel0();
    expect(analyse(dvRows, pwaRows).parents.verdicts.agree).toBe(1);
  });

  test("missing in Dataverse and not in PWA are listed with complete counts", () => {
    const r = analyse([dv("a", "D"), dv("x", "D")], [pwa("a", "P"), pwa("m", "P")]);
    expect(r.missingInDv.items.map((t) => t.id)).toEqual(["m"]);
    expect(r.extraInDv.items.map((t) => t.id)).toEqual(["x"]);
  });

  test("Dataverse rows without klein_legacyid are counted but never compared", () => {
    const r = analyse([dv(null, "D")], []);
    expect(r.totals).toMatchObject({ dvWithoutLegacyId: 1, dvTasks: 0 });
  });

  test("limit caps example lists; counts stay complete", () => {
    const r = analyse([], [pwa("m1", "P"), pwa("m2", "P"), pwa("m3", "P")], 2);
    expect(r.missingInDv.count).toBe(3);
    expect(r.missingInDv.items).toHaveLength(2);
  });
});

/** Two roots r1/r2 and a child c, with each source's choice of parent for c. */
function threeWay(pwaParent: string | null, dvParent: string | null, childWbs: string) {
  const pwaRows = [pwa("r1", "P", { wbs: "1" }), pwa("r2", "P", { wbs: "2" }), pwa("c", "P", { wbs: "2.1", outlineLevel: 2, parentTaskId: pwaParent })];
  const dvRows = [
    dv("r1", "D", { wbs: "1" }),
    dv("r2", "D", { wbs: "2" }),
    dv("c", "D", { wbs: childWbs, outlineLevel: 2, parentActivityId: dvParent === null ? null : act(dvParent) }),
  ];
  return analyse(dvRows, pwaRows).parents;
}

describe("analyse — three-way parents", () => {
  test.each([
    ["agree", "r2", "r2", "2.1"],
    ["dataverse-differs", "r2", "r1", "2.1"],
    ["wbs-differs", "r2", "r2", "1.1"],
    ["pwa-differs", "r1", "r2", "2.1"],
    ["all-differ", "r1", "r2", "3.1"],
  ])("%s", (verdict, pwaParent, dvParent, childWbs) => {
    // The two roots always agree (no parent anywhere); only the child varies.
    const parents = threeWay(pwaParent, dvParent, childWbs);
    const expected = { agree: 2, "dataverse-differs": 0, "wbs-differs": 0, "pwa-differs": 0, "all-differ": 0 };
    expected[verdict as keyof typeof expected]++;
    expect(parents.verdicts).toEqual(expected);
  });

  test("an example row names all three parents (root shown as null)", () => {
    const row = threeWay("r2", "r1", "2.1").examples["dataverse-differs"].items[0];
    expect([row.task.id, row.pwa?.id, row.dataverse?.id, row.wbs?.id]).toEqual(["c", "r2", "r1", "r2"]);
    expect(threeWay("r2", null, "1.1").examples["all-differ"].items[0].dataverse).toBeNull();
  });

  test("pairwise summaries come from crossCheckParents", () => {
    const pairs = threeWay("r2", "r1", "2.1").pairs;
    expect(pairs.pwaVsDataverse).toEqual({ agree: 2, disagree: 1, onlyLeft: 0, onlyRight: 0 });
    expect(pairs.pwaVsWbs).toEqual({ agree: 3, disagree: 0, onlyLeft: 0, onlyRight: 0 });
  });

});

describe("analyse — dangling and unknown parents", () => {
  test("a lookup to a record outside the extract is 'dangling', never a match", () => {
    const r = analyse([dv("c", "D", { parentActivityId: "ghost" })], [pwa("c", "P")]);
    expect(r.parents.verdicts["dataverse-differs"]).toBe(1);
    expect(r.parents.examples["dataverse-differs"].items[0].dataverse?.name).toContain("not in the extract");
    expect(r.dataverse.danglingParents.count).toBe(1);
  });

  test("parents known only to Dataverse, or to neither system, are still named", () => {
    const r = analyse(
      [dv("x", "D"), dv("c", "D", { parentActivityId: act("x") }), dv("k", "D")],
      [pwa("c", "P", { parentTaskId: "lost" }), pwa("k", "P", { parentTaskId: "lost" })]
    );
    const row = r.parents.examples["all-differ"].items[0];
    expect([row.pwa?.id, row.pwa?.name, row.dataverse?.id, row.dataverse?.name]).toEqual(["lost", null, "x", "T x"]);
  });

  test("a lookup to a row without klein_legacyid is dangling too", () => {
    const r = analyse([dv(null, "D"), dv("c", "D", { parentActivityId: act("none") })], [pwa("c", "P")]);
    expect(r.dataverse.danglingParents.count).toBe(1);
  });
});
