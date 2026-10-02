// extracts.ts — parse and validate the two JSON files the browser snippets
// download (snippets/dataverse-extract.js, snippets/pwa-extract.js). Pure: the
// CLI reads the files and passes the parsed JSON in as `unknown`.
//
// A file of the wrong kind, a truncated extract (row count differs from the
// header), or rows missing their key are rejected with a clear message, so a
// bad extract can never produce a confident-looking report.

/** A migrated Dataverse task (native `task`, klein_* columns). */
export interface DvTask {
  readonly activityid: string;
  readonly subject: string | null;
  readonly legacyId: string | null;
  readonly wbs: string | null;
  readonly outlineLevel: number | null;
  readonly parentActivityId: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
}

/** A task from PWA ProjectData/Tasks. */
export interface PwaTask {
  readonly taskId: string;
  readonly name: string | null;
  readonly wbs: string | null;
  readonly outlineLevel: number | null;
  readonly parentTaskId: string | null;
  readonly projectId: string;
  readonly projectName: string | null;
  readonly isProjectSummary: boolean | null;
  readonly isActive: boolean | null;
}

/** Header every extract file carries (written by the snippets). */
export interface ExtractHeader {
  readonly source: "dataverse" | "pwa";
  readonly extractedAt: string;
  readonly url: string;
  readonly count: number;
}

export interface Extract<T> {
  readonly header: ExtractHeader;
  readonly rows: readonly T[];
}

const PROJECT_NAME_ANNOTATION = "_klein_projectid_value@OData.Community.Display.V1.FormattedValue";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

/** Header + rows of an extract file, checked against the expected source. */
function readEnvelope(json: unknown, expected: ExtractHeader["source"]): { header: ExtractHeader; rows: unknown[] } {
  if (!isRecord(json) || !isRecord(json.header) || !Array.isArray(json.rows)) {
    throw new Error(`Not an extract file: expected { header, rows } from the ${expected} snippet.`);
  }
  const { source, extractedAt, url, count } = json.header;
  if (source !== expected) {
    throw new Error(`Wrong file: expected a "${expected}" extract, got "${String(source)}". Were --dv and --pwa swapped?`);
  }
  if (typeof extractedAt !== "string" || typeof url !== "string" || typeof count !== "number") {
    throw new Error(`The ${expected} extract header is incomplete (extractedAt, url, count).`);
  }
  if (count !== json.rows.length) {
    throw new Error(
      `The ${expected} extract is incomplete: header says ${count} rows, file has ${json.rows.length}. Re-run the snippet.`
    );
  }
  return { header: { source: expected, extractedAt, url, count }, rows: json.rows };
}

/** Parses the Dataverse extract. Every row needs an activityid. */
export function parseDataverseExtract(json: unknown): Extract<DvTask> {
  const { header, rows } = readEnvelope(json, "dataverse");
  return {
    header,
    rows: rows.map((row, i) => {
      if (!isRecord(row) || str(row.activityid) === null) {
        throw new Error(`Dataverse row ${i} has no activityid.`);
      }
      return {
        activityid: row.activityid as string,
        subject: str(row.subject),
        legacyId: str(row.klein_legacyid),
        wbs: str(row.klein_wbs),
        outlineLevel: num(row.klein_outlinelevel),
        parentActivityId: str(row._klein_parenttaskid_value),
        projectId: str(row._klein_projectid_value),
        projectName: str(row[PROJECT_NAME_ANNOTATION]),
      };
    }),
  };
}

/** Parses the PWA extract. Every row needs TaskId and ProjectId. */
export function parsePwaExtract(json: unknown): Extract<PwaTask> {
  const { header, rows } = readEnvelope(json, "pwa");
  return {
    header,
    rows: rows.map((row, i) => {
      if (!isRecord(row) || str(row.TaskId) === null || str(row.ProjectId) === null) {
        throw new Error(`PWA row ${i} has no TaskId or ProjectId.`);
      }
      return {
        taskId: row.TaskId as string,
        name: str(row.TaskName),
        wbs: str(row.TaskWBS),
        outlineLevel: num(row.TaskOutlineLevel),
        parentTaskId: str(row.ParentTaskId),
        projectId: row.ProjectId as string,
        projectName: str(row.ProjectName),
        isProjectSummary: bool(row.TaskIsProjectSummary),
        isActive: bool(row.TaskIsActive),
      };
    }),
  };
}
