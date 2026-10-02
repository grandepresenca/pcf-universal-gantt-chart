// wbs.test.ts — parents derived from WBS, and the lookup-vs-WBS cross-check.

import { buildWbsParentMap, crossCheckParents, parseWbs, WbsTask } from "./wbs";
import { findCycleIds } from "./hierarchy";
import { buildHierarchy, TaskNode } from "./task-mapping";

const P = "11111111-aaaa-0000-0000-000000000001";
const Q = "22222222-bbbb-0000-0000-000000000002";
const t = (id: string, wbs: unknown, projectId: unknown = P): WbsTask => ({ id, wbs, projectId });
const parents = (tasks: WbsTask[]): Record<string, string | null> =>
  Object.fromEntries(buildWbsParentMap(tasks).parentOf);

describe("parseWbs — usable codes", () => {
  test.each([
    ["13", ["13"]],
    ["5.15.4.12", ["5", "15", "4", "12"]],
    [" 5. 15 ", ["5", "15"]],
    ["01.002", ["01", "002"]],
  ])("%p -> %p", (wbs, expected) => {
    expect(parseWbs(wbs)).toEqual(expected);
  });
});

describe("parseWbs — unusable codes", () => {
  test.each([null, undefined, 5, {}, ["5"], "", "   ", ".5", "5.", "5..1", "A.1", "5.1a", "-1", "+1", "1e3", "5,1", "5 1"])(
    "%p -> undefined",
    (wbs) => {
      expect(parseWbs(wbs)).toBeUndefined();
    }
  );
});

describe("buildWbsParentMap — nearest existing ancestor", () => {
  test("the parent is the task one level up", () => {
    expect(parents([t("a", "5"), t("b", "5.15"), t("c", "5.15.4"), t("d", "5.15.4.12")])).toEqual({
      a: null,
      b: "a",
      c: "b",
      d: "c",
    });
  });

  test("gaps: walks up past missing levels, and reports it", () => {
    const only515 = buildWbsParentMap([t("p", "5.15"), t("d", "5.15.4.12")]);
    expect(only515.parentOf.get("d")).toBe("p");
    expect(only515.gapResolved).toEqual(["d"]);
    const only5 = buildWbsParentMap([t("p", "5"), t("d", "5.15.4.12")]);
    expect(only5.parentOf.get("d")).toBe("p");
    expect(only5.gapResolved).toEqual(["d"]);
  });

  test("a direct parent is not a gap; no ancestor at all is a root, not a gap", () => {
    const result = buildWbsParentMap([t("p", "5"), t("c", "5.1"), t("lost", "7.3.2")]);
    expect(result.parentOf.get("c")).toBe("p");
    expect(result.parentOf.get("lost")).toBeNull();
    expect(result.gapResolved).toEqual([]);
  });

  test("level 1 is always a root, even with other roots around", () => {
    expect(parents([t("x", "13"), t("y", "5")])).toEqual({ x: null, y: null });
  });

  test("segments compare exactly: no leading-zero folding", () => {
    expect(parents([t("one", "1"), t("child", "01.2"), t("zero-one", "01"), t("other", "1.2")])).toEqual({
      one: null,
      child: "zero-one",
      "zero-one": null,
      other: "one",
    });
  });

  test("whitespace around segments does not matter", () => {
    expect(parents([t("p", " 5.15 "), t("c", "5 . 15 . 3")]).c).toBe("p");
  });
});

describe("buildWbsParentMap — project scoping", () => {
  test("the same WBS in two projects never cross-links", () => {
    expect(parents([t("p5", "5", P), t("q51", "5.1", Q)])).toEqual({ p5: null, q51: null });
  });

  test("project ids differing only in braces or case are the same project", () => {
    expect(parents([t("p", "5", `{${P.toUpperCase()}}`), t("c", "5.1", P)]).c).toBe("p");
  });

  test.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   "],
    ["braces only", "{}"],
    ["a lookup object (caller must extract the id)", { id: P }],
  ])("a %s project makes the task unusable: no parent, and nobody's parent", (_label, projectId) => {
    // Built directly: t()'s default project would replace an undefined projectId.
    const result = buildWbsParentMap([{ id: "orphaned", wbs: "5", projectId }, t("c", "5.1")]);
    expect(Object.fromEntries(result.parentOf)).toEqual({ orphaned: null, c: null });
    expect(result.unusable).toEqual(["orphaned"]);
  });
});

