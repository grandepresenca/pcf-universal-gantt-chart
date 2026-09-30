import * as React from "react";
import { useGanttDisplayContext } from "./gantt-display-context";

/** Props gantt-task-react passes to a custom TaskListHeader. */
export interface TaskListHeaderProps {
  headerHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
}

function HeaderSeparator({
  headerHeight,
  marginTopRatio,
}: {
  headerHeight: number;
  marginTopRatio: number;
}): React.ReactElement {
  return (
    <div
      className="Gantt-Table_Header-Separator"
      style={{
        height: headerHeight * 0.5,
        marginTop: headerHeight * marginTopRatio,
      }}
    />
  );
}

function HeaderCell({
  rowWidth,
  label,
}: {
  rowWidth: string;
  label: string;
}): React.ReactElement {
  return (
    <div
      className="Gantt-Table_Header-Item"
      style={{
        minWidth: rowWidth,
      }}
    >
      &nbsp;{label}
    </div>
  );
}

export function TaskListHeader({
  headerHeight,
  fontFamily,
  fontSize,
  rowWidth,
}: TaskListHeaderProps): React.ReactElement {
  const { recordDisplayName, startDisplayName, endDisplayName } =
    useGanttDisplayContext();
  return (
    <div
      className="Gantt-Table"
      style={{
        fontFamily: fontFamily,
        fontSize: fontSize,
      }}
    >
      <div
        className="Gantt-Table_Header"
        style={{
          height: headerHeight - 2,
        }}
      >
        <div className="Gantt-Table_Header-Item Gantt-Header_Select__Icon" />
        <HeaderSeparator headerHeight={headerHeight} marginTopRatio={0.2} />
        <HeaderCell rowWidth={rowWidth} label={recordDisplayName} />
        <HeaderSeparator headerHeight={headerHeight} marginTopRatio={0.2} />
        <HeaderCell rowWidth={rowWidth} label={startDisplayName} />
        <HeaderSeparator headerHeight={headerHeight} marginTopRatio={0.25} />
        <HeaderCell rowWidth={rowWidth} label={endDisplayName} />
      </div>
    </div>
  );
}
