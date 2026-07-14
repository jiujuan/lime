import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";

export interface WorkspaceArticleWorkflowRun {
  workflowRunId: string;
  workflowKey: string | null;
  workflowTitle: string | null;
  status: string | null;
  appId: string | null;
  sessionId: string | null;
  workspaceId: string | null;
  turnId: string | null;
  taskId: string | null;
  taskKind: string | null;
  selectedObjectRef: Record<string, unknown> | null;
  primaryArtifactRef: Record<string, unknown> | null;
  eventCount: number | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  stepCounts: Record<string, unknown> | null;
  artifactRefs: string[];
  evidenceRefs: string[];
  failure: Record<string, unknown> | null;
  retry: Record<string, unknown> | null;
  actions: WorkspaceArticleWorkflowAction[];
  steps: WorkspaceArticleWorkflowStep[];
}

export interface WorkspaceArticleWorkflowStep {
  workflowRunId: string;
  workflowKey: string | null;
  id: string;
  title: string;
  index: number | null;
  stepCount: number | null;
  status: string | null;
  attempt: number | null;
  subagent: string | null;
  skillRefs: string[];
  expectedOutput: string | null;
  progressMessage: string | null;
  detail: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  eventCount: number | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  toolCallIds: string[];
  artifactRefs: string[];
  evidenceRefs: string[];
  failure: Record<string, unknown> | null;
  retry: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  requestId: string | null;
  agentActionType: string | null;
}

export interface WorkspaceArticleWorkflowAction {
  workflowRunId: string;
  actionType: string;
  stepId: string | null;
  requestId: string | null;
  agentActionType: string | null;
}

export function readWorkspaceArticleWorkflowRunsFromThreadRead(
  threadRead?: AgentRuntimeThreadReadModel | null,
): WorkspaceArticleWorkflowRun[] {
  const record = asRecord(threadRead);
  if (!record) {
    return [];
  }
  return readWorkspaceArticleWorkflowRunsFromUnknown(record);
}

export function readWorkspaceArticleWorkflowRunsFromUnknown(
  value: unknown,
): WorkspaceArticleWorkflowRun[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const workflowRecord = firstRecord(record.workflow) ?? record;

  const standaloneSteps = readWorkflowSteps(
    firstArray(
      workflowRecord.workflow_steps,
      workflowRecord.workflowSteps,
      record.workflow_steps,
      record.workflowSteps,
    ),
  );
  const stepsByRun = groupStepsByRun(standaloneSteps);
  const actionsByRun = groupActionsByRun(
    readWorkflowActions(firstArray(workflowRecord.actions, record.actions)),
  );
  const runs = firstArray(
    workflowRecord.workflow_runs,
    workflowRecord.workflowRuns,
    record.workflow_runs,
    record.workflowRuns,
  )
    .map((item) => readWorkflowRun(item, stepsByRun, actionsByRun))
    .filter((item): item is WorkspaceArticleWorkflowRun => Boolean(item));

  if (runs.length > 0) {
    return runs.sort(compareWorkflowRuns);
  }

  return Array.from(stepsByRun.entries())
    .map(([workflowRunId, steps]) => ({
      workflowRunId,
      workflowKey: steps[0]?.workflowKey ?? null,
      workflowTitle: null,
      status: null,
      appId: null,
      sessionId: null,
      workspaceId: null,
      turnId: null,
      taskId: null,
      taskKind: null,
      selectedObjectRef: null,
      primaryArtifactRef: null,
      eventCount: null,
      startedAt: null,
      updatedAt: latestUpdatedAt(steps),
      finishedAt: null,
      completedAt: null,
      failedAt: null,
      stepCounts: null,
      artifactRefs: [],
      evidenceRefs: [],
      failure: null,
      retry: null,
      actions: actionsByRun.get(workflowRunId) ?? [],
      steps,
    }))
    .sort(compareWorkflowRuns);
}

