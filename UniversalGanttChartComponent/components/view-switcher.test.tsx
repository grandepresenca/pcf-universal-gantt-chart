// view-switcher.test.tsx — the toolbar's print button (static markup + handler).

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewMode } from "gantt-task-react";
import { PrintButton, ViewSwitcher } from "./view-switcher";

const context = {
  resources: { getString: (key: string) => `[${key}]` },
} as unknown as Parameters<typeof ViewSwitcher>[0]["context"];

describe("ViewSwitcher — print button", () => {
  test("renders after the view buttons, with its localized label", () => {
    const html = renderToStaticMarkup(<ViewSwitcher context={context} onViewChange={() => undefined} onPrint={() => undefined} />);
    expect(html.indexOf("[Month_Name]")).toBeLessThan(html.indexOf("[Print_Report]"));
    expect(html).toContain('<button class="Gantt-Button Gantt-Button_Header">[Print_Report]</button>');
  });

  test("ViewSwitcher hands its onPrint to the PrintButton, last in the toolbar", () => {
    const onPrint = jest.fn();
    const root = ViewSwitcher({ context, onViewChange: jest.fn(), onPrint }) as React.ReactElement<{ children: React.ReactNode }>;
    const children = React.Children.toArray(root.props.children);
    const last = children[children.length - 1] as React.ReactElement<{ onPrint: () => void; label: string }>;
    expect(last.type).toBe(PrintButton);
    expect(last.props).toEqual({ onPrint, label: "[Print_Report]" });
  });

  test("clicking the PrintButton calls onPrint", () => {
    const onPrint = jest.fn();
    const fragment = PrintButton({ label: "Print", onPrint }) as React.ReactElement<{ children: React.ReactElement[] }>;
    const button = React.Children.toArray(fragment.props.children).find(
      (c): c is React.ReactElement<{ onClick: () => void }> => React.isValidElement(c) && c.type === "button"
    );
    button?.props.onClick();
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});

describe("ViewSwitcher — view buttons", () => {
  test("each button sends its view mode, left to right", () => {
    const seen: ViewMode[] = [];
    const root = ViewSwitcher({ context, onViewChange: (m) => seen.push(m), onPrint: jest.fn() }) as React.ReactElement;
    const click = (node: React.ReactNode): void =>
      React.Children.forEach(node, (c) => {
        if (React.isValidElement(c)) {
          const el = c as React.ReactElement<{ onClick?: () => void; children?: React.ReactNode }>;
          if (el.type === "button" && el.props.onClick) {
            el.props.onClick();
          }
          click(el.props.children);
        }
      });
    click(root);
    expect(seen).toEqual([ViewMode.QuarterDay, ViewMode.HalfDay, ViewMode.Day, ViewMode.Week, ViewMode.Month]);
  });
});
