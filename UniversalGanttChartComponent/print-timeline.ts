// print-timeline.ts — the time scale of the printed Gantt report. Pure: no
// React, no PCF, no Gantt types. Dates are handled in LOCAL time so month and
// year boundaries match what the user sees on screen.
//
// The print report does not reprint the on-screen chart: it draws its own
// timeline sized to the page width. A bar's horizontal position is the linear
// position of its dates inside the report's time range, as a percentage of the
// timeline column (x = (date - start) / (end - start)).

export type TickUnit = "month" | "quarter" | "year";

export interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

export interface Tick {
  readonly date: Date;
  /** Position in the timeline column, 0–100. */
  readonly xPct: number;
}

export interface PrintScale {
  readonly range: TimeRange;
  readonly unit: TickUnit;
  readonly ticks: readonly Tick[];
}

/** A dated item, as far as the scale cares. */
export interface Dated {
  readonly start: Date;
  readonly end: Date;
}

/** The narrowest visible bar, as a % of the timeline, so short tasks still show. */
export const MIN_BAR_PCT = 0.2;

const MONTHS_PER: Readonly<Record<TickUnit, number>> = { month: 1, quarter: 3, year: 12 };

const valid = (d: Date): boolean => !Number.isNaN(d.getTime());
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Months from a's month to b's month (calendar months, local time). */
function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Earliest valid start to latest valid end, or null when nothing has valid dates. */
export function dataRange(items: readonly Dated[]): TimeRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  items.forEach((item) => {
    [item.start, item.end].filter(valid).forEach((d) => {
      min = Math.min(min, d.getTime());
      max = Math.max(max, d.getTime());
    });
  });
  return min === Number.POSITIVE_INFINITY ? null : { start: new Date(min), end: new Date(max) };
}

/** Month ticks up to 18 months, quarters up to 5 years, years beyond. */
export function tickUnit(range: TimeRange): TickUnit {
  const months = monthsBetween(range.start, range.end) + 1;
  if (months <= 18) {
    return "month";
  }
  return months <= 60 ? "quarter" : "year";
}

/**
 * The range widened to whole units: start floored to the unit boundary at or
 * before it (month / quarter / year start), end raised to the first boundary
 * strictly after it. So the first tick is at 0% and the last bar never touches
 * the right edge.
 */
export function alignRange(range: TimeRange, unit: TickUnit): TimeRange {
  const step = MONTHS_PER[unit];
  const s = range.start;
  const startMonth = Math.floor(s.getMonth() / step) * step;
  const start = new Date(s.getFullYear(), startMonth, 1);
  const e = range.end;
  const endMonth = Math.floor(e.getMonth() / step) * step + step;
  return { start, end: new Date(e.getFullYear(), endMonth, 1) };
}

/** A date's position in the range, as a % (clamped to 0–100). */
export function xPct(date: Date, range: TimeRange): number {
  const span = range.end.getTime() - range.start.getTime();
  if (span <= 0) {
    return 0;
  }
  const pct = ((date.getTime() - range.start.getTime()) / span) * 100;
  return round3(Math.min(100, Math.max(0, pct)));
}

/** One tick per unit boundary from the (aligned) start, before the end. */
export function ticks(range: TimeRange, unit: TickUnit): Tick[] {
  const out: Tick[] = [];
  const step = MONTHS_PER[unit];
  for (let i = 0; ; i += step) {
    const date = new Date(range.start.getFullYear(), range.start.getMonth() + i, 1);
    if (date.getTime() >= range.end.getTime()) {
      return out;
    }
    out.push({ date, xPct: xPct(date, range) });
  }
}

/** The report's scale for these items, or null when none has valid dates. */
export function printScale(items: readonly Dated[]): PrintScale | null {
  const data = dataRange(items);
  if (data === null) {
    return null;
  }
  const unit = tickUnit(data);
  const range = alignRange(data, unit);
  return { range, unit, ticks: ticks(range, unit) };
}

export type BarGeometry =
  | { readonly kind: "bar"; readonly leftPct: number; readonly widthPct: number }
  | { readonly kind: "milestone"; readonly leftPct: number }
  | { readonly kind: "none" };

/**
 * Where an item's bar goes: left = its start's position, width = end − start
 * (at least MIN_BAR_PCT). Milestones, and items whose end is not after their
 * start, are a single point. Items with invalid dates get no bar.
 */
export function barGeometry(item: Dated, range: TimeRange, isMilestone: boolean): BarGeometry {
  if (!valid(item.start) || !valid(item.end)) {
    return { kind: "none" };
  }
  const left = xPct(item.start, range);
  if (isMilestone || item.end.getTime() <= item.start.getTime()) {
    return { kind: "milestone", leftPct: left };
  }
  const width = Math.max(MIN_BAR_PCT, xPct(item.end, range) - left);
  return { kind: "bar", leftPct: left, widthPct: round3(Math.min(width, 100 - left)) };
}

/** The label under a tick: "Jan 26" / "Q1 2026" / "2026". */
export function tickLabel(date: Date, unit: TickUnit, locale: string): string {
  if (unit === "year") {
    return String(date.getFullYear());
  }
  if (unit === "quarter") {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  }
  return date.toLocaleDateString(locale || undefined, { month: "short", year: "2-digit" });
}
