// hierarchy-helpers.test.ts — the helpers around the tree contract
// (hierarchy.test.ts): parent-id reading/normalizing (B′), sibling sort by
// start, expander rows, collapse filtering, cycle reporting.

import {
  HierNode,
  HierarchyRow,
  buildRows,
  findCycleIds,
  indexRecordIds,
  normalizeId,
  orderByHierarchy,
  readParentId,
  resolveParentRecordId,
  sortByStart,
  toggleCollapsed,
  visibleRows,
} from "./hierarchy";

const n = (id: string, parentId: string | null = null): HierNode => ({ id, parentId });
const rowIds = (rows: readonly { node: HierNode }[]): string[] => rows.map((r) => r.node.id);
const rowsOf = (nodes: HierNode[]): HierarchyRow<HierNode>[] => buildRows(orderByHierarchy(nodes));

const GUID = "6F9619FF-8B86-D011-B42D-00CF4FC964FF";
const guid = GUID.toLowerCase();

describe("normalizeId", () => {
  test.each([
    [guid, guid],
    [GUID, guid],
    [`{${GUID}}`, guid],
    [`  {${GUID}}  `, guid],
    [`{ ${GUID} }`, guid],
  ])("%p -> %p", (input, expected) => {
    expect(normalizeId(input)).toBe(expected);
  });

  test("record id and lookup guid in different formats normalize equal", () => {
    expect(normalizeId(`{${GUID}}`)).toBe(normalizeId(guid));
  });

  test("an unbalanced brace is kept (only a surrounding pair is removed)", () => {
    expect(normalizeId("{abc")).toBe("{abc");
    expect(normalizeId("abc}")).toBe("abc}");
  });

  test("empty and whitespace normalize to empty", () => {
    expect(normalizeId("")).toBe("");
    expect(normalizeId("   ")).toBe("");
    expect(normalizeId("{}")).toBe("");
  });

  test("a lone brace is kept (one char cannot be a surrounding pair)", () => {
    expect(normalizeId("{")).toBe("{");
    expect(normalizeId("}")).toBe("}");
  });

  test("only one surrounding pair is removed", () => {
    expect(normalizeId("{{ABC}}")).toBe("{abc}");
  });

  test("inner braces are kept once the outer pair is removed", () => {
    expect(normalizeId("{a}b}")).toBe("a}b");
  });
});

describe("readParentId — accepted lookup shapes", () => {
  test("an EntityReference-like value with id.guid", () => {
    expect(readParentId({ id: { guid: `{${GUID}}` }, name: "Parent", etn: "task" })).toBe(guid);
  });

  test("an id given as a plain string inside the lookup", () => {
    expect(readParentId({ id: GUID })).toBe(guid);
  });

  test("the result matches a normalized record id", () => {
    expect(readParentId({ id: { guid: GUID } })).toBe(normalizeId(`{${guid}}`));
  });
});

describe("readParentId — anything else means no parent, never a crash", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a raw string value (harness mock)", "val"],
    ["a guid string as the value itself (strict)", GUID],
    ["a number", 42],
    ["a boolean", true],
    ["an empty object", {}],
    ["id is null", { id: null }],
    ["id is a number", { id: 7 }],
    ["id object without guid", { id: {} }],
    ["guid is not a string", { id: { guid: 123 } }],
    ["blank guid", { id: { guid: "   " } }],
    ["braces only", { id: { guid: "{}" } }],
    ["blank string id", { id: "" }],
  ])("%s -> undefined", (_label, value) => {
    expect(readParentId(value)).toBeUndefined();
  });
});

describe("indexRecordIds", () => {
  test.each([`{${GUID}}`, GUID, guid, `  {${GUID}}  `])("%p is found by its normalized id", (recordId) => {
    expect(indexRecordIds([recordId]).get(guid)).toBe(recordId);
  });

  test("values keep the original record id, never the normalized form", () => {
    const map = indexRecordIds([`{${GUID}}`, "Other-ID"]);
    expect(Array.from(map.entries())).toEqual([
      [guid, `{${GUID}}`],
      ["other-id", "Other-ID"],
    ]);
  });

  test("first wins when two ids normalize the same, in either order", () => {
    expect(indexRecordIds([GUID, `{${guid}}`]).get(guid)).toBe(GUID);
    expect(indexRecordIds([`{${guid}}`, GUID]).get(guid)).toBe(`{${guid}}`);
  });

  test("ids that normalize to empty are skipped; empty input gives an empty map", () => {
    expect(indexRecordIds(["", "  ", "{}"]).size).toBe(0);
    expect(indexRecordIds([]).size).toBe(0);
  });
});

