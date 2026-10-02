// list-layout.test.ts — indentation and expander rules for the list grid.

import { expanderSymbol, indentPx } from "./list-layout";

describe("indentPx", () => {
  test.each([
    [0, 0],
    [1, 16],
    [3, 48],
    [4, 64],
  ])("depth %p in a wide cell -> %p px", (depth, expected) => {
    expect(indentPx(depth, "400px")).toBe(expected);
  });

  test("capped at half a px cell, rounded down", () => {
    expect(indentPx(4, "155px")).toBe(64); // under the cap (77)
    expect(indentPx(5, "155px")).toBe(77); // 80 capped
    expect(indentPx(50, "155px")).toBe(77);
    expect(indentPx(10, "100.5px")).toBe(50);
    expect(indentPx(10, " 200px ")).toBe(100);
  });

  test.each(["", "155", "155em", "px", "auto", "-10px"])(
    "a non-px width %p falls back to the 128px cap",
    (rowWidth) => {
      expect(indentPx(7, rowWidth)).toBe(112);
      expect(indentPx(8, rowWidth)).toBe(128);
      expect(indentPx(20, rowWidth)).toBe(128);
    }
  );

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("depth %p gives 0", (depth) => {
    expect(indentPx(depth, "400px")).toBe(0);
  });
});

describe("expanderSymbol", () => {
  test.each([
    [true, false, "▼"],
    [true, true, "▶"],
    [false, false, ""],
    [false, true, ""],
  ])("hasChildren=%p collapsed=%p -> %p", (hasChildren, collapsed, expected) => {
    expect(expanderSymbol(hasChildren, collapsed)).toBe(expected);
  });
});
