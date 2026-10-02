// task-list-table.test.tsx — the list table's hierarchy markup (indentation
// spacer, expander toggle) next to the extra-columns cells, rendered to static
// markup in node, and the toggle's handlers called directly. No DOM, no new
// test dependency. The full collapse interaction is verified on deploy.

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Task } from "gantt-task-react";
import { ExpanderToggle, TaskListTable } from "./task-list-table";
import { GanttDisplayContext, GanttDisplayContextValue } from "./gantt-display-context";
import { ExtraColumnsContext, ExtraColumnsContextValue } from "./extra-columns-context";
import { HierarchyContext, HierarchyRowInfo } from "./hierarchy-context";

const task = (id: string): Task => ({
  id,
  name: `Name ${id}`,
  start: new Date("2026-01-01T00:00:00Z"),
  end: new Date("2026-01-02T00:00:00Z"),
  progress: 0,
  type: "task",
});

const DISPLAY: GanttDisplayContextValue = {
  recordDisplayName: "Title",
  startDisplayName: "Start",
  endDisplayName: "End",
  progressDisplayName: "",
  durationDisplayName: "Duration",
  metricDisplayName: "days",
  includeTime: false,
  formatDateShort: (value: Date) => value.toISOString().slice(0, 10),
  onOpenRecord: () => undefined,
};

function render(
  rows: [string, HierarchyRowInfo][],
  options: { rowWidth?: string; collapsed?: string[]; extra?: ExtraColumnsContextValue; tasks?: string[] } = {}
): string {
  const extra = options.extra ?? { columns: [], cellTexts: new Map() };
  return renderToStaticMarkup(
    <GanttDisplayContext.Provider value={DISPLAY}>
      <ExtraColumnsContext.Provider value={extra}>
        <HierarchyContext.Provider
          value={{ rows: new Map(rows), collapsed: new Set(options.collapsed ?? []), toggle: () => undefined }}
        >
          <TaskListTable
            rowHeight={40}
            rowWidth={options.rowWidth ?? "155px"}
            fontFamily="Segoe UI"
            fontSize="14px"
            locale="en"
            tasks={(options.tasks ?? rows.map(([id]) => id)).map(task)}
            selectedTaskId=""
            setSelectedTask={() => undefined}
            onExpanderClick={() => undefined}
          />
        </HierarchyContext.Provider>
      </ExtraColumnsContext.Provider>
    </GanttDisplayContext.Provider>
  );
}

/** The markup of one row, found by its name text. */
function rowOf(html: string, id: string): string {
  const rows = html.split('<div class="Gantt-Task-List_Row"').slice(1);
  const row = rows.find((r) => r.includes(`>Name ${id}<`));
  if (row === undefined) {
    throw new Error(`row ${id} not rendered`);
  }
  return row;
}

describe("TaskListTable — indentation", () => {
  test("a root has no spacer; deeper rows get 16px per level", () => {
    const html = render([
      ["root", { depth: 0, hasChildren: true }],
      ["child", { depth: 1, hasChildren: true }],
      ["grandchild", { depth: 2, hasChildren: false }],
    ]);
    expect(rowOf(html, "root")).not.toContain("Gantt-Task-List_Indent");
    expect(rowOf(html, "child")).toContain('style="width:16px;min-width:16px;flex-shrink:0"');
    expect(rowOf(html, "grandchild")).toContain('style="width:32px;min-width:32px;flex-shrink:0"');
  });

  test("capped at half the name cell (155px -> 77px), or 128px when the width is not px", () => {
    expect(rowOf(render([["deep", { depth: 9, hasChildren: false }]]), "deep")).toContain("width:77px");
    expect(rowOf(render([["deep", { depth: 9, hasChildren: false }]], { rowWidth: "" }), "deep")).toContain(
      "width:128px"
    );
  });

  test("the spacer comes before the expander, inside the name container", () => {
    const row = rowOf(render([["c", { depth: 1, hasChildren: true }]]), "c");
    expect(row.indexOf("Gantt-Task-List_Indent")).toBeLessThan(row.indexOf("Gantt-Task-List_Cell__Expander"));
    expect(row.indexOf("Gantt-Task-List_Name-Container")).toBeLessThan(row.indexOf("Gantt-Task-List_Indent"));
  });

  test("a task missing from the tree renders as a childless root (no crash)", () => {
    const row = rowOf(render([], { tasks: ["ghost"] }), "ghost");
    expect(row).not.toContain("Gantt-Task-List_Indent");
    expect(row).toContain('class="Gantt-Task-List_Cell__Empty-Expander"></div>');
  });
});

