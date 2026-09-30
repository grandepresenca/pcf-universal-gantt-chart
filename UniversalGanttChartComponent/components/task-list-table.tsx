import * as React from "react";
import { Task } from "gantt-task-react";
import { useGanttDisplayContext } from "./gantt-display-context";

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
  onExpanderClick: (task: Task) => void;
}

function getExpanderSymbol(hideChildren: boolean | undefined): string {
  if (hideChildren === false) {
    return "▼";
  }
  if (hideChildren === true) {
    return "▶";
  }
  return "";
}

function ExpanderToggle({
  task,
  onExpanderClick,
}: {
  task: Task;
  onExpanderClick: (task: Task) => void;
}): React.ReactElement {
  const expanderSymbol = getExpanderSymbol(task.hideChildren);
  return (
    <div
      className={
        expanderSymbol
          ? "Gantt-Task-List_Cell__Expander"
          : "Gantt-Task-List_Cell__Empty-Expander"
      }
      onClick={(e) => {
        onExpanderClick(task);
        e.stopPropagation();
      }}
    >
      {expanderSymbol}
    </div>
  );
}

function NameCell({
  task,
  rowWidth,
  onExpanderClick,
}: {
  task: Task;
  rowWidth: string;
  onExpanderClick: (task: Task) => void;
}): React.ReactElement {
  const { onOpenRecord } = useGanttDisplayContext();
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
        <ExpanderToggle task={task} onExpanderClick={onExpanderClick} />
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

function TaskListRow({
  task,
  rowHeight,
  rowWidth,
  isSelected,
  setSelectedTask,
  onExpanderClick,
}: {
  task: Task;
  rowHeight: number;
  rowWidth: string;
  isSelected: boolean;
  setSelectedTask: (taskId: string) => void;
  onExpanderClick: (task: Task) => void;
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
      <NameCell task={task} rowWidth={rowWidth} onExpanderClick={onExpanderClick} />
      <DateCell rowWidth={rowWidth} text={formatDateShort(task.start, includeTime)} />
      <DateCell rowWidth={rowWidth} text={formatDateShort(task.end, includeTime)} />
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
  onExpanderClick,
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
          onExpanderClick={onExpanderClick}
        />
      ))}
    </div>
  );
}