function readWorkflowRun(
  value: unknown,
  standaloneStepsByRun: Map<string, WorkspaceArticleWorkflowStep[]>,
  actionsByRun: Map<string, WorkspaceArticleWorkflowAction[]>,
): WorkspaceArticleWorkflowRun | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const workflowRunId = readString(
    record.workflow_run_id,
    record.workflowRunId,
    record.id,
  );
  if (!workflowRunId) {
    return null;
  }
  const embeddedSteps = readWorkflowSteps(firstArray(record.steps));
  const standaloneSteps = standaloneStepsByRun.get(workflowRunId) ?? [];
  const steps = mergeWorkflowSteps(embeddedSteps, standaloneSteps);
  const embeddedActions = readWorkflowActions(firstArray(record.actions));
  const standaloneActions = actionsByRun.get(workflowRunId) ?? [];
  const status = readString(record.status) || null;
  const finishedAt =
    readString(record.finished_at, record.finishedAt, record.ended_at) || null;
  return {
    workflowRunId,
    workflowKey:
      readString(record.workflow_key, record.workflowKey, record.key) || null,
    workflowTitle:
      readString(record.workflow_title, record.workflowTitle, record.title) ||
      null,
    status,
    appId: readString(record.app_id, record.appId) || null,
    sessionId: readString(record.session_id, record.sessionId) || null,
    workspaceId: readString(record.workspace_id, record.workspaceId) || null,
    turnId: readString(record.turn_id, record.turnId) || null,
    taskId: readString(record.task_id, record.taskId) || null,
    taskKind: readString(record.task_kind, record.taskKind) || null,
    selectedObjectRef:
      firstRecord(record.selected_object_ref, record.selectedObjectRef) ?? null,
    primaryArtifactRef:
      firstRecord(record.primary_artifact_ref, record.primaryArtifactRef) ??
      null,
    eventCount: readNumber(record.event_count, record.eventCount) ?? null,
    startedAt: readString(record.started_at, record.startedAt) || null,
    updatedAt: readString(record.updated_at, record.updatedAt) || null,
    finishedAt,
    completedAt: readString(record.completed_at, record.completedAt) || null,
    failedAt:
      readString(record.failed_at, record.failedAt) ||
      (status === "failed" ? finishedAt : null),
    stepCounts: firstRecord(record.step_counts, record.stepCounts) ?? null,
    artifactRefs: readStringList(record.artifact_refs, record.artifactRefs),
    evidenceRefs: readStringList(record.evidence_refs, record.evidenceRefs),
    failure: firstRecord(record.failure) ?? null,
    retry: firstRecord(record.retry) ?? null,
    actions: mergeWorkflowActions(embeddedActions, standaloneActions),
    steps,
  };
}

function readWorkflowSteps(value: unknown): WorkspaceArticleWorkflowStep[] {
  return readArray(value)
    .map(readWorkflowStep)
    .filter((item): item is WorkspaceArticleWorkflowStep => Boolean(item))
    .sort(compareWorkflowSteps);
}

function readWorkflowStep(value: unknown): WorkspaceArticleWorkflowStep | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.step_id, record.stepId, record.id);
  if (!id) {
    return null;
  }
  const status = readString(record.status) || null;
  const finishedAt =
    readString(record.finished_at, record.finishedAt, record.ended_at) || null;
  return {
    workflowRunId:
      readString(record.workflow_run_id, record.workflowRunId) || "",
    workflowKey: readString(record.workflow_key, record.workflowKey) || null,
    id,
    title: readString(record.step_title, record.stepTitle, record.title) || id,
    index:
      readNumber(record.step_index, record.stepIndex, record.index) ?? null,
    stepCount:
      readNumber(record.step_count, record.stepCount, record.count) ?? null,
    status,
    attempt: readNumber(record.attempt) ?? null,
    subagent:
      readString(record.subagent, record.sub_agent, record.owner) || null,
    skillRefs: readStringList(record.skill_refs, record.skillRefs),
    expectedOutput:
      readString(
        record.expected_output,
        record.expectedOutput,
        record.outputKind,
        record.output_kind,
      ) || null,
    progressMessage:
      readString(record.progress_message, record.progressMessage) || null,
    detail: firstRecord(record.detail) ?? null,
    output: firstRecord(record.output) ?? null,
    eventCount: readNumber(record.event_count, record.eventCount) ?? null,
    startedAt: readString(record.started_at, record.startedAt) || null,
    updatedAt: readString(record.updated_at, record.updatedAt) || null,
    finishedAt,
    completedAt: readString(record.completed_at, record.completedAt) || null,
    failedAt:
      readString(record.failed_at, record.failedAt) ||
      (status === "failed" ? finishedAt : null),
    toolCallIds: readStringList(record.tool_call_ids, record.toolCallIds),
    artifactRefs: readStringList(record.artifact_refs, record.artifactRefs),
    evidenceRefs: readStringList(record.evidence_refs, record.evidenceRefs),
    failure: firstRecord(record.failure) ?? null,
    retry: firstRecord(record.retry) ?? null,
    response: firstRecord(record.response) ?? null,
    requestId: readString(record.request_id, record.requestId) || null,
    agentActionType:
      readString(record.agent_action_type, record.agentActionType) || null,
  };
}

function mergeWorkflowSteps(
  embeddedSteps: WorkspaceArticleWorkflowStep[],
  standaloneSteps: WorkspaceArticleWorkflowStep[],
): WorkspaceArticleWorkflowStep[] {
  const byId = new Map<string, WorkspaceArticleWorkflowStep>();
  for (const step of embeddedSteps) {
    byId.set(step.id, step);
  }
  for (const step of standaloneSteps) {
    const previous = byId.get(step.id);
    byId.set(step.id, previous ? mergeWorkflowStep(previous, step) : step);
  }
  return Array.from(byId.values()).sort(compareWorkflowSteps);
}

