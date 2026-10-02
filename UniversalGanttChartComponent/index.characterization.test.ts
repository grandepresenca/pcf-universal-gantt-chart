// index.characterization.test.ts — pins the tasks the control builds from a
// dataset (snapshot of Task[] plus the getEntityMetadata call order). Recorded
// on the original generateTasks (commit 4 proved its refactor byte-identical);
// changed on purpose only by ADR-010 D1/D2 (no project / dependencies /
// hideChildren). It characterizes, it does not endorse: quirks such as colour
// themes being generated for records that are then skipped are recorded on
// purpose. The tree wiring (parent ids, order, cycle warning) is asserted
// explicitly below.
//
// The methods are private; this file alone reaches them through a narrow
// typed cast (approved for this test). The fake context is cast the same way:
// the control reads only the fields built here.

import { IInputs } from "./generated/ManifestTypes";
import { UniversalGanttChartComponent } from "./index";
import { HierarchyRow } from "./hierarchy";
import { TaskNode } from "./task-mapping";

type Values = Readonly<Record<string, unknown>>;
interface FakeRecordSpec {
  id: string;
  etn: string;
  values: Values;
}

/** The private members this test drives. */
type Generate<T> = (
  context: ComponentFramework.Context<IInputs>,
  dataset: ComponentFramework.PropertyTypes.DataSet,
  isProgressing: boolean
) => Promise<T>;
interface Internals {
  generateTaskNodes: Generate<TaskNode[]>;
  generateRows: Generate<readonly HierarchyRow<TaskNode>[]>;
}

const OFFSET_MINUTES = 120;

function fakeDataset(records: readonly FakeRecordSpec[], optionColumnBound: boolean) {
  const byId: Record<string, unknown> = {};
  records.forEach((r) => {
    byId[r.id] = {
      getRecordId: () => r.id,
      getValue: (alias: string) => (alias in r.values ? r.values[alias] : null),
      getNamedReference: () => ({ etn: r.etn, id: { guid: r.id }, name: String(r.values.title) }),
    };
  });
  return {
    sortedRecordIds: records.map((r) => r.id),
    records: byId,
    columns: optionColumnBound ? [{ alias: "displayColorOption", name: "klein_colorcode" }] : [],
    paging: { setPageSize: () => undefined },
  } as unknown as ComponentFramework.PropertyTypes.DataSet;
}

function fakeContext(opts: { allocatedHeight: number; readonly: boolean; metadataCalls: unknown[] }) {
  const raw = (value: unknown) => ({ raw: value });
  return {
    mode: { allocatedHeight: opts.allocatedHeight, trackContainerResize: () => undefined },
    userSettings: {
      // init computes offset = this + new Date().getTimezoneOffset(); pin it.
      getTimeZoneOffsetMinutes: () => OFFSET_MINUTES - new Date().getTimezoneOffset(),
    },
    parameters: {
      viewMode: raw("Day"),
      displayMode: raw(opts.readonly ? "readonly" : "editable"),
      taskTypeMapping: raw('{"1":"project","2":"task","3":"milestone"}'),
      customBackgroundColor: raw(null),
      customBackgroundSelectedColor: raw(null),
      customProgressColor: raw(null),
      customProgressSelectedColor: raw(null),
      entityDataSet: { paging: { setPageSize: () => undefined } },
    },
    utils: {
      getEntityMetadata: (entityName: string, attributes: string[]) => {
        opts.metadataCalls.push([entityName, ...attributes]);
        return Promise.resolve({
          EntityColor: entityName === "task" ? "#1E90FF" : "#8B4513",
          Attributes: {
            getByName: () => ({
              attributeDescriptor: {
                OptionSet: [
                  { Value: 1, Color: "#228B22" },
                  { Value: 2, Color: "#B22222" },
                ],
              },
            }),
          },
        });
      },
    },
  } as unknown as ComponentFramework.Context<IInputs>;
}

const P1 = "aaaaaaaa-0000-0000-0000-000000000001";
const rec = (id: string, etn: string, values: Values): FakeRecordSpec => ({ id, etn, values });
const dated = (title: string | null, start: string, end: string, extra: Values = {}): Values => ({
  title,
  startTime: start,
  endTime: end,
  progress: 40,
  ...extra,
});

/** Roots, a project parent (braced/upper-case lookup), a task parent, parents outside the view, a raw-string parent, records skipped for a missing name / start / end, a colour override. */
const RECORDS: readonly FakeRecordSpec[] = [
  rec(P1, "task", dated("Project 1", "2026-01-05T08:00:00Z", "2026-03-01T17:00:00Z", { taskTypeOption: "1" })),
  rec("c1", "task", dated("Child 1", "2026-01-06T08:00:00Z", "2026-01-20T17:00:00Z", {
    taskTypeOption: "2",
    parentRecord: { id: { guid: `{${P1.toUpperCase()}}` }, etn: "task", name: "Project 1" },
  })),
  rec("c2", "task", dated("Child 2", "2026-01-21T08:00:00Z", "2026-02-01T17:00:00Z", {
    taskTypeOption: "2",
    parentRecord: { id: { guid: "c1" } },
  })),
  rec("c3", "task", dated("Milestone", "2026-02-02T08:00:00Z", "2026-02-02T08:00:00Z", {
    taskTypeOption: "3",
    parentRecord: { id: { guid: "not-in-view" } },
  })),
  rec("skipped", "msdyn_other", dated(null, "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z")),
  rec("c4", "task", dated("Raw parent", "2026-02-03T08:00:00Z", "2026-02-10T17:00:00Z", { parentRecord: "val" })),
  rec("c5", "task", dated("Coloured", "2026-02-11T08:00:00Z", "2026-02-12T17:00:00Z", {
    displayColorText: "#FF8C00",
    parentRecord: { id: P1 },
  })),
  rec("o1", "msdyn_other", dated("Other entity", "2026-02-13T08:00:00Z", "2026-02-14T17:00:00Z", { progress: "75" })),
  rec("no-start", "msdyn_third", dated("No start", "", "2026-02-20T17:00:00Z")),
  rec("no-end", "task", dated("No end", "2026-02-21T08:00:00Z", "")),
];

