import * as React from "react";

/** Where one task sits in the tree (fork customization #1). */
export interface HierarchyRowInfo {
  /** 0 for roots. */
  readonly depth: number;
  /** Whether the task has children among the loaded records (drives the expander). */
  readonly hasChildren: boolean;
}

/**
 * The tree position of each task and which tasks are collapsed, for the list
 * table's indentation and expander.
 *
 * gantt-task-react blanks task.hideChildren on every non-project row, so
 * tree state cannot travel on Task; it arrives through this context instead.
 */
export interface HierarchyContextValue {
  /** Task id -> its place in the tree. */
  readonly rows: ReadonlyMap<string, HierarchyRowInfo>;
  /** Ids of collapsed tasks (their subtree is hidden). */
  readonly collapsed: ReadonlySet<string>;
}

export const HierarchyContext =
  React.createContext<HierarchyContextValue | null>(null);
HierarchyContext.displayName = "HierarchyContext";

/** Reads the hierarchy context; throws if rendered outside its provider. */
export function useHierarchyContext(): HierarchyContextValue {
  const value = React.useContext(HierarchyContext);
  if (value === null) {
    throw new Error(
      "HierarchyContext is missing: TaskListTable must render inside HierarchyContext.Provider (UniversalGantt)."
    );
  }
  return value;
}