describe("buildWbsParentMap — malformed codes and duplicates", () => {
  test("a malformed WBS gives no parent and is listed as unusable", () => {
    const result = buildWbsParentMap([t("p", "5"), t("bad", "5..1"), t("empty", ""), t("ok", "5.2")]);
    expect(Object.fromEntries(result.parentOf)).toEqual({ p: null, bad: null, empty: null, ok: "p" });
    expect(result.unusable).toEqual(["bad", "empty"]);
  });

  test("duplicates: the first is the parent; all ids are reported, per project", () => {
    const result = buildWbsParentMap([
      t("p", "5"),
      t("first", "5.1"),
      t("second", " 5.1 "),
      t("child", "5.1.1"),
      t("other-project", "5.1", Q),
    ]);
    expect(result.parentOf.get("child")).toBe("first");
    expect(result.parentOf.get("second")).toBe("p");
    expect(result.duplicates).toEqual([{ projectId: P, wbs: "5.1", ids: ["first", "second"] }]);
  });

  test("duplicates are listed in first-seen order", () => {
    const result = buildWbsParentMap([t("b1", "2"), t("a1", "1"), t("a2", "1"), t("b2", "2")]);
    expect(result.duplicates.map((d) => d.wbs)).toEqual(["2", "1"]);
  });
});

describe("buildWbsParentMap — shape and guarantees", () => {
  test("every input id is in parentOf, in input order, with original ids as values", () => {
    const result = buildWbsParentMap([t("{Parent-ID}", "5"), t("bad", 7), t("c", "5.1")]);
    expect(Array.from(result.parentOf.keys())).toEqual(["{Parent-ID}", "bad", "c"]);
    expect(result.parentOf.get("c")).toBe("{Parent-ID}");
  });

  test("does not mutate the input; empty input gives an empty result", () => {
    const tasks = [t("c", "5.1"), t("p", "5")];
    const copy = JSON.parse(JSON.stringify(tasks));
    buildWbsParentMap(tasks);
    expect(tasks).toEqual(copy);
    expect(buildWbsParentMap([])).toEqual({ parentOf: new Map(), unusable: [], duplicates: [], gapResolved: [] });
  });

  test("never produces a cycle (a parent always has fewer segments)", () => {
    const tasks = [t("a", "1"), t("b", "1.1"), t("c", "1.1.1"), t("d", "1.1"), t("e", "1.2.3.4"), t("f", "2.1")];
    const nodes = Array.from(buildWbsParentMap(tasks).parentOf, ([id, parentId]) => ({ id, parentId }));
    expect(findCycleIds(nodes)).toEqual([]);
  });

  test("buildHierarchy consumes parentOf unchanged (depths follow the WBS)", () => {
    const { parentOf } = buildWbsParentMap([t("c", "5.1"), t("p", "5"), t("g", "5.1.7")]);
    const nodes: TaskNode[] = Array.from(parentOf, ([id, parentId]) => ({
      id,
      parentId,
      task: { id, name: id, start: new Date("2026-01-01"), end: new Date("2026-01-02"), progress: 0, type: "task" },
    }));
    expect(buildHierarchy(nodes).rows.map((r) => [r.node.id, r.depth])).toEqual([
      ["p", 0],
      ["c", 1],
      ["g", 2],
    ]);
  });
});

describe("crossCheckParents — classification", () => {
  test("agree, disagree, lookup-only, wbs-only", () => {
    const lookup = new Map<string, string | null>([
      ["same", "p"],
      ["roots", null],
      ["diff", "p"],
      ["lookup-only", "p"],
      ["wbs-only", null],
    ]);
    const wbs = new Map<string, string | null>([
      ["same", "p"],
      ["roots", null],
      ["diff", "q"],
      ["lookup-only", null],
      ["wbs-only", "q"],
    ]);
    expect(crossCheckParents(lookup, wbs)).toEqual({
      agree: ["same", "roots"],
      disagree: [{ id: "diff", lookup: "p", wbs: "q" }],
      lookupOnly: [{ id: "lookup-only", lookup: "p" }],
      wbsOnly: [{ id: "wbs-only", wbs: "q" }],
    });
  });

  test("parent ids are compared normalized (braces, case)", () => {
    const check = crossCheckParents(new Map([["c", `{${P.toUpperCase()}}`]]), new Map([["c", P]]));
    expect(check.agree).toEqual(["c"]);
    expect(check.disagree).toEqual([]);
  });
});

describe("crossCheckParents — differing task sets", () => {
  test("an id missing from one map counts as no parent there; lookup ids first, then wbs-only ids", () => {
    const lookup = new Map<string, string | null>([["l", "p"], ["both", null]]);
    const wbs = new Map<string, string | null>([["w", "q"], ["both", null], ["w-root", null]]);
    expect(crossCheckParents(lookup, wbs)).toEqual({
      agree: ["both", "w-root"],
      disagree: [],
      lookupOnly: [{ id: "l", lookup: "p" }],
      wbsOnly: [{ id: "w", wbs: "q" }],
    });
  });

  test("validating real parents: lookup-derived vs WBS-derived on the same tasks", () => {
    const tasks = [t("site", "4"), t("t423", "4.23"), t("t5", "5"), t("t51", "5.1")];
    const lookup = new Map<string, string | null>([["site", null], ["t423", "site"], ["t5", null], ["t51", "site"]]);
    const check = crossCheckParents(lookup, buildWbsParentMap(tasks).parentOf);
    expect(check.agree).toEqual(["site", "t423", "t5"]);
    expect(check.disagree).toEqual([{ id: "t51", lookup: "site", wbs: "t5" }]);
  });
});
