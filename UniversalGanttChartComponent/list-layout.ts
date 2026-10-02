// list-layout.ts — pure layout rules for the hierarchy in the left list grid
// (fork customization #1). No React, no Gantt types.

/** Indentation per tree level. */
export const INDENT_PER_LEVEL_PX = 16;

/**
 * Indentation cap when the name cell width is not a px value (List Cell
 * Width not set): 8 levels.
 */
export const INDENT_FALLBACK_CAP_PX = 128;

/** A cell width such as "155px" in px, or undefined if it is not one. */
function parsePx(width: string): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(width);
  return match ? Number(match[1]) : undefined;
}

/**
 * Width of the indentation spacer before a row's name: 16px per level,
 * capped at half the name cell so deep rows still show some text and the
 * expander stays visible. Falls back to a 128px cap when rowWidth is not a
 * px width. Depth 0, negative or non-finite depths give 0.
 */
export function indentPx(depth: number, rowWidth: string): number {
  if (!Number.isFinite(depth) || depth <= 0) {
    return 0;
  }
  const cellPx = parsePx(rowWidth);
  const cap = cellPx === undefined ? INDENT_FALLBACK_CAP_PX : Math.floor(cellPx / 2);
  return Math.min(depth * INDENT_PER_LEVEL_PX, cap);
}

/** The expander glyph: ▼ expanded, ▶ collapsed, nothing without children. */
export function expanderSymbol(hasChildren: boolean, collapsed: boolean): string {
  if (!hasChildren) {
    return "";
  }
  return collapsed ? "▶" : "▼";
}
