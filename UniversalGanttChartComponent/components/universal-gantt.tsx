import * as React from "react";
import {
  Gantt,
  Task,
  EventOption,
  StylingOption,
  ViewMode,
  DisplayOption,
} from "gantt-task-react";
import { TaskListHeader } from "./task-list-header";
import { ViewSwitcher } from "./view-switcher";
import { IInputs } from "../generated/ManifestTypes";
import { TooltipContent } from "./gantt-tooltip";
import { TaskListTable } from "./task-list-table";
import {
  GanttDisplayContext,
  GanttDisplayContextValue,
} from "./gantt-display-context";
import {
  ExtraColumnsContext,
  ExtraColumnsContextValue,
} from "./extra-columns-context";
import { ExtraColumnsNotice } from "./extra-columns-notice";
import {
  HierarchyContext,
  HierarchyContextValue,
  HierarchyRowInfo,
} from "./hierarchy-context";
import { isErrorDialogOptions } from "../helper";
import { ExtraColumnDef } from "../columns";
import { HierarchyRow } from "../hierarchy";
import { TaskNode } from "../task-mapping";

export type UniversalGanttProps = {
  context: ComponentFramework.Context<IInputs>;
  /** Tasks in display order with depth and hasChildren (fork customization #1). */
  rows: readonly HierarchyRow<TaskNode>[];
  locale: string;
  recordDisplayName: string;
  startDisplayName: string;
  endDisplayName: string;
  progressDisplayName: string;
  startFieldName: string;
  endFieldName: string;
  progressFieldName: string;
  includeTime: boolean;
  isProgressing: boolean;
  crmUserTimeOffset: number;
  fontSize: string;
  ganttHeight?: number;
  rowHeight: number;
  headerHeight: number;
  listCellWidth: string;
  columnWidthQuarter: number;
  columnWidthHalf: number;
  columnWidthDay: number;
  columnWidthWeek: number;
  columnWidthMonth: number;
  onViewChange: (viewMode: ViewMode) => void;
  /** Validated extra list columns (fork customization #2). */
  extraColumns: readonly ExtraColumnDef[];
  /** Record id -> extra column texts, in extraColumns order. */
  extraCellTexts: ReadonlyMap<string, readonly string[]>;
  /** Maker-facing extra-columns configuration issues; empty when fine. */
  extraColumnMessages: readonly string[];
  /** Remounts <Gantt> when the extra column set changes (list width). */
  extraColumnsKey: string;
} & EventOption &
  DisplayOption;

/** Builds the ExtraColumnsContext value; recomputed only when an input changes. */
function useExtraColumnsValue(
  columns: readonly ExtraColumnDef[],
  cellTexts: ReadonlyMap<string, readonly string[]>
): ExtraColumnsContextValue {
  return React.useMemo<ExtraColumnsContextValue>(
    () => ({ columns, cellTexts }),
    [columns, cellTexts]
  );
}

/** Nothing collapsed yet: everything is expanded. */
const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * The tree for this render (ADR-010): the tasks for <Gantt> in tree order,
 * and the HierarchyContext value for the list's indentation and expander.
 * Recomputed only when the rows change. <Gantt> gets no onExpanderClick: the
 * library's own collapse (project-only, recursive getChildren) must never run.
 */
function useTree(rows: readonly HierarchyRow<TaskNode>[]): {
  tasks: Task[];
  hierarchyValue: HierarchyContextValue;
} {
  return React.useMemo(
    () => ({
      tasks: rows.map((row) => row.node.task),
      hierarchyValue: {
        rows: new Map<string, HierarchyRowInfo>(
          rows.map((row) => [row.node.id, { depth: row.depth, hasChildren: row.hasChildren }])
        ),
        collapsed: NONE_COLLAPSED,
      },
    }),
    [rows]
  );
}

/** Builds the GanttDisplayContext value; recomputed only when an input changes. */
function useDisplayContextValue(
  props: UniversalGanttProps,
  formatDateShort: (value: Date, includeTime?: boolean) => string,
  onOpenRecord: (task: Task) => void
): GanttDisplayContextValue {
  const { recordDisplayName, startDisplayName, endDisplayName } = props;
  const { progressDisplayName, includeTime, context } = props;
  const durationDisplayName = context.resources.getString("Duration");
  const metricDisplayName = context.resources.getString("Duration_Metric");
  return React.useMemo<GanttDisplayContextValue>(
    () => ({
      recordDisplayName,
      startDisplayName,
      endDisplayName,
      progressDisplayName,
      durationDisplayName,
      metricDisplayName,
      includeTime,
      formatDateShort,
      onOpenRecord,
    }),
    [
      recordDisplayName,
      startDisplayName,
      endDisplayName,
      progressDisplayName,
      durationDisplayName,
      metricDisplayName,
      includeTime,
      formatDateShort,
      onOpenRecord,
    ]
  );
}

