import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { Xrm } from "./xrm";
import * as ReactDOM from "react-dom";
import * as React from "react";
import { Task, ViewMode } from "gantt-task-react";
import { UniversalGantt } from "./components/universal-gantt";
import { generate } from "@ant-design/colors";
import { TaskType } from "gantt-task-react/dist/types/public-types";
import { isErrorDialogOptions } from "./helper";
import {
  ExtraColumnDef,
  buildCellTextMap,
  describeIssue,
  extraColumnsCacheKey,
  extraColumnsGanttKey,
  resolveExtraColumns,
} from "./columns";
import { indexRecordIds, resolveParentRecordId } from "./hierarchy";
import { TaskNode, linkParent } from "./task-mapping";

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type DataSetRecord = ComponentFramework.PropertyHelper.DataSetApi.EntityRecord;

/** A generated colour theme, cached per entity while building tasks. */
interface EntityColorTheme {
  entityLogicalName: string;
  backgroundColor: string;
  backgroundSelectedColor: string;
  progressColor: string;
  progressSelectedColor: string;
}

/** What generateTaskNodes reads from one record. */
interface TaskFields {
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly progress: number;
  readonly taskType: TaskType;
  readonly parentValue: unknown;
  readonly colorText: string;
  readonly optionValue: string;
}

/** The per-call inputs buildTask shares across records. */
interface TaskBuildInputs {
  readonly context: ComponentFramework.Context<IInputs>;
  readonly dataset: DataSet;
  readonly isDisabled: boolean;
}

/** Validated extra columns, ready for UniversalGantt (fork customization #2). */
interface ResolvedExtraColumns {
  readonly columns: readonly ExtraColumnDef[];
  /** Maker-facing issue texts for the notice. */
  readonly messages: readonly string[];
  /** <Gantt> key; changes only when the column set changes. */
  readonly ganttKey: string;
}

const NO_EXTRA_COLUMNS: ResolvedExtraColumns = Object.freeze({
  columns: Object.freeze([]),
  messages: Object.freeze([]),
  ganttKey: "",
});
const NO_CELL_TEXTS: ReadonlyMap<string, readonly string[]> = new Map();

