import * as React from "react";
import { useGanttDisplayContext } from "./gantt-display-context";
import { useExtraColumnsContext } from "./extra-columns-context";

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

/** Header cells for the configured extra columns, after End. */
function ExtraHeaderCells({
  headerHeight,
}: {
  headerHeight: number;
}): React.ReactElement {
  const { columns } = useExtraColumnsContext();
  return (
    <>
      {columns.map((column) => {
        const width = `${column.widthPx}px`;
        return (
          <React.Fragment key={column.name}>
            <HeaderSeparator headerHeight={headerHeight} marginTopRatio={0.25} />
            <div
              className="Gantt-Table_Header-Item Gantt-Table_Header-Item__Extra"
              style={{ minWidth: width, maxWidth: width }}
              title={column.label}
            >
              &nbsp;{column.label}
            </div>
          </React.Fragment>
        );
      })}
    </>
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
        <ExtraHeaderCells headerHeight={headerHeight} />
      </div>
    </div>
  );
}
