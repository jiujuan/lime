import type {
  PluginRuntimeTaskEvent,
  PluginRuntimeTaskSnapshot,
} from "@/lib/api/pluginRuntime";
import type {
  PluginTaskEventType,
  PluginTaskHostResponseRequest,
  PluginTaskRecord,
  PluginTaskRequest,
  PluginTaskStatus,
  PluginTaskStreamEvent,
} from "../types";
import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";

export interface RuntimeTaskState {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  entryKey?: string;
  taskId: string;
  traceId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  taskKind: string;
  startedAt: string;
  request: PluginTaskRequest;
  retryOfTaskId?: string;
  retryAttempt?: number;
  latestSnapshot?: PluginRuntimeTaskSnapshot;
}

const RUNTIME_TASK_STORAGE_PREFIX = "agent-runtime/tasks/";

export function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function buildWorkflowResumeMetadata(
  input: PluginTaskHostResponseRequest,
): Record<string, string> | null {
  const workflowRunId = normalizeString(input.workflowRunId);
  const workflowKey = normalizeString(input.workflowKey);
  const stepId = normalizeString(input.stepId);
  if (!workflowRunId || !workflowKey || !stepId) {
    return null;
  }
  return {
    workflowRunId,
    workflowKey,
    stepId,
  };
}

export function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