export class UniversalGanttChartComponent
  implements ComponentFramework.StandardControl<IInputs, IOutputs>
{
  private _container: HTMLDivElement;
  private _displayNameStr = "title";
  private _scheduledStartStr = "startTime";
  private _scheduledEndStr = "endTime";
  private _progressStr = "progress";
  private _taskTypeOption = "taskTypeOption";
  private _parentRecordStr = "parentRecord";
  private _displayColorText = "displayColorText";
  private _displayColorOption = "displayColorOption";
  private _dataSetName = "entityDataSet";
  private _defaultEntityColor = "#2975B2";
  private _defaultTaskType: TaskType = "task";
  private _viewMode: ViewMode;
  private _crmUserTimeOffset: number;
  private _dataSet: DataSet;
  private _locale: string;
  private _taskTypeMap: Record<string, TaskType> | undefined;
  private _projects: {
    [index: string]: boolean;
  };
  /** Last resolved extra columns and the inputs they came from. */
  private _extraColumns:
    | { readonly key: string; readonly result: ResolvedExtraColumns }
    | undefined;

  constructor() {
    this.handleViewModeChange = this.handleViewModeChange.bind(this);
    this.handleExpanderStateChange = this.handleExpanderStateChange.bind(this);
    this.generateColorTheme = this.generateColorTheme.bind(this);
  }

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ) {
    // Need to track container resize so that control could get the available width. The available height won't be provided even this is true
    context.mode.trackContainerResize(true);
    this._container = container;
    this._viewMode = <ViewMode>context.parameters.viewMode.raw;
    this._crmUserTimeOffset =
      context.userSettings.getTimeZoneOffsetMinutes(new Date()) +
      new Date().getTimezoneOffset();
    this._projects = {};
    context.parameters.entityDataSet.paging.setPageSize(5000);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.updateViewAsync(context);
  }

  /**
   * Async wrapper for update view method
   */
  private async updateViewAsync(context: ComponentFramework.Context<IInputs>) {
    this._dataSet = context.parameters.entityDataSet;
    //Columns retrieve
    const columns = this._dataSet.columns;
    const nameField = columns.find((c) => c.alias === this._displayNameStr);
    const startField = columns.find((c) => c.alias === this._scheduledStartStr);
    const endField = columns.find((c) => c.alias === this._scheduledEndStr);
    const progressField = columns.find((c) => c.alias === this._progressStr);
    if (
      !nameField ||
      !startField ||
      !endField ||
      !context.parameters.timeStep.raw
    )
      return;

    try {
      const tasks = await this.generateTasks(
        context,
        this._dataSet,
        !!progressField
      );

      if (!this._locale) {
        this._locale = await this.getLocalCode(context);
      }
      const listCellWidth = context.parameters.listCellWidth.raw
        ? `${context.parameters.listCellWidth.raw}px`
        : "";
      //header display names
      const recordDisplayName =
        context.parameters.customHeaderDisplayName.raw || nameField.displayName;
      const startDisplayName =
        context.parameters.customHeaderStartName.raw || startField.displayName;
      const endDisplayName =
        context.parameters.customHeaderEndName.raw || endField.displayName;
      const progressFieldName = progressField ? progressField.name : "";
      const progressDisplayName =
        context.parameters.customHeaderProgressName.raw ||
        (progressField ? progressField.displayName : "");

      //height setup
      const rowHeight = context.parameters.rowHeight.raw
        ? context.parameters.rowHeight.raw
        : 50;
      const headerHeight = context.parameters.headerHeight.raw
        ? context.parameters.headerHeight.raw
        : 50;

      let ganttHeight: number | undefined;
      if (context.mode.allocatedHeight !== -1) {
        ganttHeight = context.mode.allocatedHeight - 15;
      } else if (context.parameters.isSubgrid.raw === "no") {
        ganttHeight = this._container.offsetHeight - 100;
      }

      //width setup
      const columnWidthQuarter = context.parameters.columnWidthQuarter.raw || 0;
      const columnWidthHalf = context.parameters.columnWidthHalf.raw || 0;
      const columnWidthDay = context.parameters.columnWidthDay.raw || 0;
      const columnWidthWeek = context.parameters.columnWidthWeek.raw || 0;
      const columnWidthMonth = context.parameters.columnWidthMonth.raw || 0;

      const includeTime =
        context.parameters.displayDateFormat.raw === "datetime";

      const fontSize = context.parameters.fontSize.raw || "14px";
      const extra = this.getExtraColumns(context, this._dataSet);
      //create gantt
      const gantt = React.createElement(UniversalGantt, {
        context,
        tasks,
        ganttHeight,
        recordDisplayName,
        startDisplayName,
        endDisplayName,
        progressDisplayName,
        startFieldName: startField.name,
        endFieldName: endField.name,
        progressFieldName: progressFieldName,
        listCellWidth: listCellWidth,
        timeStep: context.parameters.timeStep.raw,
        rowHeight: rowHeight,
        headerHeight: headerHeight,
        isProgressing: !!progressField,
        viewMode: this._viewMode,
        includeTime: includeTime,
        locale: this._locale,
        rtl: context.userSettings.isRTL,
        crmUserTimeOffset: this._crmUserTimeOffset,
        fontSize,
        columnWidthQuarter,
        columnWidthHalf,
        columnWidthDay,
        columnWidthWeek,
        columnWidthMonth,
        onViewChange: this.handleViewModeChange,
        onExpanderStateChange: this.handleExpanderStateChange,
        extraColumns: extra.columns,
        extraCellTexts: this.getExtraCellTexts(this._dataSet, extra.columns),
        extraColumnMessages: extra.messages,
        extraColumnsKey: extra.ganttKey,
      });

      ReactDOM.render(gantt, this._container);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * The extra columns for this updateView. Re-validates only when the config,
   * the dataset's columns or listCellWidth change; otherwise returns the same
   * object, so resize and refresh stay cheap and the <Gantt> key is stable.
   * Issues are logged once per change, not on every updateView.
   */
  private getExtraColumns(
    context: ComponentFramework.Context<IInputs>,
    dataset: DataSet
  ): ResolvedExtraColumns {
    // While loading, the column list can be incomplete and would report false
    // "unknown column" issues, so keep the last result. This guard covers
    // extra-column validation only; the rest of updateView is unchanged.
    if (dataset.loading) {
      return this._extraColumns?.result ?? NO_EXTRA_COLUMNS;
    }
    const raw = context.parameters.extraColumns.raw;
    const defaultWidthPx = context.parameters.listCellWidth.raw ?? 0;
    const key = extraColumnsCacheKey(raw, dataset.columns, defaultWidthPx);
    if (this._extraColumns?.key === key) {
      return this._extraColumns.result;
    }
    const { columns, issues } = resolveExtraColumns(raw, dataset.columns, {
      defaultWidthPx,
    });
    const messages = issues.map(describeIssue);
    messages.forEach((message) => console.warn(message));
    const result: ResolvedExtraColumns =
      columns.length === 0 && messages.length === 0
        ? NO_EXTRA_COLUMNS
        : { columns, messages, ganttKey: extraColumnsGanttKey(columns) };
    this._extraColumns = { key, result };
    return result;
  }

  /**
   * Formatted texts of the extra columns per record id. Nothing is read when
   * there are no extra columns. A record whose getFormattedValue throws gets
   * empty cells instead of failing the whole chart.
   */
  private getExtraCellTexts(
    dataset: DataSet,
    columns: readonly ExtraColumnDef[]
  ): ReadonlyMap<string, readonly string[]> {
    if (columns.length === 0) {
      return NO_CELL_TEXTS;
    }
    const { cells, failedIds } = buildCellTextMap(
      dataset.sortedRecordIds,
      (id) => dataset.records[id],
      columns
    );
    if (failedIds.length > 0) {
      console.warn(
        `Extra columns: reading values failed for ${failedIds.length} record(s); their extra cells are empty.`,
        failedIds
      );
    }
    return cells;
  }

  /** The view's Gantt tasks, in view order (see generateTaskNodes). */
  private async generateTasks(
    context: ComponentFramework.Context<IInputs>,
    dataset: ComponentFramework.PropertyTypes.DataSet,
    isProgressing: boolean
  ): Promise<Task[]> {
    const nodes = await this.generateTaskNodes(context, dataset, isProgressing);
    return nodes.map((node) => node.task);
  }

  /**
   * One TaskNode per record that has a name, start and end, in view order.
   * Per record: read fields -> colour theme -> skip if incomplete -> build.
   * The theme is generated BEFORE the skip check, so a skipped record still
   * costs its metadata call (existing behaviour, pinned by
   * index.characterization.test.ts).
   */
  private async generateTaskNodes(
    context: ComponentFramework.Context<IInputs>,
    dataset: ComponentFramework.PropertyTypes.DataSet,
    isProgressing: boolean
  ): Promise<TaskNode[]> {
    const build: TaskBuildInputs = {
      context,
      dataset,
      isDisabled: context.parameters.displayMode.raw === "readonly",
    };
    const themes: EntityColorTheme[] = [];
    const optionColum = dataset.columns.find(
      (c) => c.alias == this._displayColorOption
    );
    const optionLogicalName = optionColum ? optionColum.name : "";
    // Parents are matched among the records the view renders (sortedRecordIds),
    // not dataset.records: first wins in view order, and a record outside the
    // view is never linked as a parent.
    const recordIdsByNormalized = indexRecordIds(dataset.sortedRecordIds);
    const nodes: TaskNode[] = [];
    for (const recordId of dataset.sortedRecordIds) {
      const record = dataset.records[recordId];
      const fields = this.readTaskFields(context, record, isProgressing);
      const theme = await this.colorThemeFor(context, record, fields, optionLogicalName, themes);
      if (!fields.name || !fields.start || !fields.end) continue;
      const parentId =
        resolveParentRecordId(fields.parentValue, recordIdsByNormalized) ?? null;
      const task = this.buildTask(build, record, fields, theme, parentId);
      nodes.push({ id: task.id, parentId, task });
    }
    return nodes;
  }

  /** The values generateTaskNodes needs from one record. */
  private readTaskFields(
    context: ComponentFramework.Context<IInputs>,
    record: DataSetRecord,
    isProgressing: boolean
  ): TaskFields {
    return {
      name: <string>record.getValue(this._displayNameStr),
      start: <string>record.getValue(this._scheduledStartStr),
      end: <string>record.getValue(this._scheduledEndStr),
      progress: isProgressing ? Number(record.getValue(this._progressStr)) : 0,
      // Resolved here, before the theme and outside buildTask's try: a bad
      // taskTypeMapping throws before any metadata call, as it always has.
      taskType: this.getTaskType(
        <string>record.getValue(this._taskTypeOption),
        context.parameters.taskTypeMapping.raw
      ),
      parentValue: record.getValue(this._parentRecordStr),
      colorText: <string>record.getValue(this._displayColorText),
      optionValue: <string>record.getValue(this._displayColorOption),
    };
  }

  /**
   * The colour theme for a record's entity: cached per entity in `themes`,
   * except that a record with its own colour (text, or an option column bound)
   * always gets a freshly generated theme, which is appended to `themes`.
   */
  private async colorThemeFor(
    context: ComponentFramework.Context<IInputs>,
    record: DataSetRecord,
    fields: TaskFields,
    optionLogicalName: string,
    themes: EntityColorTheme[]
  ): Promise<EntityColorTheme> {
    const entRef = record.getNamedReference();
    const entName = entRef.etn || ((entRef as { logicalName?: string }).logicalName as string);

    let entityColorTheme = themes.find(
      (e) => e.entityLogicalName === entName
    );

    if (!entityColorTheme || fields.colorText || optionLogicalName) {
      entityColorTheme = await this.generateColorTheme(
        context,
        entName,
        fields.colorText,
        fields.optionValue,
        optionLogicalName
      );
      themes.push(entityColorTheme);
    }
    return entityColorTheme;
  }

  /**
   * A project's remembered collapse state (true = children hidden). A project
   * seen for the first time, or last expanded, is registered as expanded.
   */
  private expanderStateFor(taskId: string): boolean {
    const expanderState = this._projects[taskId];
    if (!expanderState) {
      this._projects[taskId] = false;
      return false;
    }
    return this._projects[taskId];
  }

  /**
   * How a task attaches to its parent record (see linkParent); nothing if
   * that record is not in the dataset. Called inside buildTask's try, so a
   * failure here still surfaces as "Create task error".
   */
  private parentLinkFor(
    build: TaskBuildInputs,
    parentRecordId: string
  ): Pick<Task, "project" | "dependencies"> {
    const parentRecordRef = build.dataset.records[parentRecordId];
    if (!parentRecordRef) {
      return {};
    }
    const parentType = this.getTaskType(
      <string>parentRecordRef.getValue(this._taskTypeOption),
      build.context.parameters.taskTypeMapping.raw
    );
    return linkParent(parentType, parentRecordId);
  }

  /** The Gantt task for one record, attached to its parent (if in the view). */
  private buildTask(
    build: TaskBuildInputs,
    record: DataSetRecord,
    fields: TaskFields,
    entityColorTheme: EntityColorTheme,
    parentRecordId: string | null
  ): Task {
    const { name, start, end, progress, taskType } = fields;
    const { isDisabled } = build;
    try {
      const taskId = record.getRecordId();
      const task: Task = {
        id: taskId,
        name,
        start: new Date(
          new Date(start).getTime() + this._crmUserTimeOffset * 60000
        ),
        end: new Date(
          new Date(end).getTime() + this._crmUserTimeOffset * 60000
        ),
        progress: progress,
        type: taskType,
        isDisabled: isDisabled,
        styles: { ...entityColorTheme },
      };
      if (taskType === "project") {
        task.hideChildren = this.expanderStateFor(taskId);
      }
      if (parentRecordId !== null) {
        Object.assign(task, this.parentLinkFor(build, parentRecordId));
      }
      return task;
    } catch (e) {
      throw new Error(
        `Create task error. Record id: ${record.getRecordId()}, name: ${name}, start time: ${start}, end time: ${end}, progress: ${progress}. Error text ${e}`
      );
    }
  }

  private async generateColorTheme(
    context: ComponentFramework.Context<IInputs>,
    entName: string,
    colorText: string,
    optionValue: string,
    optionLogicalName: string
  ) {
    let entityColor = this._defaultEntityColor;
    //Model App
    if (context.mode.allocatedHeight === -1 && !colorText) {
      if (optionValue) {
        //Get by OptionSet Color
        const result = await context.utils.getEntityMetadata(entName, [
          optionLogicalName,
        ]);
        const attributes: Xrm.EntityMetadata.AttributesCollection =
          result["Attributes"];
        const optionMetadata = attributes.getByName(optionLogicalName);
        entityColor =
          optionMetadata.attributeDescriptor.OptionSet.find(
            (o) => o.Value === +optionValue
          )?.Color || entityColor;
      } else {
        //Get by Entity Color
        const result = await context.utils.getEntityMetadata(entName, [
          "EntityColor",
        ]);
        entityColor = result["EntityColor"];
      }
    } else if (colorText) {
      //Get by Text Color
      entityColor = colorText;
    }

    const colors = generate(entityColor);
    const backgroundColor =
      context.parameters.customBackgroundColor.raw || colors[2];
    const backgroundSelectedColor =
      context.parameters.customBackgroundSelectedColor.raw || colors[3];
    const progressColor =
      context.parameters.customProgressColor.raw || colors[4];
    const progressSelectedColor =
      context.parameters.customProgressSelectedColor.raw || colors[5];

    return {
      entityLogicalName: entName,
      backgroundColor: backgroundColor,
      backgroundSelectedColor: backgroundSelectedColor,
      progressColor: progressColor,
      progressSelectedColor: progressSelectedColor,
    };
  }

  private getTaskType(
    taskTypeOption: string,
    taskTypeMapping: string | null
  ): TaskType {
    let taskType: TaskType = this._defaultTaskType;
    if (taskTypeOption && taskTypeMapping) {
      if (!this._taskTypeMap) {
        this._taskTypeMap = JSON.parse(taskTypeMapping) as Record<string, TaskType>;
      }
      taskType = <TaskType>this._taskTypeMap[taskTypeOption];
    }
    return taskType;
  }

  private handleViewModeChange(viewMode: ViewMode) {
    this._viewMode = viewMode;
  }

  private handleExpanderStateChange(itemId: string, expanderState: boolean) {
    this._projects[itemId] = expanderState;
    this._dataSet.refresh();
  }

  private async getLocalCode(context: ComponentFramework.Context<IInputs>) {
    try {
      const languages = await context.webAPI.retrieveMultipleRecords(
        "languagelocale",
        `?$select=code&$filter=localeid eq ${context.userSettings.languageId}`
      );
      if (languages.entities.length > 0) {
        const code = languages.entities[0].code;
        return code;
      }
    } catch (e) {
      if (isErrorDialogOptions(e)) {
        context.navigation.openErrorDialog(e);
      } else {
        console.error(e);
      }
    }

    return "en"; // English
  }
  /**
   * It is called by the framework prior to a control receiving new data.
   * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as “bound” or “output”
   */
  public getOutputs(): IOutputs {
    return {};
  }

  /**
   * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
   * i.e. cancelling any pending remote calls, removing listeners, etc.
   */
  public destroy(): void {
    ReactDOM.unmountComponentAtNode(this._container);
  }
}
