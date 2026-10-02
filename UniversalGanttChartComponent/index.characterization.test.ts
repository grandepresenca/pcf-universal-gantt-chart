// index.characterization.test.ts — pins generateTasks' CURRENT output so the
// commit-4 restructuring can be proven behaviour-neutral (byte-identical
// snapshot before and after). It characterizes, it does not endorse: quirks
// such as colour themes being generated for records that are then skipped are
// recorded on purpose.
//
// generateTasks is private; this file alone reaches it through a narrow typed
// cast (approved for this test so the baseline runs against the untouched
// original). The fake context is cast the same way: generateTasks reads only
// the fields built here.

import { Task } from "gantt-task-react";
import { IInputs } from "./generated/ManifestTypes";
import { UniversalGanttChartComponent } from "./index";

type Values = Readonly<Record<string, unknown>>;
interface FakeRecordSpec {
  id: string;
  etn: string;
  values: Values;
}

/** The private members this test drives. */
interface Internals {
  generateTasks(
    context: ComponentFramework.Context<IInputs>,
    dataset: ComponentFramework.PropertyTypes.DataSet,
    isProgressing: boolean
  ): Promise<Task[]>;
  handleExpanderStateChange(itemId: string, expanderState: boolean): void;
  _dataSet: { refresh(): void };
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

async function run(opts: {
  allocatedHeight: number;
  readonly: boolean;
  optionColumnBound: boolean;
  records?: readonly FakeRecordSpec[];
  isProgressing?: boolean;
  collapse?: string;
}) {
  const metadataCalls: unknown[] = [];
  const context = fakeContext({ ...opts, metadataCalls });
  const component = new UniversalGanttChartComponent();
  component.init(context, () => undefined, {}, {} as unknown as HTMLDivElement);
  const internals = component as unknown as Internals;
  const dataset = fakeDataset(opts.records ?? RECORDS, opts.optionColumnBound);
  const isProgressing = opts.isProgressing ?? true;
  if (opts.collapse !== undefined) {
    // First pass registers the project; the toggle then drives hideChildren.
    await internals.generateTasks(context, dataset, isProgressing);
    internals._dataSet = { refresh: () => undefined };
    internals.handleExpanderStateChange(opts.collapse, true);
  }
  const tasks = await internals.generateTasks(context, dataset, isProgressing);
  return { tasks, metadataCalls };
}

describe("generateTasks — characterization (must stay byte-identical across commit 4)", () => {
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

  test("a collapsed project keeps hideChildren across passes", async () => {
    expect(await run({ allocatedHeight: 600, readonly: false, optionColumnBound: false, collapse: P1 })).toMatchSnapshot();
  });

  test("an empty view gives no tasks and no metadata calls", async () => {
    expect(await run({ allocatedHeight: -1, readonly: false, optionColumnBound: false, records: [] })).toEqual({
      tasks: [],
      metadataCalls: [],
    });
  });
});