describe("resolveParentRecordId", () => {
  const byNormalized = indexRecordIds([GUID, "other"]);

  test("a braced or differently cased lookup resolves to the original record id", () => {
    expect(resolveParentRecordId({ id: { guid: `{${guid}}` } }, byNormalized)).toBe(GUID);
    expect(resolveParentRecordId({ id: "OTHER" }, byNormalized)).toBe("other");
  });

  test("a parent outside the indexed records gives undefined", () => {
    expect(resolveParentRecordId({ id: { guid: "missing" } }, byNormalized)).toBeUndefined();
  });

  test.each([
    ["null", null],
    ["a lookup without a guid", { id: {} }],
  ])("%s gives undefined", (_label, value) => {
    expect(resolveParentRecordId(value, byNormalized)).toBeUndefined();
  });

  test("strict: a plain-string value is rejected even when that id IS in the view", () => {
    const withMatches = indexRecordIds(["val", GUID]);
    // The same ids resolve when they arrive as lookups, so only strictness rejects them below.
    expect(resolveParentRecordId({ id: "val" }, withMatches)).toBe("val");
    expect(resolveParentRecordId({ id: { guid: GUID } }, withMatches)).toBe(GUID);
    expect(resolveParentRecordId("val", withMatches)).toBeUndefined();
    expect(resolveParentRecordId(GUID, withMatches)).toBeUndefined();
  });
});

describe("sortByStart", () => {
  type Item = { id: string; start: Date };
  const item = (id: string, iso: string): Item => ({ id, start: new Date(iso) });
  const sort = (items: Item[]): string[] => sortByStart(items, (i) => i.start).map((i) => i.id);

  test("earliest start first", () => {
    expect(sort([item("c", "2026-03-01"), item("a", "2026-01-01"), item("b", "2026-02-01")])).toEqual(["a", "b", "c"]);
  });

  test("equal starts keep input (view) order", () => {
    expect(sort([item("x", "2026-01-01"), item("y", "2026-01-01"), item("z", "2026-01-01")])).toEqual(["x", "y", "z"]);
    expect(sort([item("z", "2026-01-01"), item("y", "2026-01-01"), item("x", "2026-01-01")])).toEqual(["z", "y", "x"]);
  });

  test("time of day counts", () => {
    expect(sort([item("late", "2026-01-01T15:00:00Z"), item("early", "2026-01-01T08:00:00Z")])).toEqual(["early", "late"]);
  });

  test("invalid dates go last, keeping their input order", () => {
    expect(sort([item("bad1", "nope"), item("ok", "2026-01-01"), item("bad2", "nope")])).toEqual(["ok", "bad1", "bad2"]);
  });

  test("does not mutate the input; empty input gives empty output", () => {
    const input = [item("b", "2026-02-01"), item("a", "2026-01-01")];
    sort(input);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
    expect(sort([])).toEqual([]);
  });
});

describe("sortByStart layered before orderByHierarchy", () => {
  type Dated = HierNode & { start: Date };
  const d = (id: string, parentId: string | null, iso: string): Dated => ({ id, parentId, start: new Date(iso) });

  test("siblings at every level (roots included) come out by start; parents before children", () => {
    const input = [
      d("p2", null, "2026-05-01"),
      d("p1", null, "2026-01-01"),
      d("p1-late", "p1", "2026-03-01"),
      d("p1-early", "p1", "2026-02-01"),
      d("p1-early-b", "p1-early", "2026-02-20"),
      d("p1-early-a", "p1-early", "2026-02-10"),
    ];
    const out = orderByHierarchy(sortByStart(input, (x) => x.start));
    expect(rowIds(out)).toEqual(["p1", "p1-early", "p1-early-a", "p1-early-b", "p1-late", "p2"]);
  });

  test("a child that starts before its parent still comes after it", () => {
    const out = orderByHierarchy(sortByStart([d("p", null, "2026-02-01"), d("c", "p", "2026-01-01")], (x) => x.start));
    expect(rowIds(out)).toEqual(["p", "c"]);
  });
});

describe("buildRows", () => {
  test("hasChildren is true exactly for nodes with a child in the set", () => {
    const rows = rowsOf([n("a"), n("a1", "a"), n("a1x", "a1"), n("a2", "a"), n("b")]);
    expect(rows.map((r) => [r.node.id, r.depth, r.hasChildren])).toEqual([
      ["a", 0, true],
      ["a1", 1, true],
      ["a1x", 2, false],
      ["a2", 1, false],
      ["b", 0, false],
    ]);
  });

  test("the last row and a single node have no children; empty input gives no rows", () => {
    expect(rowsOf([n("only")])[0].hasChildren).toBe(false);
    expect(buildRows([])).toEqual([]);
  });

  test("a parent whose children were not loaded has no children (no expander)", () => {
    expect(rowsOf([n("p"), n("q")]).map((r) => r.hasChildren)).toEqual([false, false]);
  });

  test("a cycle entry has children, the last cycle member does not", () => {
    const rows = rowsOf([n("a", "b"), n("b", "a")]);
    expect(rows.map((r) => [r.node.id, r.hasChildren])).toEqual([["a", true], ["b", false]]);
  });
});

