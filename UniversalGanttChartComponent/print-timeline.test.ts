// print-timeline.test.ts — the printed timeline's scale and bar positions.
// Dates are built in local time (new Date(y, m, d)), like the module.

import { alignRange, barGeometry, dataRange, MIN_BAR_PCT, printScale, tickLabel, ticks, tickUnit, xPct } from "./print-timeline";

const d = (y: number, m: number, day = 1): Date => new Date(y, m - 1, day);
const item = (start: Date, end: Date) => ({ start, end });
const range = (start: Date, end: Date) => ({ start, end });

describe("dataRange", () => {
  test("earliest valid start to latest valid end", () => {
    const r = dataRange([item(d(2026, 3, 10), d(2026, 4, 2)), item(d(2026, 1, 5), d(2026, 2, 1)), item(d(2026, 2, 1), d(2026, 9, 30))]);
    expect(r).toEqual(range(d(2026, 1, 5), d(2026, 9, 30)));
  });

  test("invalid dates are ignored; nothing valid gives null", () => {
    expect(dataRange([item(new Date("x"), d(2026, 5, 1))])).toEqual(range(d(2026, 5, 1), d(2026, 5, 1)));
    expect(dataRange([item(new Date("x"), new Date("y"))])).toBeNull();
    expect(dataRange([])).toBeNull();
  });
});

describe("tickUnit", () => {
  test.each([
    [d(2026, 1, 1), d(2026, 1, 20), "month"],
    [d(2026, 1, 1), d(2027, 6, 30), "month"], // 18 months
    [d(2026, 1, 1), d(2027, 7, 1), "quarter"], // 19 months
    [d(2026, 1, 1), d(2030, 12, 31), "quarter"], // 60 months
    [d(2026, 1, 1), d(2031, 1, 1), "year"], // 61 months
  ])("%s .. %s -> %s", (start, end, unit) => {
    expect(tickUnit(range(start, end))).toBe(unit);
  });
});

describe("alignRange", () => {
  test("month: start floors to the 1st, end rises to the next month's 1st", () => {
    expect(alignRange(range(d(2026, 3, 17), d(2026, 5, 2)), "month")).toEqual(range(d(2026, 3, 1), d(2026, 6, 1)));
  });

  test("quarter and year boundaries", () => {
    expect(alignRange(range(d(2026, 5, 17), d(2026, 8, 2)), "quarter")).toEqual(range(d(2026, 4, 1), d(2026, 10, 1)));
    expect(alignRange(range(d(2026, 5, 17), d(2028, 2, 2)), "year")).toEqual(range(d(2026, 1, 1), d(2029, 1, 1)));
  });

  test("an end exactly on a boundary still gets room after it", () => {
    expect(alignRange(range(d(2026, 1, 1), d(2026, 3, 1)), "month").end).toEqual(d(2026, 4, 1));
  });
});

describe("xPct", () => {
  const r = range(new Date(2026, 0, 1, 0, 0), new Date(2026, 0, 1, 0, 100));
  test("linear position inside the range, rounded to 3 decimals", () => {
    expect(xPct(new Date(2026, 0, 1, 0, 25), r)).toBe(25);
    expect(xPct(new Date(2026, 0, 1, 0, 0, 20), r)).toBe(0.333);
  });

  test("clamped to 0–100; an empty range gives 0", () => {
    expect(xPct(new Date(2025, 0, 1), r)).toBe(0);
    expect(xPct(new Date(2027, 0, 1), r)).toBe(100);
    expect(xPct(d(2026, 1, 1), range(d(2026, 1, 1), d(2026, 1, 1)))).toBe(0);
  });
});

describe("ticks and printScale", () => {
  test("one tick per month boundary from the start, before the end", () => {
    const t = ticks(range(d(2026, 1, 1), d(2026, 5, 1)), "month");
    expect(t.map((x) => x.date)).toEqual([d(2026, 1, 1), d(2026, 2, 1), d(2026, 3, 1), d(2026, 4, 1)]);
    expect(t[0].xPct).toBe(0);
    expect(t[2].xPct).toBeCloseTo(49.17, 1);
  });

  test("quarter ticks step 3 months; year ticks step 12", () => {
    expect(ticks(range(d(2026, 1, 1), d(2027, 1, 1)), "quarter").map((x) => x.date.getMonth())).toEqual([0, 3, 6, 9]);
    expect(ticks(range(d(2026, 1, 1), d(2029, 1, 1)), "year").map((x) => x.date.getFullYear())).toEqual([2026, 2027, 2028]);
  });

  test("printScale aligns the data range to the chosen unit", () => {
    const s = printScale([item(d(2026, 3, 17), d(2026, 5, 2))]);
    expect(s?.unit).toBe("month");
    expect(s?.range).toEqual(range(d(2026, 3, 1), d(2026, 6, 1)));
    expect(s?.ticks).toHaveLength(3);
    expect(printScale([])).toBeNull();
  });
});

describe("barGeometry", () => {
  const r = range(new Date(2026, 0, 1, 0, 0), new Date(2026, 0, 1, 0, 100));
  const at = (min: number) => new Date(2026, 0, 1, 0, min);

  test("left = start position, width = end − start", () => {
    expect(barGeometry(item(at(10), at(40)), r, false)).toEqual({ kind: "bar", leftPct: 10, widthPct: 30 });
  });

  test("a very short task keeps a minimum visible width", () => {
    expect(barGeometry(item(at(10), new Date(2026, 0, 1, 0, 10, 1)), r, false)).toEqual({ kind: "bar", leftPct: 10, widthPct: MIN_BAR_PCT });
  });

  test("the minimum never pushes a bar past the right edge", () => {
    expect(barGeometry(item(new Date(2026, 0, 1, 0, 99, 59), at(100)), r, false)).toEqual({ kind: "bar", leftPct: 99.983, widthPct: 0.017 });
  });

  test("milestones, and end not after start, are a point", () => {
    expect(barGeometry(item(at(20), at(60)), r, true)).toEqual({ kind: "milestone", leftPct: 20 });
    expect(barGeometry(item(at(20), at(20)), r, false)).toEqual({ kind: "milestone", leftPct: 20 });
    expect(barGeometry(item(at(30), at(20)), r, false)).toEqual({ kind: "milestone", leftPct: 30 });
  });

  test("invalid dates draw nothing", () => {
    expect(barGeometry(item(new Date("x"), at(20)), r, false)).toEqual({ kind: "none" });
    expect(barGeometry(item(at(20), new Date("x")), r, false)).toEqual({ kind: "none" });
  });
});

describe("tickLabel", () => {
  test("month / quarter / year", () => {
    expect(tickLabel(d(2026, 3, 1), "month", "en-US")).toBe("Mar 26");
    expect(tickLabel(d(2026, 8, 1), "quarter", "en-US")).toBe("Q3 2026");
    expect(tickLabel(d(2026, 8, 1), "year", "en-US")).toBe("2026");
  });

  test("an empty locale falls back to the runtime default", () => {
    expect(tickLabel(d(2026, 3, 1), "month", "")).toBe(d(2026, 3, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }));
  });
});
