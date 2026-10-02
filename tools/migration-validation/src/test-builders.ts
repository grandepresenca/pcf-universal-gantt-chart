// test-builders.ts — tiny row builders for the validator's tests.

import { DvTask, PwaTask } from "./extracts";

export const pwa = (taskId: string, projectId: string, o: Partial<PwaTask> = {}): PwaTask => ({
  taskId,
  name: `T ${taskId}`,
  wbs: null,
  outlineLevel: 1,
  parentTaskId: null,
  projectId,
  projectName: `P ${projectId}`,
  isProjectSummary: false,
  isActive: true,
  ...o,
});

export const dv = (legacyId: string | null, projectId: string | null, o: Partial<DvTask> = {}): DvTask => ({
  activityid: `dv-${legacyId ?? "none"}`,
  subject: `T ${legacyId}`,
  legacyId,
  wbs: null,
  outlineLevel: 1,
  parentActivityId: null,
  projectId,
  projectName: projectId === null ? null : `DV ${projectId}`,
  ...o,
});

/** The Dataverse activityid dv() gives a task with this legacy id. */
export const act = (legacyId: string): string => `dv-${legacyId}`;
