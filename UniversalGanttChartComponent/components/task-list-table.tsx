import * as React from "react";
import { Task } from "gantt-task-react";
import { useGanttDisplayContext } from "./gantt-display-context";
import { useExtraColumnsContext } from "./extra-columns-context";
import { HierarchyRowInfo, useHierarchyContext } from "./hierarchy-context";
import { ExtraColumnDef, isRightAlignedKind } from "../columns";
import { expanderSymbol, indentPx } from "../list-layout";

/** Props gantt-task-react passes to a custom TaskListTable. */
export interface TaskListTableProps {
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  tasks: Task[];
  selectedTaskId: string;
  setSelectedTask: (taskId: string) => void;
  /** Passed by the library; unused: the tree's expander state is ours (HierarchyContext). */
  onExpanderClick: (task: Task) => void;
}

/** A task missing from the tree (should not happen) renders as a childless root. */
const NOT_IN_TREE: HierarchyRowInfo = { depth: 0, hasChildren: false };

/**
 * The ▼/▶ toggle for rows with loaded children; an empty spacer otherwise.
 * Click, Enter or Space toggles without selecting the row (the row's own
 * click selects). Exported for tests: it takes plain props, no context.
 */
export function ExpanderToggle({
  hasChildren,
  collapsed,
  onToggle,
}: {
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const glyph = expanderSymbol(hasChildren, collapsed);
  if (!glyph) {
    return <div className="Gantt-Task-List_Cell__Empty-Expander"></div>;
  }
  return (
    <div
      className="Gantt-Task-List_Cell__Expander"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      {glyph}
    </div>
  );
}

/** Indentation for the row's depth: a fixed-width spacer, not cell padding. */
function IndentSpacer({ width }: { width: number }): React.ReactElement | null {
  if (width === 0) {
    return null;
  }
  return (
    <span
      className="Gantt-Task-List_Indent"
      style={{ width, minWidth: width, flexShrink: 0 }}
      aria-hidden="true"
    />
  );
}

function NameCell({
  task,
  rowWidth,
}: {
  task: Task;
  rowWidth: string;
}): React.ReactElement {
  const { onOpenRecord } = useGanttDisplayContext();
  const { rows, collapsed, toggle } = useHierarchyContext();
  const row = rows.get(task.id) ?? NOT_IN_TREE;
  return (
    <div
      className="Gantt-Task-List_Cell"
      style={{
        minWidth: rowWidth,
        maxWidth: rowWidth,
      }}
      title={task.name}
    >
      <div className="Gantt-Task-List_Name-Container">
        <IndentSpacer width={indentPx(row.depth, rowWidth)} />
        <ExpanderToggle
          hasChildren={row.hasChildren}
          collapsed={collapsed.has(task.id)}
          onToggle={() => toggle(task.id)}
        />
        <div
          className="Gantt-Task-List_Cell__Link"
          onClick={() => onOpenRecord(task)}
        >
          {task.name}
        </div>
      </div>
    </div>
  );
}

function DateCell({
  rowWidth,
  text,
}: {
  rowWidth: string;
  text: string;
}): React.ReactElement {
  return (
    <div
      className="Gantt-Task-List_Cell"
      style={{
        minWidth: rowWidth,
        maxWidth: rowWidth,
      }}
      title={text}
    >
      &nbsp;{text}
    </div>
  );
}

function ExtraCell({
  column,
  text,
}: {
  column: ExtraColumnDef;
  text: string;
}): React.ReactElement {
  const width = `${column.widthPx}px`;
  const rightAligned = isRightAlignedKind(column.kind);
  // The non-breaking space pads the aligned edge without changing the width.
  return (
    <div
      className={
        rightAligned
          ? "Gantt-Task-List_Cell Gantt-Task-List_Cell__Right"
          : "Gantt-Task-List_Cell"
      }
      style={{ minWidth: width, maxWidth: width }}
      title={text}
    >
      {rightAligned ? <>{text}&nbsp;</> : <>&nbsp;{text}</>}
    </div>
  );
}

/** Cells for the configured extra columns, after End. */
function ExtraCells({ taskId }: { taskId: string }): React.ReactElement {
  const { columns, cellTexts } = useExtraColumnsContext();
  const texts = cellTexts.get(taskId);
  return (
    <>
      {columns.map((column, i) => (
        <ExtraCell key={column.name} column={column} text={texts?.[i] ?? ""} />
      ))}
    </>
  );
}

function TaskListRow({
  task,
  rowHeight,
  rowWidth,
  isSelected,
  setSelectedTask,
}: {
  task: Task;
  rowHeight: number;
  rowWidth: string;
  isSelected: boolean;
  setSelectedTask: (taskId: string) => void;
}): React.ReactElement {
  const { includeTime, formatDateShort } = useGanttDisplayContext();
  return (
    <div
      className="Gantt-Task-List_Row"
      style={{ height: rowHeight }}
      onClick={() => setSelectedTask(isSelected ? "" : task.id)}
    >
      <div className="Gantt-Task-List_Cell">
        <div
          className={
            isSelected
              ? "Gantt-Task-List-Checkbox__Checked"
              : "Gantt-Task-List-Checkbox"
          }
        ></div>
      </div>
      <NameCell task={task} rowWidth={rowWidth} />
      <DateCell rowWidth={rowWidth} text={formatDateShort(task.start, includeTime)} />
      <DateCell rowWidth={rowWidth} text={formatDateShort(task.end, includeTime)} />
      <ExtraCells taskId={task.id} />
    </div>
  );
}

export function TaskListTable({
  rowHeight,
  rowWidth,
  tasks,
  fontFamily,
  fontSize,
  selectedTaskId,
  setSelectedTask,
}: TaskListTableProps): React.ReactElement {
  return (
    <div
      className="Gantt-Task-List_Wrapper"
      style={{
        fontFamily: fontFamily,
        fontSize: fontSize,
      }}
    >
      {tasks.map((t) => (
        <TaskListRow
          key={`${t.id}row`}
          task={t}
          rowHeight={rowHeight}
          rowWidth={rowWidth}
          isSelected={selectedTaskId === t.id}
          setSelectedTask={setSelectedTask}
        />
      ))}
    </div>
  );
}
