// checks.test.ts — Dataverse-internal checks and per-project counts.

import { analyse } from "./analysis";
import { act, dv, pwa } from "./test-builders";

describe("Dataverse checks — hierarchy", () => {
  test("orphans: outline level > 1 with no parent; level 1 without a parent is fine", () => {
    const r = analyse([dv("a", "D", { outlineLevel: 1 }), dv("b", "D", { outlineLevel: 2 }), dv("c", "D", { outlineLevel: 3 })], []);
    expect(r.dataverse.orphans.items.map((t) => t.id)).toEqual(["b", "c"]);
  });

  test("duplicate klein_legacyid: the first row is used, every activityid is listed; unique ids are not", () => {
    const r = analyse([dv("a", "D", { activityid: "x1" }), dv("A", "D", { activityid: "x2" }), dv("b", "D")], [pwa("a", "P")]);
    expect(r.dataverse.duplicateLegacyIds.items).toEqual([{ legacyId: "a", activityIds: ["x1", "x2"] }]);
    expect(r.totals.dvTasks).toBe(2);
  });

  test("a task with no outline level is not counted as an orphan", () => {
    expect(analyse([dv("n", "D", { outlineLevel: null })], []).dataverse.orphans.count).toBe(0);
  });

  test("a level-2 task under a level-1 parent is not an orphan", () => {
    const r = analyse([dv("p", "D"), dv("c", "D", { outlineLevel: 2, parentActivityId: act("p") })], []);
    expect(r.dataverse.orphans.count).toBe(0);
  });
});

describe("Dataverse checks — WBS", () => {
  test("unusable, duplicate and gap-resolved WBS come from buildWbsParentMap", () => {
    const r = analyse(
      [dv("bad", "D", { wbs: "x" }), dv("d1", "D", { wbs: "7" }), dv("d2", "D", { wbs: "7" }), dv("g", "D", { wbs: "7.1.1", outlineLevel: 3 })],
      []
    );
    expect(r.dataverse.wbsUnusable.items.map((t) => t.id)).toEqual(["bad"]);
    expect(r.dataverse.wbsDuplicates.items).toEqual([{ project: "DV D", wbs: "7", tasks: [expect.objectContaining({ id: "d1" }), expect.objectContaining({ id: "d2" })] }]);
    expect(r.dataverse.wbsGaps.items.map((t) => t.id)).toEqual(["g"]);
  });

  test("the same WBS in two projects never cross-links (WBS parents are per project)", () => {
    const r = analyse(
      [dv("p1", "D1", { wbs: "1" }), dv("c1", "D1", { wbs: "1.1", outlineLevel: 2, parentActivityId: act("p1") }),
       dv("p2", "D2", { wbs: "1" }), dv("c2", "D2", { wbs: "1.1", outlineLevel: 2, parentActivityId: act("p2") })],
      [pwa("p1", "P1", { wbs: "1" }), pwa("c1", "P1", { wbs: "1.1", parentTaskId: "p1" }),
       pwa("p2", "P2", { wbs: "1" }), pwa("c2", "P2", { wbs: "1.1", parentTaskId: "p2" })]
    );
    expect(r.parents.verdicts.agree).toBe(4);
    expect(r.dataverse.wbsDuplicates.count).toBe(0);
  });

  test("klein_outlinelevel must equal the WBS depth", () => {
    const r = analyse([dv("ok", "D", { wbs: "1.2", outlineLevel: 2 }), dv("off", "D", { wbs: "1.2.3", outlineLevel: 2 }), dv("nowbs", "D", { outlineLevel: 5 })], []);
    expect(r.dataverse.outlineVsDepth.items).toEqual([{ task: expect.objectContaining({ id: "off" }), depth: 3 }]);
  });

  test("klein_wbs vs PWA TaskWBS, ignoring surrounding spaces", () => {
    const r = analyse(
      [dv("same", "D", { wbs: " 1.2 " }), dv("diff", "D", { wbs: "1.3" }), dv("none", "D", { wbs: null })],
      [pwa("same", "P", { wbs: "1.2" }), pwa("diff", "P", { wbs: "1.4" }), pwa("none", "P", { wbs: null })]
    );
    expect(r.dataverse.wbsVsPwa.items).toEqual([{ task: expect.objectContaining({ id: "diff" }), pwaWbs: "1.4" }]);
  });
});

describe("per-project counts", () => {
  const pwaRows = [
    pwa("p0", "P", { isProjectSummary: true, outlineLevel: 0 }),
    pwa("a", "P"),
    pwa("i", "P", { isActive: false }),
    pwa("m", "P"),
    pwa("q1", "Q"),
  ];
  const dvRows = [dv("p0", "D", { outlineLevel: 0 }), dv("a", "D"), dv("i", "D"), dv("x", "D"), dv("q1", "E")];

  test("counts (level 0 excluded), inactive, missing/extra, level-0 flags; matching projects omitted", () => {
    const r = analyse(dvRows, pwaRows);
    expect(r.projects.withDifferences).toEqual([
      { projectId: "P", name: "P P", pwaCount: 3, pwaInactive: 1, dvCount: 3, missingInDv: 1, extraInDv: 1, pwaLevel0: true, dvLevel0: true },
    ]);
    expect(r.projects.all.map((p) => p.name)).toEqual(["P P", "P Q"]);
  });

  test("projects are sorted by name; a project without a name sorts first", () => {
    const r = analyse([], [pwa("b", "B"), pwa("n", "N", { projectName: null }), pwa("a", "A")]);
    expect(r.projects.all.map((p) => p.name)).toEqual([null, "P A", "P B"]);
  });

  test("a level-0 row on one side only is a difference (not a +1 in the counts)", () => {
    const r = analyse([dv("a", "D")], [pwa("p0", "P", { isProjectSummary: true, outlineLevel: 0 }), pwa("a", "P")]);
    expect(r.projects.withDifferences[0]).toMatchObject({ pwaCount: 1, dvCount: 1, pwaLevel0: true, dvLevel0: false });
  });

});

describe("per-project counts — project mapping", () => {
  test("a Dataverse level-0 row finds its project through its own legacy id", () => {
    const r = analyse([dv("p0", "UNMAPPED", { outlineLevel: 0 })], [pwa("p0", "P", { isProjectSummary: true, outlineLevel: 0 })]);
    expect(r.projects.all[0]).toMatchObject({ pwaLevel0: true, dvLevel0: true });
    expect(r.projects.unmappedDvProjects.count).toBe(0);
  });

  test("a joined task with no Dataverse project maps nothing (and is reported as unmapped)", () => {
    const r = analyse([dv("a", null)], [pwa("a", "P")]);
    expect(r.projects.all[0]).toMatchObject({ pwaCount: 1, dvCount: 0 });
    expect(r.projects.unmappedDvProjects.items).toEqual([{ dvProjectId: "(none)", name: null, count: 1 }]);
  });

  test("Dataverse projects with no PWA match, and with tasks from several PWA projects", () => {
    const r = analyse([dv("z", "Z"), dv(null, null), dv("a", "MIX"), dv("b", "MIX"), dv("n", null)], [pwa("a", "P"), pwa("b", "Q")]);
    expect(r.projects.unmappedDvProjects.items).toEqual([
      { dvProjectId: "Z", name: "DV Z", count: 1 },
      { dvProjectId: "MIX", name: "DV MIX", count: 2 },
      { dvProjectId: "(none)", name: null, count: 1 },
    ]);
    expect(r.projects.conflictingDvProjects.items).toEqual([{ dvProjectId: "mix", name: "DV MIX", pwaProjectIds: ["p", "q"] }]);
  });
});
