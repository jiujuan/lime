import type {
  PluginProvenance,
  PluginTaskRecord,
  PluginTaskRequest,
  PluginTaskStatus,
  PluginTaskStreamEvent,
  PluginTaskEventType,
} from "../types";

export interface BuildPluginTaskRecordParams {
  taskId: string;
  traceId: string;
  appId: string;
  entryKey?: string;
  retryOfTaskId?: string;
  retryAttempt?: number;
  request: PluginTaskRequest;
  provenance: PluginProvenance;
  now: string;
  startMessage: string;
}

export interface BuildRetryPluginTaskRecordParams {
  taskId: string;
  traceId: string;
  sourceTask: PluginTaskRecord;
  provenance: PluginProvenance;
  now: string;
  startMessage: string;
}

export interface AppendPluginTaskEventParams {
  type: PluginTaskEventType;
  status?: PluginTaskStatus;
  message?: string;
  payload?: unknown;
  refs?: string[];
  at: string;
}

function nonEmptyString(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

export function buildPluginTaskRecord({
  taskId,
  traceId,
  appId,
  entryKey,
  retryOfTaskId,
  retryAttempt,
  request,
  provenance,
  now,
  startMessage,
}: BuildPluginTaskRecordParams): PluginTaskRecord {
  const title = nonEmptyString(request.title, "Plugin task");
  const prompt = nonEmptyString(request.prompt, title);
  const initialEvent: PluginTaskStreamEvent = {
    eventId: `${taskId}:event-1`,
    taskId,
    traceId,
    type: "task:status",
    status: "running",
    at: now,
    message: startMessage,
  };

  const task: PluginTaskRecord = {
    taskId,
    traceId,
    appId,
    entryKey,
    title,
    prompt,
    taskKind: nonEmptyString(request.taskKind, "agent_task"),
    idempotencyKey: nonEmptyString(
      request.idempotencyKey,
      `${entryKey ?? appId}:${title}`,
    ),
    input: request.input ?? { prompt },
    expectedOutput: request.expectedOutput,
    knowledge: [...(request.knowledge ?? [])],
    tools: normalizeList(request.tools),
    files: normalizeList(request.files),
    secrets: normalizeList(request.secrets),
    humanReview: request.humanReview ?? false,
    status: "running",
    startedAt: now,
    trace: [
      {
        at: now,
        message: startMessage,
      },
    ],
    events: [initialEvent],
    provenance,
  };

  if (retryOfTaskId) {
    task.retryOfTaskId = retryOfTaskId;
  }
  if (retryAttempt !== undefined) {
    task.retryAttempt = retryAttempt;
  }

  return task;
}

export function buildRetryPluginTaskRecord({
  taskId,
  traceId,
  sourceTask,
  provenance,
  now,
  startMessage,
}: BuildRetryPluginTaskRecordParams): PluginTaskRecord {
  const retryAttempt = (sourceTask.retryAttempt ?? 0) + 1;
  return buildPluginTaskRecord({
    taskId,
    traceId,
    appId: sourceTask.appId,
    entryKey: sourceTask.entryKey,
    retryOfTaskId: sourceTask.taskId,
    retryAttempt,
    request: {
      title: sourceTask.title,
      prompt: sourceTask.prompt,
      taskKind: sourceTask.taskKind,
      idempotencyKey: `${sourceTask.idempotencyKey}:retry:${retryAttempt}`,
      input: sourceTask.input,
      expectedOutput: sourceTask.expectedOutput,
      knowledge: [...sourceTask.knowledge],
      tools: [...sourceTask.tools],
      files: [...sourceTask.files],
      secrets: [...sourceTask.secrets],
      humanReview: sourceTask.humanReview,
    },
    provenance,
    now,
    startMessage,
  });
}

export function appendPluginTaskEvent(
  task: PluginTaskRecord,
  params: AppendPluginTaskEventParams,
): PluginTaskRecord {
  const event: PluginTaskStreamEvent = {
    eventId: `${task.taskId}:event-${task.events.length + 1}`,
    taskId: task.taskId,
    traceId: task.traceId,
    type: params.type,
    status: params.status,
    at: params.at,
    message: params.message,
    payload: params.payload,
    refs: params.refs,
  };

  return {
    ...task,
    status: params.status ?? task.status,
    trace: params.message
      ? [
          ...task.trace,
          {
            at: params.at,
            message: params.message,
          },
        ]
      : task.trace,
    events: [...task.events, event],
  };
}