export function runtimeTaskStorageKey(taskId: string): string {
  return `${RUNTIME_TASK_STORAGE_PREFIX}${taskId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRuntimeTaskState(value: unknown): value is RuntimeTaskState {
  return (
    isRecord(value) &&
    typeof value.appId === "string" &&
    typeof value.appVersion === "string" &&
    typeof value.packageHash === "string" &&
    typeof value.manifestHash === "string" &&
    typeof value.taskId === "string" &&
    typeof value.traceId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.taskKind === "string" &&
    typeof value.startedAt === "string" &&
    isRecord(value.request)
  );
}

export function readPersistedRuntimeTaskState(
  value: unknown,
): RuntimeTaskState | null {
  if (isRecord(value) && isRuntimeTaskState(value.state)) {
    return value.state;
  }
  return isRuntimeTaskState(value) ? value : null;
}

function mapRuntimeTaskStatus(status: string | undefined): PluginTaskStatus {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return "running";
  }
  if (
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "complete"
  ) {
    return "succeeded";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  if (
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "error" ||
    normalized === "timeout"
  ) {
    return "failed";
  }
  return "running";
}

function mapRuntimeEventType(eventType: string): PluginTaskEventType {
  if (
    eventType === "task:queued" ||
    eventType === "task:status" ||
    eventType === "task:progress" ||
    eventType === "task:toolCall" ||
    eventType === "task:citation" ||
    eventType === "task:partialArtifact" ||
    eventType === "task:blocked" ||
    eventType === "task:missingContextRequested" ||
    eventType === "task:reviewRequested" ||
    eventType === "task:error" ||
    eventType === "task:cancelled" ||
    eventType === "task:completed" ||
    eventType === "task:incident" ||
    eventType === "artifact:created" ||
    eventType === "evidence:recorded" ||
    eventType === "evidence:verified"
  ) {
    return eventType;
  }
  return "task:progress";
}

function buildStartEvent(state: RuntimeTaskState): PluginTaskStreamEvent {
  return {
    eventId: `${state.taskId}:accepted`,
    taskId: state.taskId,
    traceId: state.traceId,
    type: "task:queued",
    status: "running",
    at: state.startedAt,
    message: "Lime AgentRuntime 已接收 Plugin 任务。",
    payload: {
      sessionId: state.sessionId,
      turnId: state.turnId,
    },
  };
}

function mapRuntimeEvent(
  state: RuntimeTaskState,
  event: PluginRuntimeTaskEvent,
  index: number,
): PluginTaskStreamEvent {
  const streamEvent: PluginTaskStreamEvent = {
    eventId: event.id || `${state.taskId}:runtime:${index + 1}`,
    taskId: state.taskId,
    traceId: state.traceId,
    type: mapRuntimeEventType(event.eventType),
    status: mapRuntimeTaskStatus(event.status),
    at: event.occurredAt ?? state.startedAt,
    message: event.message,
    payload: event.payload ?? {
      runtimeEvent: event,
    },
  };
  if (event.evidenceRef) {
    streamEvent.refs = [event.evidenceRef];
  }
  if (event.artifactRef) {
    streamEvent.refs = [...(streamEvent.refs ?? []), event.artifactRef];
  }
  return streamEvent;
}

function readRecordString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readThreadReadArtifacts(
  threadRead: unknown,
): Record<string, unknown>[] {
  if (!isRecord(threadRead) || !Array.isArray(threadRead.artifacts)) {
    return [];
  }
  return threadRead.artifacts.filter(isRecord);
}

function readThreadReadToolCalls(
  threadRead: unknown,
): Record<string, unknown>[] {
  if (!isRecord(threadRead)) {
    return [];
  }
  const nestedThreadRead =
    (isRecord(threadRead.thread_read) && threadRead.thread_read) ||
    (isRecord(threadRead.threadRead) && threadRead.threadRead) ||
    null;
  return [
    ...readRecordArray(threadRead, "tool_calls"),
    ...readRecordArray(threadRead, "toolCalls"),
    ...(nestedThreadRead
      ? readRecordArray(nestedThreadRead, "tool_calls")
      : []),
    ...(nestedThreadRead ? readRecordArray(nestedThreadRead, "toolCalls") : []),
  ];
}

function readRecordArray(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const item = value[key];
  return Array.isArray(item) ? item.filter(isRecord) : [];
}

function readRecordBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const item = value[key];
  return typeof item === "boolean" ? item : undefined;
}

function readFirstRecordString(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const item = readRecordString(value, key);
    if (item) {
      return item;
    }
  }
  return undefined;
}

function readFirstRecordValue(
  value: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      return value[key];
    }
  }
  return undefined;
}

function repairUnescapedStringQuotes(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (!inString) {
        inString = true;
        output += char;
        continue;
      }
      const next = value.slice(index + 1).match(/\S/)?.[0];
      if (!next || [",", "}", "]", ":"].includes(next)) {
        inString = false;
        output += char;
      } else {
        output += `\\"`;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function parseJsonRecordCandidate(
  candidate: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const repaired = repairUnescapedStringQuotes(candidate);
    if (repaired === candidate) {
      return null;
    }
    try {
      const parsed = JSON.parse(repaired);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseJsonObjectFromMarkdown(
  value: string,
): Record<string, unknown> | null {
  const trimmed = value.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed
        .split("\n")
        .slice(1)
        .join("\n")
        .replace(/```\s*$/m, "")
        .trim()
    : trimmed;
  const parsed = parseJsonRecordCandidate(candidate);
  if (parsed) {
    return parsed;
  }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return parseJsonRecordCandidate(candidate.slice(start, end + 1));
}

function hasContentFactoryWorkspacePatchFields(
  value: Record<string, unknown>,
): boolean {
  return [
    "workspace",
    "project",
    "sceneTable",
    "contentBatch",
    "scripts",
    "imagePrompts",
    "assetPack",
    "projectKnowledge",
  ].some((key) => isRecord(value[key]) || Array.isArray(value[key]));
}

function extractContentFactoryWorkspacePatch(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of ["contentFactoryWorkspacePatch", "workspacePatch"]) {
    const patch = value[key];
    if (isRecord(patch)) {
      return patch;
    }
  }
  const kind =
    readRecordString(value, "kind") ?? readRecordString(value, "artifactKind");
  if (
    kind === "content_factory.workspace_patch" ||
    kind === "contentFactoryWorkspacePatch" ||
    kind === "workspacePatch" ||
    hasContentFactoryWorkspacePatchFields(value)
  ) {
    return value;
  }
  return undefined;
}

function extractWorkspacePatchFromArtifactDocument(
  artifactDocument: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(artifactDocument) || !Array.isArray(artifactDocument.blocks)) {
    return undefined;
  }
  for (const block of artifactDocument.blocks) {
    if (!isRecord(block)) {
      continue;
    }
    const content =
      typeof block.content === "string"
        ? block.content
        : typeof block.markdown === "string"
          ? block.markdown
          : "";
    const parsed = content ? parseJsonObjectFromMarkdown(content) : null;
    const patch = extractContentFactoryWorkspacePatch(parsed);
    if (patch) {
      return patch;
    }
  }
  return undefined;
}

function buildRuntimeArtifactReplayEvents(
  state: RuntimeTaskState,
  threadRead: unknown,
  existingEvents: PluginTaskStreamEvent[],
): PluginTaskStreamEvent[] {
  const artifacts = readThreadReadArtifacts(threadRead);
  if (!artifacts.length) {
    return [];
  }
  const existingArtifactRefs = new Set(
    existingEvents.flatMap((event) => event.refs ?? []),
  );
  return artifacts.flatMap((artifact, index) => {
    const artifactRef =
      readRecordString(artifact, "path") ??
      readRecordString(artifact, "item_id") ??
      readRecordString(artifact, "id") ??
      `artifact:${index + 1}`;
    if (existingArtifactRefs.has(artifactRef)) {
      return [];
    }
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    const artifactDocument =
      isRecord(metadata.artifactDocument) ||
      isRecord(metadata.artifact_document)
        ? (metadata.artifactDocument ?? metadata.artifact_document)
        : undefined;
    const workspacePatch =
      isRecord(metadata.workspacePatch) ||
      isRecord(metadata.contentFactoryWorkspacePatch)
        ? (metadata.workspacePatch ?? metadata.contentFactoryWorkspacePatch)
        : extractWorkspacePatchFromArtifactDocument(artifactDocument);
    const at =
      readRecordString(artifact, "completed_at") ??
      readRecordString(artifact, "updated_at") ??
      readRecordString(artifact, "created_at") ??
      state.startedAt;
    const artifactEvent: PluginTaskStreamEvent = {
      eventId: `${state.taskId}:artifact:${artifactRef}`,
      taskId: state.taskId,
      traceId: state.traceId,
      type: "artifact:created",
      status: "succeeded",
      at,
      message:
        readRecordString(artifact, "title") ??
        readRecordString(artifact, "artifact_type") ??
        "Artifact 已创建",
      refs: [artifactRef],
      payload: {
        artifact,
        artifactDocument,
        workspacePatch,
        contentFactoryWorkspacePatch: workspacePatch,
      },
    };
    if (!workspacePatch) {
      return [artifactEvent];
    }
    return [
      artifactEvent,
      {
        eventId: `${state.taskId}:evidence:${artifactRef}`,
        taskId: state.taskId,
        traceId: state.traceId,
        type: "evidence:recorded",
        status: "succeeded",
        at,
        message: "内容工厂 workspace patch evidence 已记录",
        refs: [`evidence:${artifactRef}`],
        payload: {
          artifactRef,
          workspacePatch,
          contentFactoryWorkspacePatch: workspacePatch,
          source: "app_server_artifact_replay",
        },
      },
    ];
  });
}

function buildRuntimeToolCallReplayEvents(
  state: RuntimeTaskState,
  threadRead: unknown,
  existingEvents: PluginTaskStreamEvent[],
): PluginTaskStreamEvent[] {
  const toolCalls = readThreadReadToolCalls(threadRead);
  if (!toolCalls.length) {
    return [];
  }
  const existingToolKeys = new Set(
    existingEvents
      .filter((event) => event.type === "task:toolCall")
      .flatMap((event) => {
        const payload = isRecord(event.payload) ? event.payload : {};
        const runtimeEvent = isRecord(payload.runtimeEvent)
          ? payload.runtimeEvent
          : {};
        const toolCall = isRecord(payload.toolCall) ? payload.toolCall : {};
        return [
          event.eventId,
          readFirstRecordString(toolCall, ["id", "tool_call_id", "toolCallId"]),
          readFirstRecordString(runtimeEvent, [
            "id",
            "tool_call_id",
            "toolCallId",
          ]),
        ];
      })
      .filter((item): item is string => Boolean(item)),
  );

  return toolCalls.flatMap((toolCall, index) => {
    const id =
      readFirstRecordString(toolCall, ["id", "tool_call_id", "toolCallId"]) ??
      `${state.taskId}:tool:${index + 1}`;
    const eventId = `${state.taskId}:tool:${id}`;
    if (existingToolKeys.has(id) || existingToolKeys.has(eventId)) {
      return [];
    }
    const toolName =
      readFirstRecordString(toolCall, ["tool_name", "toolName", "name"]) ??
      "未命名工具";
    const status = mapRuntimeTaskStatus(
      readFirstRecordString(toolCall, ["status", "state"]),
    );
    const rawOutput = readFirstRecordValue(toolCall, [
      "output_preview",
      "outputPreview",
      "output",
      "result",
      "text",
      "content",
    ]);
    const outputPreview =
      typeof rawOutput === "string"
        ? rawOutput
        : rawOutput === undefined
          ? undefined
          : JSON.stringify(rawOutput);
    const error = readFirstRecordValue(toolCall, ["error", "failure"]);
    const success =
      readRecordBoolean(toolCall, "success") ??
      (status === "failed" ? false : status === "succeeded" ? true : undefined);
    const at =
      readFirstRecordString(toolCall, [
        "timestamp",
        "occurredAt",
        "occurred_at",
        "completed_at",
        "started_at",
      ]) ?? state.startedAt;
    return [
      {
        eventId,
        taskId: state.taskId,
        traceId: state.traceId,
        type: "task:toolCall",
        status,
        at,
        message: outputPreview
          ? `工具 ${toolName} 已回写：${outputPreview}`
          : `工具 ${toolName} 状态已回写`,
        refs: [`tool:${id}`],
        payload: {
          source: "app_server_tool_call_replay",
          toolCall,
          toolName,
          outputPreview,
          success,
          error,
          runtimeEvent: {
            type:
              status === "failed"
                ? "tool.failed"
                : status === "running"
                  ? "tool.started"
                  : "tool.result",
            id,
            toolName,
            tool_name: toolName,
            status,
            output: outputPreview,
            success,
            error,
          },
        },
      },
    ];
  });
}

export function buildTaskRecord(
  state: RuntimeTaskState,
  snapshot?: PluginRuntimeTaskSnapshot,
): PluginTaskRecord {
  const effectiveSnapshot = snapshot ?? state.latestSnapshot;
  const runtimeEvents = effectiveSnapshot?.taskEvents.length
    ? effectiveSnapshot.taskEvents.map((event, index) =>
        mapRuntimeEvent(state, event, index),
      )
    : [buildStartEvent(state)];
  const toolReplayEvents = effectiveSnapshot
    ? buildRuntimeToolCallReplayEvents(
        state,
        effectiveSnapshot.threadRead,
        runtimeEvents,
      )
    : [];
  const events = effectiveSnapshot
    ? [
        ...runtimeEvents,
        ...toolReplayEvents,
        ...buildRuntimeArtifactReplayEvents(
          state,
          effectiveSnapshot.threadRead,
          [...runtimeEvents, ...toolReplayEvents],
        ),
      ]
    : runtimeEvents;
  const status = effectiveSnapshot
    ? mapRuntimeTaskStatus(effectiveSnapshot.taskStatus)
    : "running";
  const finishedAt =
    status === "succeeded" || status === "failed" || status === "cancelled"
      ? events[events.length - 1]?.at
      : undefined;
  const runtimeProcess = buildAgentRuntimeProcessView({
    events,
    task: {
      status,
      taskStatus: effectiveSnapshot?.taskStatus,
      input: state.request.input,
      expectedOutput: state.request.expectedOutput,
    },
    snapshot: effectiveSnapshot,
    expectedOutput: state.request.expectedOutput,
    lastInput: state.request.input,
  });

  return {
    taskId: state.taskId,
    traceId: state.traceId,
    sessionId: state.sessionId,
    turnId: state.turnId,
    workspaceId: state.workspaceId,
    appId: state.appId,
    entryKey: state.entryKey,
    retryOfTaskId: state.retryOfTaskId,
    retryAttempt: state.retryAttempt,
    title: normalizeString(state.request.title) ?? "Plugin 任务",
    prompt:
      normalizeString(state.request.prompt) ??
      normalizeString(state.request.title) ??
      "Plugin 任务",
    taskKind: state.taskKind,
    idempotencyKey:
      normalizeString(state.request.idempotencyKey) ??
      `${state.entryKey ?? state.appId}:${state.taskKind}`,
    input: state.request.input,
    expectedOutput: state.request.expectedOutput,
    knowledge: [...(state.request.knowledge ?? [])],
    tools: normalizeList(state.request.tools),
    files: normalizeList(state.request.files),
    secrets: normalizeList(state.request.secrets),
    humanReview: state.request.humanReview ?? false,
    status,
    startedAt: state.startedAt,
    finishedAt,
    cancelledAt: status === "cancelled" ? finishedAt : undefined,
    result: effectiveSnapshot?.threadRead,
    trace: events
      .filter((event) => event.message)
      .map((event) => ({
        at: event.at,
        message: event.message ?? "",
      })),
    events,
    runtimeProcess,
    process: runtimeProcess,
    provenance: {
      sourceKind: "plugin",
      appId: state.appId,
      appVersion: state.appVersion,
      packageHash: state.packageHash,
      manifestHash: state.manifestHash,
      entryKey: state.entryKey,
      workspaceId: state.workspaceId,
      taskId: state.taskId,
    },
  };
}

export function readLatestTurnId(threadRead: unknown): string | undefined {
  if (!isRecord(threadRead)) {
    return undefined;
  }
  const direct =
    readRecordString(threadRead, "turnId") ??
    readRecordString(threadRead, "turn_id");
  if (direct) {
    return direct;
  }
  const turns = Array.isArray(threadRead.turns) ? threadRead.turns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!isRecord(turn)) {
      continue;
    }
    const turnId =
      readRecordString(turn, "turnId") ??
      readRecordString(turn, "turn_id") ??
      readRecordString(turn, "id");
    if (turnId) {
      return turnId;
    }
  }
  return undefined;
}

export function buildRetryRequest(
  source: RuntimeTaskState,
  retryAttempt: number,
): PluginTaskRequest {
  return {
    ...source.request,
    idempotencyKey: `${
      normalizeString(source.request.idempotencyKey) ??
      `${source.entryKey ?? source.appId}:${source.taskKind}`
    }:retry:${retryAttempt}`,
  };
}
