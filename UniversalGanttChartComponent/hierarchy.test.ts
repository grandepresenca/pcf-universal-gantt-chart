// hierarchy.test.ts  the contract for the pure tree logic.
// These tests are written BEFORE the implementation (ADR-002 discipline:
// a behaviour starts as a test). pcf-dev makes them pass without weakening them.
//
// The five edge cases you called out are all here: arbitrary depth, orphan
// parent, cycle, missing parent, and sibling ordering  plus the basics.

import { orderByHierarchy, depthOf, HierNode } from "./hierarchy";

const n = (id: string, parentId: string | null = null): HierNode => ({ id, parentId });
const ids = (out: { node: HierNode }[]): string[] => out.map((o) => o.node.id);
const depths = (out: { node: HierNode; depth: number }[]): Record<string, number> =>
  Object.fromEntries(out.map((o) => [o.node.id, o.depth]));

describe("orderByHierarchy  basics", () => {
  test("empty input yields empty output", () => {
    expect(orderByHierarchy([])).toEqual([]);
  });

  test("single root at depth 0", () => {
    const out = orderByHierarchy([n("a")]);
    expect(ids(out)).toEqual(["a"]);
    expect(depths(out)).toEqual({ a: 0 });
  });

  test("flat list of roots keeps input order, all depth 0", () => {
    const out = orderByHierarchy([n("a"), n("b"), n("c")]);
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(Object.values(depths(out)).every((d) => d === 0)).toBe(true);
  });
});

describe("orderByHierarchy  nesting", () => {
  test("parent before child; child at depth 1", () => {
    const out = orderByHierarchy([n("child", "root"), n("root")]);
    expect(ids(out)).toEqual(["root", "child"]);
    expect(depths(out)).toEqual({ root: 0, child: 1 });
  });

  test("arbitrary depth: child of child of child", () => {
    const out = orderByHierarchy([
      n("d", "c"),
      n("c", "b"),
      n("b", "a"),
      n("a"),
    ]);
    expect(ids(out)).toEqual(["a", "b", "c", "d"]);
    expect(depths(out)).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });

  test("depth-first: a subtree is fully emitted before the parent's next sibling", () => {
    // a -> (a1 -> a1x), a2 ; b
    const out = orderByHierarchy([
      n("a"),
      n("a1", "a"),
      n("a1x", "a1"),
      n("a2", "a"),
      n("b"),
    ]);
    expect(ids(out)).toEqual(["a", "a1", "a1x", "a2", "b"]);
    expect(depths(out)).toEqual({ a: 0, a1: 1, a1x: 2, a2: 1, b: 0 });
  });

  test("sibling order is stable (preserves input order)", () => {
    const out = orderByHierarchy([
      n("p"),
      n("c3", "p"),
      n("c1", "p"),
      n("c2", "p"),
    ]);
    expect(ids(out)).toEqual(["p", "c3", "c1", "c2"]);
  });
});

describe("orderByHierarchy  the dangerous edges", () => {
  test("orphan parent (parentId points to a missing id) is treated as a root", () => {
    const out = orderByHierarchy([n("x", "ghost")]);
    expect(ids(out)).toEqual(["x"]);
    expect(depths(out)).toEqual({ x: 0 });
  });

  test("self-cycle (a -> a) terminates; a appears once", () => {
    const out = orderByHierarchy([n("a", "a")]);
    expect(ids(out).sort()).toEqual(["a"]);
    expect(out).toHaveLength(1);
  });

  test("two-node cycle (a -> b -> a) terminates; each appears once", () => {
    const out = orderByHierarchy([n("a", "b"), n("b", "a")]);
    expect(ids(out).sort()).toEqual(["a", "b"]);
    expect(out).toHaveLength(2);
  });

  test("every input node appears exactly once  no drops, no duplicates", () => {
    const input = [
      n("a"), n("b", "a"), n("c", "b"), n("d"), n("e", "ghost"), n("f", "f"),
    ];
    const out = orderByHierarchy(input);
    expect(out).toHaveLength(input.length);
    expect(ids(out).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  test("large deep chain does not overflow the stack", () => {
    const input: HierNode[] = [];
    for (let i = 0; i < 10000; i++) {
      input.push(n(`node-${i}`, i === 0 ? null : `node-${i - 1}`));
    }
    expect(() => orderByHierarchy(input)).not.toThrow();
    expect(orderByHierarchy(input)).toHaveLength(10000);
  });
});

describe("depthOf  cycle-safe single-node depth", () => {
  const byId = new Map<string, HierNode>([
    ["a", n("a")],
    ["b", n("b", "a")],
    ["c", n("c", "b")],
    ["loopA", n("loopA", "loopB")],
    ["loopB", n("loopB", "loopA")],
  ]);

  test("root is depth 0", () => expect(depthOf("a", byId)).toBe(0));
  test("nested depth counts to nearest root", () => expect(depthOf("c", byId)).toBe(2));
  test("cycle returns a finite number, does not hang", () => {
    const d = depthOf("loopA", byId);
    expect(Number.isFinite(d)).toBe(true);
  });
});
