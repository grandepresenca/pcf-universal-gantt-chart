// task-mapping.test.ts — how a task attaches to its parent in the Gantt.

import { linkParent } from "./task-mapping";

describe("linkParent", () => {
  test("a project parent groups the task under it (project only, no arrow)", () => {
    expect(linkParent("project", "P-1")).toEqual({ project: "P-1" });
  });

  test.each(["task", "milestone"] as const)("a %s parent draws a dependency arrow (no grouping)", (type) => {
    expect(linkParent(type, "T-1")).toEqual({ dependencies: ["T-1"] });
  });

  test("the parent record id is passed through unchanged", () => {
    expect(linkParent("project", "{AbC}")).toEqual({ project: "{AbC}" });
    expect(linkParent("task", "{AbC}")).toEqual({ dependencies: ["{AbC}"] });
  });
});