export const UniversalGantt: React.FunctionComponent<UniversalGanttProps> = (
  props
) => {
  // The rows and extra-columns props are for this component only; keep them
  // out of the spread into <Gantt>.
  const {
    rows,
    extraColumns,
    extraCellTexts,
    extraColumnMessages,
    extraColumnsKey,
    ...ganttProps
  } = props;
  const [view, setView] = React.useState(props.viewMode);
  const { context } = props;
  // Events
  const handleDateChange = async (task: Task) => {
    const recordRef =
      context.parameters.entityDataSet.records[task.id].getNamedReference();
    const entityName =
      recordRef.etn || ((recordRef as { logicalName?: string }).logicalName as string);
    let resultState = true;
    try {
      await context.webAPI.updateRecord(entityName, task.id, {
        [props.endFieldName]: new Date(
          task.end.getTime() - props.crmUserTimeOffset * 60000
        ),
        [props.startFieldName]: new Date(
          task.start.getTime() - props.crmUserTimeOffset * 60000
        ),
      });
    } catch (e) {
      if (isErrorDialogOptions(e)) {
        context.navigation.openErrorDialog(e);
      } else {
        console.error(e);
      }
      resultState = false;
    }
    context.parameters.entityDataSet.refresh();
    return resultState;
  };

  const handleProgressChange = async (task: Task) => {
    const recordRef =
      context.parameters.entityDataSet.records[task.id].getNamedReference();
    const entityName =
      recordRef.etn || ((recordRef as { logicalName?: string }).logicalName as string);
    let resultState = true;
    try {
      await context.webAPI.updateRecord(entityName, task.id, {
        [props.progressFieldName]: task.progress,
      });
    } catch (e) {
      if (isErrorDialogOptions(e)) {
        context.navigation.openErrorDialog(e);
      } else {
        console.error(e);
      }
      resultState = false;
    }
    context.parameters.entityDataSet.refresh();
    return resultState;
  };

  const handleOpenRecord = React.useCallback(
    async (task: Task) => {
      const recordRef =
        context.parameters.entityDataSet.records[task.id].getNamedReference();
      context.parameters.entityDataSet.openDatasetItem(recordRef);
    },
    [context]
  );

  const handleSelect = (task: Task, isSelected: boolean) => {
    if (isSelected) {
      context.parameters.entityDataSet.setSelectedRecordIds([task.id]);
    } else {
      context.parameters.entityDataSet.clearSelectedRecordIds();
    }
  };

  // Styling
  const formatDateShort = React.useCallback(
    (value: Date, includeTime?: boolean) => {
      return context.formatting.formatDateShort(value, includeTime);
    },
    [context]
  );

  const displayContext = useDisplayContextValue(
    props,
    formatDateShort,
    handleOpenRecord
  );
  const extraColumnsValue = useExtraColumnsValue(extraColumns, extraCellTexts);
  const { tasks, hierarchyValue } = useTree(rows);

  const options: StylingOption & EventOption = {
    fontSize: props.fontSize,
    fontFamily: "SegoeUI, Segoe UI",
    headerHeight: props.headerHeight,
    rowHeight: props.rowHeight,
    barCornerRadius: 0,
    listCellWidth: props.listCellWidth,
    TaskListHeader: TaskListHeader,
    TooltipContent: TooltipContent,
    TaskListTable: TaskListTable,
  };

  switch (view) {
    case ViewMode.Month:
      options.columnWidth = props.columnWidthMonth;
      break;
    case ViewMode.Week:
      options.columnWidth = props.columnWidthWeek;
      break;
    case ViewMode.Day:
      options.columnWidth = props.columnWidthDay;
      break;
    case ViewMode.HalfDay:
      options.columnWidth = props.columnWidthHalf;
      break;
    default:
      options.columnWidth = props.columnWidthQuarter;
  }

  if (props.isProgressing) {
    options.onProgressChange = handleProgressChange;
  }

  return (
    <div className="Gantt-Wrapper">
      <ViewSwitcher
        context={context}
        onViewChange={(viewMode) => {
          props.onViewChange(viewMode);
          setView(viewMode);
        }}
      />
      <ExtraColumnsNotice messages={extraColumnMessages} />
      <GanttDisplayContext.Provider value={displayContext}>
        <ExtraColumnsContext.Provider value={extraColumnsValue}>
          <HierarchyContext.Provider value={hierarchyValue}>
            <Gantt
              key={extraColumnsKey}
              {...ganttProps}
              {...options}
              tasks={tasks}
              viewMode={view}
              onDoubleClick={handleOpenRecord}
              onDateChange={handleDateChange}
              onSelect={handleSelect}
            />
          </HierarchyContext.Provider>
        </ExtraColumnsContext.Provider>
      </GanttDisplayContext.Provider>
    </div>
  );
};
