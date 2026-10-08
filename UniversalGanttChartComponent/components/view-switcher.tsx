import * as React from "react";
import { ViewMode } from "gantt-task-react";
import { IInputs } from "../generated/ManifestTypes";

/** The view-mode buttons, left to right, with their resource-string keys. */
const VIEW_BUTTONS: readonly [ViewMode, string][] = [
  [ViewMode.QuarterDay, "Quarter_Of_Day_Name"],
  [ViewMode.HalfDay, "Half_Of_Day_Name"],
  [ViewMode.Day, "Day_Name"],
  [ViewMode.Week, "Week_Name"],
  [ViewMode.Month, "Month_Name"],
];

/** The toolbar's print button, after a separator. Read-only: opens the print report. */
export function PrintButton({ label, onPrint }: { label: string; onPrint: () => void }): React.ReactElement {
  return (
    <>
      <div className="Gantt-Header_Separator">|</div>
      <button className="Gantt-Button Gantt-Button_Header" onClick={onPrint}>
        {label}
      </button>
    </>
  );
}

export const ViewSwitcher: React.FunctionComponent<{
  context: ComponentFramework.Context<IInputs>;
  onViewChange: (viewMode: ViewMode) => void;
  /** Opens the print report (read-only; "Save as PDF" in the dialog). */
  onPrint: () => void;
}> = ({ context, onViewChange, onPrint }) => {
  return (
    <div className="Gantt-Header">
      {VIEW_BUTTONS.map(([mode, label], i) => (
        <React.Fragment key={mode}>
          {i > 0 && <div className="Gantt-Header_Separator">|</div>}
          <button className="Gantt-Button Gantt-Button_Header" onClick={() => onViewChange(mode)}>
            {context.resources.getString(label)}
          </button>
        </React.Fragment>
      ))}
      <PrintButton label={context.resources.getString("Print_Report")} onPrint={onPrint} />
    </div>
  );
};
