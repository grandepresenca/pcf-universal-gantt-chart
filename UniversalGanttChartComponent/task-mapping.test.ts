// task-mapping.test.ts — parent attachment, the display pipeline, the cycle warning.

import { Task } from "gantt-task-react";
import { TaskNode, buildHierarchy, cycleWarning, linkParent } from "./task-mapping";

const node = (id: string, parentId: string | null, iso: string, endIso: string = iso): TaskNode => {
  const task: Task = { id, name: id, start: new Date(iso), end: new Date(endIso), progress: 0, type: "task" };
  return { id, parentId, task };
};
const shape = (nodes: TaskNode[]): [string, number, boolean][] =>
  buildHierarchy(nodes).rows.map((r) => [r.node.id, r.depth, r.hasChildren]);

describe("linkParent", () => {
  test("a project parent groups the task under it (project only, no arrow)", () => {
    expect(linkParent("project", "P-1")).toEqual({ project: "P-1" });
  });

  test.each(["task", "milestone"] as const)("a %s parent draws a dependency arrow (no grouping)", (type) => {
    expect(linkParent(type, "T-1")).toEqual({ dependencies: ["T-1"] });
  });

  test("the parent record id is passed through unchanged", () => {
    expect(linkParent("project", "{AbC}")).toEqual({ project: "{AbC}" });
    expect(linkParent("task", "{AbC}")).toEqual({ dependencies: ["{AbC}"] });
  });
});

describe("buildHierarchy — display order", () => {
  test("siblings at every level by start; parents before children; depth and hasChildren", () => {
    const nodes = [
      node("p2", null, "2026-05-01"),
      node("p1", null, "2026-01-01"),
      node("p1-late", "p1", "2026-03-01"),
      node("p1-early", "p1", "2026-02-01"),
      node("p1-early-b", "p1-early", "2026-02-20"),
      node("p1-early-a", "p1-early", "2026-02-10"),
    ];
    expect(shape(nodes)).toEqual([
      ["p1", 0, true],
      ["p1-early", 1, true],
      ["p1-early-a", 2, false],
      ["p1-early-b", 2, false],
      ["p1-late", 1, false],
      ["p2", 0, false],
    ]);
  });

  test("a child that starts before its parent still comes after it", () => {
    expect(shape([node("p", null, "2026-02-01"), node("c", "p", "2026-01-01")])).toEqual([
      ["p", 0, true],
      ["c", 1, false],
    ]);
  });

  test("sorted by START, not end", () => {
    const nodes = [node("long", null, "2026-01-01", "2026-12-31"), node("short", null, "2026-02-01", "2026-02-02")];
    expect(shape([...nodes].reverse()).map((r) => r[0])).toEqual(["long", "short"]);
  });

  test("equal starts keep view (input) order", () => {
    const same = "2026-01-01";
    expect(shape([node("z", null, same), node("a", null, same), node("m", null, same)]).map((r) => r[0])).toEqual([
      "z",
      "a",
      "m",
    ]);
  });

});

describe("buildHierarchy — orphans, identity, cycles", () => {
  test("an orphan is a root, placed among the roots by start", () => {
    expect(shape([node("r", null, "2026-03-01"), node("o", "not-loaded", "2026-01-01")])).toEqual([
      ["o", 0, false],
      ["r", 0, false],
    ]);
  });

  test("rows carry the same TaskNode objects (tasks pass through untouched)", () => {
    const nodes = [node("a", null, "2026-01-01")];
    expect(buildHierarchy(nodes).rows[0].node).toBe(nodes[0]);
  });

  test("does not mutate the input; empty input gives no rows and no cycles", () => {
    const nodes = [node("b", null, "2026-02-01"), node("a", null, "2026-01-01")];
    buildHierarchy(nodes);
    expect(nodes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(buildHierarchy([])).toEqual({ rows: [], cycleIds: [] });
  });

  test("a cycle: every task still shown once; cycleIds in view (input) order, not start order", () => {
    // Input order b, a; start order a, b.
    const nodes = [node("b", "a", "2026-02-01"), node("a", "b", "2026-01-01"), node("ok", null, "2026-03-01")];
    const { rows, cycleIds } = buildHierarchy(nodes);
    expect(rows.map((r) => r.node.id).sort()).toEqual(["a", "b", "ok"]);
    expect(cycleIds).toEqual(["b", "a"]);
  });

  test("no cycles in a normal tree", () => {
    expect(buildHierarchy([node("p", null, "2026-01-01"), node("c", "p", "2026-01-02")]).cycleIds).toEqual([]);
  });
});

describe("cycleWarning", () => {
  test("no cycle ids, no warning", () => {
    expect(cycleWarning([])).toBeUndefined();
  });

  test("names the count and the ids", () => {
    expect(cycleWarning(["a", "b"])).toBe(
      "Hierarchy: 2 task(s) have parent links that form a cycle (a, b). Each is still shown once; check their Parent Task values."
    );
  });

  test("lists at most 10 ids and summarizes the rest", () => {
    const ten = Array.from({ length: 10 }, (_v, i) => `t${i}`);
    expect(cycleWarning(ten)).toContain("(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9)");
    expect(cycleWarning(ten)).not.toContain("more");
    const message = cycleWarning([...ten, "t10", "t11"]);
    expect(message).toContain("12 task(s)");
    expect(message).toContain("(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9 and 2 more)");
    expect(message).not.toContain("t10");
  });
});
