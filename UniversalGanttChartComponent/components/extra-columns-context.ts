import * as React from "react";
import { ExtraColumnDef } from "../columns";

/**
 * The configured extra list columns and their cell texts (fork customization
 * #2), for TaskListHeader and TaskListTable.
 *
 * Kept apart from GanttDisplayContext on purpose: cellTexts changes on every
 * data update, while the display context (read by the tooltip) is stable.
 */
export interface ExtraColumnsContextValue {
  readonly columns: readonly ExtraColumnDef[];
  /** Record id -> formatted texts, in column order. */
  readonly cellTexts: ReadonlyMap<string, readonly string[]>;
}

export const ExtraColumnsContext =
  React.createContext<ExtraColumnsContextValue | null>(null);
ExtraColumnsContext.displayName = "ExtraColumnsContext";

/** Reads the extra-columns context; throws if rendered outside its provider. */
export function useExtraColumnsContext(): ExtraColumnsContextValue {
  const value = React.useContext(ExtraColumnsContext);
  if (value === null) {
    throw new Error(
      "ExtraColumnsContext is missing: TaskListHeader and TaskListTable must render inside ExtraColumnsContext.Provider (UniversalGantt)."
    );
  }
  return value;
}