describe("visibleRows", () => {
  // a -> (a1 -> (a1x -> a1xx)), a2 ; b -> b1
  const ROWS = rowsOf([
    n("a"), n("a1", "a"), n("a1x", "a1"), n("a1xx", "a1x"), n("a2", "a"), n("b"), n("b1", "b"),
  ]);
  const visible = (collapsed: string[]): string[] => rowIds(visibleRows(ROWS, new Set(collapsed)));

  test("nothing collapsed returns the same rows (same array)", () => {
    expect(visibleRows(ROWS, new Set())).toBe(ROWS);
  });

  test("collapsing a root hides its whole subtree, at every depth", () => {
    expect(visible(["a"])).toEqual(["a", "b", "b1"]);
  });

  test("collapsing a middle node hides only its own subtree", () => {
    expect(visible(["a1"])).toEqual(["a", "a1", "a2", "b", "b1"]);
  });

  test("a collapsed node inside a collapsed subtree changes nothing more", () => {
    expect(visible(["a", "a1x"])).toEqual(["a", "b", "b1"]);
  });

  test("expanding the outer node keeps the inner collapse", () => {
    expect(visible(["a1x"])).toEqual(["a", "a1", "a1x", "a2", "b", "b1"]);
  });

  test("several collapsed subtrees", () => {
    expect(visible(["a1", "b"])).toEqual(["a", "a1", "a2", "b"]);
  });

  test("unknown ids and childless nodes in the set change nothing", () => {
    expect(visible(["ghost", "a2", "b1"])).toEqual(rowIds(ROWS));
  });
});

describe("findCycleIds", () => {
  test("no cycles in a tree, with orphans, or in empty input", () => {
    expect(findCycleIds([n("a"), n("b", "a"), n("c", "b"), n("o", "ghost")])).toEqual([]);
    expect(findCycleIds([])).toEqual([]);
  });

  test("an orphan is never a loop, wherever it sits in the input", () => {
    expect(findCycleIds([n("o", "ghost")])).toEqual([]);
    expect(findCycleIds([n("a", "o"), n("o", "ghost")])).toEqual([]);
  });

  test("a self-cycle", () => {
    expect(findCycleIds([n("r"), n("a", "a")])).toEqual(["a"]);
  });

  test("a two-node and a three-node cycle, in input order", () => {
    expect(findCycleIds([n("b", "a"), n("a", "b")])).toEqual(["b", "a"]);
    expect(findCycleIds([n("x", "z"), n("y", "x"), n("z", "y")])).toEqual(["x", "y", "z"]);
  });

  test("nodes hanging below a cycle are not on it", () => {
    expect(findCycleIds([n("c", "b"), n("d", "c"), n("a", "b"), n("b", "a")])).toEqual(["a", "b"]);
  });

  test("two separate cycles next to a normal tree", () => {
    const input = [n("r"), n("r1", "r"), n("p", "q"), n("q", "p"), n("s", "s")];
    expect(findCycleIds(input)).toEqual(["p", "q", "s"]);
  });

  test("a long chain ending in a cycle terminates (iterative)", () => {
    const input: HierNode[] = [n("loop", "end")];
    for (let i = 0; i < 10000; i++) {
      input.push(n(`c${i}`, i === 0 ? "loop" : `c${i - 1}`));
    }
    input.push(n("end", "c9999"));
    expect(findCycleIds(input)).toHaveLength(10002);
  });

  test("a duplicate id on a cycle is reported once", () => {
    expect(findCycleIds([n("a", "b"), n("b", "a"), n("a", "b")])).toEqual(["a", "b"]);
  });
});

describe("toggleCollapsed", () => {
  test("adds an absent id and removes a present one", () => {
    expect(Array.from(toggleCollapsed(new Set(["a"]), "b"))).toEqual(["a", "b"]);
    expect(Array.from(toggleCollapsed(new Set(["a", "b"]), "a"))).toEqual(["b"]);
  });

  test("returns a NEW set and leaves the input untouched (React must see a change)", () => {
    const before: ReadonlySet<string> = new Set(["a"]);
    const after = toggleCollapsed(before, "a");
    expect(after).not.toBe(before);
    expect(Array.from(before)).toEqual(["a"]);
  });

  test("toggling twice restores the original contents", () => {
    expect(Array.from(toggleCollapsed(toggleCollapsed(new Set(["x"]), "y"), "y"))).toEqual(["x"]);
  });
});