function setUp(opts: {
  allocatedHeight: number;
  readonly: boolean;
  optionColumnBound: boolean;
  records?: readonly FakeRecordSpec[];
}) {
  const metadataCalls: unknown[] = [];
  const context = fakeContext({ ...opts, metadataCalls });
  const component = new UniversalGanttChartComponent();
  component.init(context, () => undefined, {}, {} as unknown as HTMLDivElement);
  const internals = component as unknown as Internals;
  const dataset = fakeDataset(opts.records ?? RECORDS, opts.optionColumnBound);
  return { context, internals, dataset, metadataCalls };
}

async function run(opts: {
  allocatedHeight: number;
  readonly: boolean;
  optionColumnBound: boolean;
  records?: readonly FakeRecordSpec[];
  isProgressing?: boolean;
}) {
  const { context, internals, dataset, metadataCalls } = setUp(opts);
  const nodes = await internals.generateTaskNodes(context, dataset, opts.isProgressing ?? true);
  return { tasks: nodes.map((node) => node.task), metadataCalls };
}

describe("generateTaskNodes — characterization (Task[] + metadata calls)", () => {
  test("model app, entity colours, editable", async () => {
    expect(await run({ allocatedHeight: -1, readonly: false, optionColumnBound: false })).toMatchSnapshot();
  });

  test("model app, option-set colours, read-only", async () => {
    const records = RECORDS.map((r, i) =>
      i % 3 === 0 ? r : { ...r, values: { ...r.values, displayColorOption: i % 3 === 1 ? "1" : "2" } }
    );
    expect(await run({ allocatedHeight: -1, readonly: true, optionColumnBound: true, records })).toMatchSnapshot();
  });

  test("canvas host (no metadata), no progress column", async () => {
    expect(await run({ allocatedHeight: 600, readonly: false, optionColumnBound: false, isProgressing: false })).toMatchSnapshot();
  });

  test("an empty view gives no tasks and no metadata calls", async () => {
    expect(await run({ allocatedHeight: -1, readonly: false, optionColumnBound: false, records: [] })).toEqual({
      tasks: [],
      metadataCalls: [],
    });
  });
});

const MODEL = { allocatedHeight: -1, readonly: false, optionColumnBound: false };

describe("generateTaskNodes — parent ids (ADR-010)", () => {
  test("each node carries its parent's ORIGINAL record id, or null", async () => {
    const { context, internals, dataset } = setUp(MODEL);
    const nodes = await internals.generateTaskNodes(context, dataset, true);
    expect(nodes.map((n) => [n.id, n.parentId])).toEqual([
      [P1, null],
      ["c1", P1], // braced, upper-case lookup -> original id
      ["c2", "c1"],
      ["c3", null], // parent not in the view
      ["c4", null], // raw-string parent value
      ["c5", P1], // plain-string id inside the lookup
      ["o1", null],
    ]);
  });
});

describe("generateRows — tree order into the Gantt (ADR-010 D3)", () => {
  test("parents before children, siblings by start, depth and hasChildren", async () => {
    const { context, internals, dataset } = setUp(MODEL);
    const rows = await internals.generateRows(context, dataset, true);
    expect(rows.map((r) => [r.node.id, r.depth, r.hasChildren])).toEqual([
      [P1, 0, true],
      ["c1", 1, true],
      ["c2", 2, false],
      ["c5", 1, false],
      ["c3", 0, false],
      ["c4", 0, false],
      ["o1", 0, false],
    ]);
  });

});

describe("generateRows — the parent-cycle warning", () => {
  test("a parent cycle is warned about once per control instance, and every task still shows", async () => {
    const cycle = [
      rec("a", "task", dated("A", "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z", { parentRecord: { id: "b" } })),
      rec("b", "task", dated("B", "2026-01-03T08:00:00Z", "2026-01-04T08:00:00Z", { parentRecord: { id: "a" } })),
    ];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { context, internals, dataset } = setUp({ ...MODEL, records: cycle });
      const first = await internals.generateRows(context, dataset, true);
      await internals.generateRows(context, dataset, true);
      expect(first.map((r) => r.node.id).sort()).toEqual(["a", "b"]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("2 task(s) have parent links that form a cycle (a, b)");
    } finally {
      warn.mockRestore();
    }
  });

  test("no cycle, no warning", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { context, internals, dataset } = setUp(MODEL);
      await internals.generateRows(context, dataset, true);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
