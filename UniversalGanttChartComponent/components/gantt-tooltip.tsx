import * as React from "react";
import { Task } from "gantt-task-react";
import { useGanttDisplayContext } from "./gantt-display-context";

/** Props gantt-task-react passes to a custom TooltipContent. */
export interface TooltipContentProps {
  task: Task;
  fontSize: string;
  fontFamily: string;
}

function TooltipParagraph({
  fontSize,
  children,
}: {
  fontSize: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className={"Gantt-Tooltip_Paragraph"} style={{ fontSize: fontSize }}>
      {children}
    </p>
  );
}

export function TooltipContent({
  task,
  fontSize,
  fontFamily,
}: TooltipContentProps): React.ReactElement {
  const display = useGanttDisplayContext();
  const { formatDateShort, includeTime } = display;
  const style = {
    fontSize,
    fontFamily,
  };
  return (
    <div className={"Gantt-Tooltip_Container"} style={style}>
      <p
        className={
          "Gantt-Tooltip_Paragraph Gantt-Tooltip_Paragraph__Information"
        }
        style={{ fontSize: fontSize }}
      >
        {task.name}
      </p>
      <TooltipParagraph fontSize={fontSize}>{`${display.startDisplayName}: ${formatDateShort(
        task.start,
        includeTime
      )}`}</TooltipParagraph>
      <TooltipParagraph fontSize={fontSize}>{`${display.endDisplayName}: ${formatDateShort(task.end, includeTime)}`}</TooltipParagraph>
      <TooltipParagraph fontSize={fontSize}>{`${display.durationDisplayName}: ${~~(
        (task.end.getTime() - task.start.getTime()) /
        (1000 * 60 * 60 * 24)
      )} ${display.metricDisplayName}`}</TooltipParagraph>
      <TooltipParagraph fontSize={fontSize}>
        {!!task.progress && `${display.progressDisplayName}: ${task.progress} %`}
      </TooltipParagraph>
    </div>
  );
}