describe("TaskListTable — expander and extra columns", () => {
  test("▼ (expanded) / ▶ (collapsed) buttons on parents; a plain empty spacer without children", () => {
    const html = render(
      [
        ["open", { depth: 0, hasChildren: true }],
        ["shut", { depth: 0, hasChildren: true }],
        ["leaf", { depth: 1, hasChildren: false }],
      ],
      { collapsed: ["shut"] }
    );
    expect(rowOf(html, "open")).toContain(
      'class="Gantt-Task-List_Cell__Expander" role="button" tabindex="0" aria-expanded="true">▼<'
    );
    expect(rowOf(html, "shut")).toContain(
      'class="Gantt-Task-List_Cell__Expander" role="button" tabindex="0" aria-expanded="false">▶<'
    );
    expect(rowOf(html, "leaf")).toContain('<div class="Gantt-Task-List_Cell__Empty-Expander"></div>');
    expect(rowOf(html, "leaf")).not.toContain('role="button"');
  });

  test("no loaded children, no expander glyph (whatever the task type)", () => {
    const html = render([["p", { depth: 0, hasChildren: false }]]);
    expect(rowOf(html, "p")).not.toContain("▼");
  });

  test("extra-column cells still follow End on an indented row", () => {
    const extra: ExtraColumnsContextValue = {
      columns: [{ name: "klein_wbs", label: "WBS", widthPx: 80, kind: "text" }],
      cellTexts: new Map([["c", ["5.15.4"]]]),
    };
    const row = rowOf(render([["c", { depth: 2, hasChildren: false }]], { extra }), "c");
    expect(row).toContain("width:32px");
    expect(row.indexOf("2026-01-02")).toBeLessThan(row.indexOf("5.15.4"));
  });
});

/** Calls ExpanderToggle as a plain function and returns its element's props. */
function toggleProps(hasChildren: boolean, collapsed: boolean, onToggle: () => void) {
  const element = ExpanderToggle({ hasChildren, collapsed, onToggle });
  return element.props as {
    onClick?: (e: { stopPropagation(): void }) => void;
    onKeyDown?: (e: { key: string; preventDefault(): void; stopPropagation(): void }) => void;
  };
}

const fakeEvent = (key = "") => ({ key, preventDefault: jest.fn(), stopPropagation: jest.fn() });

describe("ExpanderToggle — interaction", () => {
  test("a click toggles and does NOT bubble to the row (which would select it)", () => {
    const onToggle = jest.fn();
    const event = fakeEvent();
    toggleProps(true, false, onToggle).onClick?.(event);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  test.each(["Enter", " "])("the %p key toggles, without scrolling or bubbling", (key) => {
    const onToggle = jest.fn();
    const event = fakeEvent(key);
    toggleProps(true, true, onToggle).onKeyDown?.(event);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  test("other keys do nothing (Tab keeps moving focus)", () => {
    const onToggle = jest.fn();
    const event = fakeEvent("Tab");
    toggleProps(true, false, onToggle).onKeyDown?.(event);
    expect(onToggle).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("a row without children has no handlers at all", () => {
    const props = toggleProps(false, false, jest.fn());
    expect(props.onClick).toBeUndefined();
    expect(props.onKeyDown).toBeUndefined();
  });
});
