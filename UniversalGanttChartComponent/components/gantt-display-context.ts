import * as React from "react";
import { Task } from "gantt-task-react";

/**
 * Display settings shared by the list header, list table and tooltip.
 *
 * gantt-task-react only passes its own fixed props to TaskListHeader,
 * TaskListTable and TooltipContent. Everything else they need arrives through
 * this context, so those components can live at module scope. Before, they were
 * built by factories on every render, which gave them a new component type
 * each time and remounted the whole list and tooltip.
 */
export interface GanttDisplayContextValue {
  readonly recordDisplayName: string;
  readonly startDisplayName: string;
  readonly endDisplayName: string;
  readonly progressDisplayName: string;
  readonly durationDisplayName: string;
  readonly metricDisplayName: string;
  readonly includeTime: boolean;
  readonly formatDateShort: (value: Date, includeTime?: boolean) => string;
  readonly onOpenRecord: (task: Task) => void;
}

export const GanttDisplayContext =
  React.createContext<GanttDisplayContextValue | null>(null);
GanttDisplayContext.displayName = "GanttDisplayContext";

/** Reads the display context; throws if rendered outside its provider. */
export function useGanttDisplayContext(): GanttDisplayContextValue {
  const value = React.useContext(GanttDisplayContext);
  if (value === null) {
    throw new Error(
      "GanttDisplayContext is missing: TaskListHeader, TaskListTable and TooltipContent must render inside GanttDisplayContext.Provider (UniversalGantt)."
    );
  }
  return value;
}