function mergeWorkflowStep(
  previous: WorkspaceArticleWorkflowStep,
  next: WorkspaceArticleWorkflowStep,
): WorkspaceArticleWorkflowStep {
  return {
    ...previous,
    ...next,
    workflowRunId: next.workflowRunId || previous.workflowRunId,
    workflowKey: next.workflowKey ?? previous.workflowKey,
    title: next.title || previous.title,
    index: next.index ?? previous.index,
    stepCount: next.stepCount ?? previous.stepCount,
    status: next.status ?? previous.status,
    attempt: next.attempt ?? previous.attempt,
    subagent: next.subagent ?? previous.subagent,
    skillRefs: next.skillRefs.length > 0 ? next.skillRefs : previous.skillRefs,
    expectedOutput: next.expectedOutput ?? previous.expectedOutput,
    progressMessage: next.progressMessage ?? previous.progressMessage,
    detail: next.detail ?? previous.detail,
    output: next.output ?? previous.output,
    eventCount: next.eventCount ?? previous.eventCount,
    startedAt: next.startedAt ?? previous.startedAt,
    updatedAt: next.updatedAt ?? previous.updatedAt,
    finishedAt: next.finishedAt ?? previous.finishedAt,
    completedAt: next.completedAt ?? previous.completedAt,
    failedAt: next.failedAt ?? previous.failedAt,
    toolCallIds:
      next.toolCallIds.length > 0 ? next.toolCallIds : previous.toolCallIds,
    artifactRefs:
      next.artifactRefs.length > 0 ? next.artifactRefs : previous.artifactRefs,
    evidenceRefs:
      next.evidenceRefs.length > 0 ? next.evidenceRefs : previous.evidenceRefs,
    failure: next.failure ?? previous.failure,
    retry: next.retry ?? previous.retry,
    response: next.response ?? previous.response,
    requestId: next.requestId ?? previous.requestId,
    agentActionType: next.agentActionType ?? previous.agentActionType,
  };
}

function readWorkflowActions(value: unknown): WorkspaceArticleWorkflowAction[] {
  return readArray(value)
    .map(readWorkflowAction)
    .filter((item): item is WorkspaceArticleWorkflowAction => Boolean(item));
}

function readWorkflowAction(
  value: unknown,
): WorkspaceArticleWorkflowAction | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const workflowRunId = readString(
    record.workflow_run_id,
    record.workflowRunId,
  );
  const actionType = readString(
    record.action_type,
    record.actionType,
    record.type,
  );
  if (!workflowRunId || !actionType) {
    return null;
  }
  return {
    workflowRunId,
    actionType,
    stepId: readString(record.step_id, record.stepId) || null,
    requestId: readString(record.request_id, record.requestId) || null,
    agentActionType:
      readString(record.agent_action_type, record.agentActionType) || null,
  };
}

function mergeWorkflowActions(
  embeddedActions: WorkspaceArticleWorkflowAction[],
  standaloneActions: WorkspaceArticleWorkflowAction[],
): WorkspaceArticleWorkflowAction[] {
  const byKey = new Map<string, WorkspaceArticleWorkflowAction>();
  for (const action of [...embeddedActions, ...standaloneActions]) {
    const key = [
      action.workflowRunId,
      action.actionType,
      action.stepId ?? "",
      action.requestId ?? "",
      action.agentActionType ?? "",
    ].join(":");
    byKey.set(key, action);
  }
  return Array.from(byKey.values());
}

function groupStepsByRun(
  steps: WorkspaceArticleWorkflowStep[],
): Map<string, WorkspaceArticleWorkflowStep[]> {
  const grouped = new Map<string, WorkspaceArticleWorkflowStep[]>();
  for (const step of steps) {
    if (!step.workflowRunId) {
      continue;
    }
    const current = grouped.get(step.workflowRunId) ?? [];
    current.push(step);
    grouped.set(step.workflowRunId, current);
  }
  for (const [runId, items] of grouped.entries()) {
    grouped.set(runId, items.sort(compareWorkflowSteps));
  }
  return grouped;
}

function groupActionsByRun(
  actions: WorkspaceArticleWorkflowAction[],
): Map<string, WorkspaceArticleWorkflowAction[]> {
  const grouped = new Map<string, WorkspaceArticleWorkflowAction[]>();
  for (const action of actions) {
    const current = grouped.get(action.workflowRunId) ?? [];
    current.push(action);
    grouped.set(action.workflowRunId, current);
  }
  return grouped;
}

function compareWorkflowRuns(
  left: WorkspaceArticleWorkflowRun,
  right: WorkspaceArticleWorkflowRun,
): number {
  return (
    dateValue(right.updatedAt ?? right.startedAt) -
      dateValue(left.updatedAt ?? left.startedAt) ||
    left.workflowRunId.localeCompare(right.workflowRunId)
  );
}

function compareWorkflowSteps(
  left: WorkspaceArticleWorkflowStep,
  right: WorkspaceArticleWorkflowStep,
): number {
  return (
    (left.index ?? Number.MAX_SAFE_INTEGER) -
      (right.index ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}

function latestUpdatedAt(steps: WorkspaceArticleWorkflowStep[]): string | null {
  return (
    steps
      .map((step) => step.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => dateValue(right) - dateValue(left))[0] ?? null
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readStringList(...values: unknown[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const item of readArray(value)) {
      const text = readString(
        item,
        asRecord(item)?.id,
        asRecord(item)?.key,
        asRecord(item)?.name,
        asRecord(item)?.title,
      );
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      items.push(text);
    }
  }
  return items;
}

function dateValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
