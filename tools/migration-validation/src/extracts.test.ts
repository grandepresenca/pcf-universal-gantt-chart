// extracts.test.ts — the extract files are validated before anything is analysed.

import { parseDataverseExtract, parsePwaExtract } from "./extracts";

const header = (source: string, count: number) => ({ source, extractedAt: "2026-10-02T12:00:00Z", url: "https://x/y", count });

describe("extract envelope", () => {
  test.each([
    ["not an object", 42],
    ["no rows", { header: header("pwa", 0) }],
    ["rows not an array", { header: header("pwa", 0), rows: {} }],
    ["no header", { rows: [] }],
  ])("%s -> rejected", (_label, json) => {
    expect(() => parsePwaExtract(json)).toThrow("Not an extract file");
  });

  test("the wrong kind of file (swapped arguments) is rejected", () => {
    expect(() => parsePwaExtract({ header: header("dataverse", 0), rows: [] })).toThrow('Were --dv and --pwa swapped?');
  });

  test("a truncated extract (count differs from rows) is rejected", () => {
    expect(() => parseDataverseExtract({ header: header("dataverse", 2), rows: [{ activityid: "a" }] })).toThrow("incomplete");
  });

  test("an incomplete header is rejected", () => {
    expect(() => parseDataverseExtract({ header: { source: "dataverse", count: 0 }, rows: [] })).toThrow("header is incomplete");
  });
});

describe("Dataverse rows", () => {
  test("maps columns, the project-name annotation, and blanks to null", () => {
    const row = {
      activityid: "A1",
      subject: "Task",
      klein_legacyid: "L1",
      klein_wbs: " ",
      klein_outlinelevel: 2,
      _klein_parenttaskid_value: "A0",
      _klein_projectid_value: "D1",
      "_klein_projectid_value@OData.Community.Display.V1.FormattedValue": "Alazan",
    };
    expect(parseDataverseExtract({ header: header("dataverse", 1), rows: [row] }).rows[0]).toEqual({
      activityid: "A1",
      subject: "Task",
      legacyId: "L1",
      wbs: null,
      outlineLevel: 2,
      parentActivityId: "A0",
      projectId: "D1",
      projectName: "Alazan",
    });
  });

  test("non-numeric outline level and missing fields become null", () => {
    const row = parseDataverseExtract({ header: header("dataverse", 1), rows: [{ activityid: "A", klein_outlinelevel: "2" }] }).rows[0];
    expect(row).toMatchObject({ outlineLevel: null, legacyId: null, projectName: null });
  });

  test("a row without activityid is rejected with its index", () => {
    expect(() => parseDataverseExtract({ header: header("dataverse", 2), rows: [{ activityid: "a" }, { subject: "x" }] })).toThrow("row 1");
  });
});

describe("PWA rows", () => {
  test("maps ProjectData fields", () => {
    const row = {
      ProjectId: "P1",
      ProjectName: "Alazan",
      TaskId: "T1",
      TaskName: "Site Maintenance",
      TaskWBS: "4.23",
      TaskOutlineLevel: 2,
      ParentTaskId: "T0",
      TaskIsProjectSummary: false,
      TaskIsActive: true,
    };
    expect(parsePwaExtract({ header: header("pwa", 1), rows: [row] }).rows[0]).toEqual({
      taskId: "T1",
      name: "Site Maintenance",
      wbs: "4.23",
      outlineLevel: 2,
      parentTaskId: "T0",
      projectId: "P1",
      projectName: "Alazan",
      isProjectSummary: false,
      isActive: true,
    });
  });

  test("non-boolean flags become null", () => {
    const row = parsePwaExtract({ header: header("pwa", 1), rows: [{ ProjectId: "P", TaskId: "T", TaskIsActive: "yes" }] }).rows[0];
    expect(row.isActive).toBeNull();
  });

  test.each([
    ["no TaskId", { ProjectId: "P" }],
    ["no ProjectId", { TaskId: "T" }],
    ["not an object", "x"],
  ])("%s -> rejected", (_label, row) => {
    expect(() => parsePwaExtract({ header: header("pwa", 1), rows: [row] })).toThrow("PWA row 0");
  });
});
