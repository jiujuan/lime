import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";

import type {
  AgentAppRuntimeStartTaskRequest,
  AgentAppRuntimeTaskEvent,
  AgentAppRuntimeTaskSnapshot,
} from "@/lib/api/agentAppRuntime";
import type { AgentRuntimeRespondActionRequest } from "@/lib/api/agentRuntime/types";
import { getOrCreateDefaultProject } from "@/lib/api/project";
import type {
  AgentAppTaskLookup,
  CapabilityHost,
  LimeAgentCapability,
  LimeAppSdk,
} from "../sdk/CapabilityHost";
import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppProvenanceQuery,
  AgentAppRunResult,
  AgentAppStorageEntry,
  AgentAppTaskEventType,
  AgentAppTaskHostResponseRequest,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppTaskRequest,
  AgentAppTaskStatus,
  AgentAppTaskStreamEvent,
  AgentAppUninstallResult,
  AppCleanupPlan,
} from "../types";
import {
  createAgentAppRuntimeCapabilityApiFromClient,
} from "./agentRuntimeClientApi";
import {
  createFailClosedAgentAppRuntimeCapabilityApi,
  type AgentAppRuntimeCapabilityApi,
} from "./agentRuntimeCapabilityApi";
import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";

export type { AgentAppRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export interface AgentRuntimeCapabilityHostOptions {
  delegate: CapabilityHost;
  appId: string;
  appVersion?: string;
  packageHash?: string;
  manifestHash?: string;
  workspaceId?: string;
  workspaceIdResolver?: () => Promise<string>;
  api?: AgentAppRuntimeCapabilityApi;
  runtimeClient?: Pick<
    AgentRuntimeClient,
    "startTurn" | "readThread" | "cancelTurn" | "respondAction"
  >;
  ensureSession?: AgentRuntimeSessionResolver;
  now?: () => string;
}

interface RuntimeTaskState {
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
  request: AgentAppTaskRequest;
  retryOfTaskId?: string;
  retryAttempt?: number;
  latestSnapshot?: AgentAppRuntimeTaskSnapshot;
}

const RUNTIME_TASK_STORAGE_PREFIX = "agent-runtime/tasks/";

type RuntimeAgentTaskRequest = AgentAppTaskRequest & {
  taskId?: string;
  turnId?: string;
  eventName?: string;
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
  providerPreference?: string;
  modelPreference?: string;
  turnConfig?: AgentAppRuntimeStartTaskRequest["turnConfig"];
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
};

export interface AgentRuntimeSessionRequest {
  appId: string;
  entryKey?: string;
  workspaceId: string;
  taskId?: string;
  taskKind: string;
  title?: string;
  prompt?: string;
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeSessionResolver = (
  request: AgentRuntimeSessionRequest,
) => Promise<string>;

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function runtimeTaskStorageKey(taskId: string): string {
  return `${RUNTIME_TASK_STORAGE_PREFIX}${taskId}`;
}

function createRuntimeTaskId(): string {
  return `agent-app-task-${Date.now()}`;
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

function readPersistedRuntimeTaskState(
  value: unknown,
): RuntimeTaskState | null {
  if (isRecord(value) && isRuntimeTaskState(value.state)) {
    return value.state;
  }
  return isRuntimeTaskState(value) ? value : null;
}

function mapRuntimeTaskStatus(status: string | undefined): AgentAppTaskStatus {
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

function mapRuntimeEventType(eventType: string): AgentAppTaskEventType {
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

function buildStartEvent(state: RuntimeTaskState): AgentAppTaskStreamEvent {
  return {
    eventId: `${state.taskId}:accepted`,
    taskId: state.taskId,
    traceId: state.traceId,
    type: "task:queued",
    status: "running",
    at: state.startedAt,
    message: "Lime AgentRuntime 已接收 Agent App 任务。",
    payload: {
      sessionId: state.sessionId,
      turnId: state.turnId,
    },
  };
}

function mapRuntimeEvent(
  state: RuntimeTaskState,
  event: AgentAppRuntimeTaskEvent,
  index: number,
): AgentAppTaskStreamEvent {
  const streamEvent: AgentAppTaskStreamEvent = {
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
  existingEvents: AgentAppTaskStreamEvent[],
): AgentAppTaskStreamEvent[] {
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
    const artifactEvent: AgentAppTaskStreamEvent = {
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
  existingEvents: AgentAppTaskStreamEvent[],
): AgentAppTaskStreamEvent[] {
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

function buildTaskRecord(
  state: RuntimeTaskState,
  snapshot?: AgentAppRuntimeTaskSnapshot,
): AgentAppTaskRecord {
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
    title: normalizeString(state.request.title) ?? "Agent App 任务",
    prompt:
      normalizeString(state.request.prompt) ??
      normalizeString(state.request.title) ??
      "Agent App 任务",
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
      sourceKind: "agent_app",
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

function readRuntimeRequest(
  input: AgentAppTaskRequest,
): RuntimeAgentTaskRequest {
  return input as RuntimeAgentTaskRequest;
}

function normalizeTaskLookup(
  task: string | AgentAppTaskLookup,
): AgentAppTaskLookup {
  return typeof task === "string" ? { taskId: task } : task;
}

function readLatestTurnId(threadRead: unknown): string | undefined {
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

function buildRetryRequest(
  source: RuntimeTaskState,
  retryAttempt: number,
): AgentAppTaskRequest {
  return {
    ...source.request,
    idempotencyKey: `${
      normalizeString(source.request.idempotencyKey) ??
      `${source.entryKey ?? source.appId}:${source.taskKind}`
    }:retry:${retryAttempt}`,
  };
}

export class AgentRuntimeCapabilityHost implements CapabilityHost {
  private readonly delegate: CapabilityHost;
  private readonly appId: string;
  private readonly appVersion: string;
  private readonly packageHash: string;
  private readonly manifestHash: string;
  private readonly workspaceId?: string;
  private readonly workspaceIdResolver: () => Promise<string>;
  private readonly api: AgentAppRuntimeCapabilityApi;
  private readonly ensureSession?: AgentRuntimeSessionResolver;
  private readonly now: () => string;
  private readonly tasks = new Map<string, RuntimeTaskState>();

  constructor(options: AgentRuntimeCapabilityHostOptions) {
    this.delegate = options.delegate;
    this.appId = options.appId;
    this.appVersion = options.appVersion ?? "";
    this.packageHash = options.packageHash ?? "";
    this.manifestHash = options.manifestHash ?? "";
    this.workspaceId = options.workspaceId;
    this.workspaceIdResolver =
      options.workspaceIdResolver ??
      (async () => (await getOrCreateDefaultProject()).id);
    this.now = options.now ?? (() => new Date().toISOString());
    this.ensureSession = options.ensureSession;
    this.api =
      options.api ??
      (options.runtimeClient
        ? createAgentAppRuntimeCapabilityApiFromClient(options.runtimeClient, {
            now: this.now,
          })
        : createFailClosedAgentAppRuntimeCapabilityApi());
  }

  createSdkContext(entryKey: string, runId?: string): LimeAppSdk {
    const sdk = this.delegate.createSdkContext(entryKey, runId);
    return {
      ...sdk,
      agent: this.createAgentCapability(entryKey),
    };
  }

  runEntry(entryKey: string): Promise<AgentAppRunResult> {
    return this.delegate.runEntry(entryKey);
  }

  getArtifacts(query?: AgentAppProvenanceQuery): AgentAppArtifactRecord[] {
    return this.delegate.getArtifacts(query);
  }

  getEvidence(query?: AgentAppProvenanceQuery): AgentAppEvidenceRecord[] {
    return this.delegate.getEvidence(query);
  }

  getStorageEntries(query?: AgentAppProvenanceQuery): AgentAppStorageEntry[] {
    return this.delegate.getStorageEntries(query);
  }

  getTasks(query?: AgentAppProvenanceQuery): AgentAppTaskRecord[] {
    const runtimeStates = new Map<string, RuntimeTaskState>();
    for (const task of this.listPersistedRuntimeTaskStates(query)) {
      runtimeStates.set(task.taskId, task);
    }
    for (const task of this.tasks.values()) {
      runtimeStates.set(task.taskId, task);
    }
    const runtimeTasks = Array.from(runtimeStates.values())
      .filter((task) => !query?.appId || task.appId === query.appId)
      .map((task) => buildTaskRecord(task));
    return [...this.delegate.getTasks(query), ...runtimeTasks];
  }

  uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<AgentAppUninstallResult> {
    return this.delegate.uninstall(params);
  }

  private createAgentCapability(entryKey: string): LimeAgentCapability {
    return {
      startTask: (input) => this.startRuntimeTask(entryKey, input),
      streamTask: async (taskLookup) => {
        const task = await this.getRuntimeTask(entryKey, taskLookup);
        return task?.events ?? [];
      },
      getTask: (taskLookup) => this.getRuntimeTask(entryKey, taskLookup),
      cancelTask: (taskLookup) => this.cancelRuntimeTask(taskLookup),
      retryTask: (taskLookup) => this.retryRuntimeTask(entryKey, taskLookup),
      submitHostResponse: (input) => this.submitRuntimeHostResponse(input),
      listTasks: async () => this.getTasks({ appId: this.appId }),
    };
  }

  private async resolveWorkspaceId(
    request: RuntimeAgentTaskRequest,
  ): Promise<string> {
    return (
      normalizeString(request.workspaceId) ??
      normalizeString(this.workspaceId) ??
      (await this.workspaceIdResolver())
    );
  }

  private async startRuntimeTask(
    entryKey: string,
    input: AgentAppTaskRequest,
    retry?: { retryOfTaskId: string; retryAttempt: number; sessionId?: string },
  ): Promise<AgentAppTaskRecord> {
    const runtimeRequest = readRuntimeRequest(input);
    const taskKind =
      normalizeString(runtimeRequest.taskKind) ?? "agent_app.task";
    const workspaceId = await this.resolveWorkspaceId(runtimeRequest);
    const requiredCapabilities = normalizeList(
      runtimeRequest.requiredCapabilities,
    );
    const capabilityHints = normalizeList([
      ...(runtimeRequest.capabilityHints ?? []),
      ...(runtimeRequest.tools ?? []),
    ]);
    const requestedSessionId =
      normalizeString(runtimeRequest.sessionId) ?? retry?.sessionId;
    const metadata = {
      ...(runtimeRequest.metadata ?? {}),
      agent_app_host_bridge: {
        source: "agent_app_runtime_page",
        retryOfTaskId: retry?.retryOfTaskId,
        retryAttempt: retry?.retryAttempt,
      },
    };
    const taskId =
      normalizeString(runtimeRequest.taskId) ??
      (this.ensureSession ? createRuntimeTaskId() : undefined);
    const sessionId =
      requestedSessionId ??
      (this.ensureSession
        ? await this.ensureSession({
            appId: this.appId,
            entryKey,
            workspaceId,
            taskId,
            taskKind,
            title: runtimeRequest.title,
            prompt: runtimeRequest.prompt,
            input: runtimeRequest.input,
            expectedOutput: runtimeRequest.expectedOutput,
            metadata,
          })
        : undefined);
    const result = await this.api.startTask({
      appId: this.appId,
      entryKey,
      workspaceId,
      sessionId,
      taskId,
      taskKind,
      idempotencyKey: runtimeRequest.idempotencyKey,
      title: runtimeRequest.title,
      prompt: runtimeRequest.prompt,
      input: runtimeRequest.input,
      expectedOutput: runtimeRequest.expectedOutput,
      requiredCapabilities,
      capabilityHints,
      knowledgeBindings: runtimeRequest.knowledge,
      humanReview: runtimeRequest.humanReview,
      eventName: normalizeString(runtimeRequest.eventName),
      turnId: normalizeString(runtimeRequest.turnId),
      providerPreference: runtimeRequest.providerPreference,
      modelPreference: runtimeRequest.modelPreference,
      turnConfig: runtimeRequest.turnConfig,
      queueIfBusy: runtimeRequest.queueIfBusy,
      skipPreSubmitResume: runtimeRequest.skipPreSubmitResume,
      runStartHooks: runtimeRequest.runStartHooks,
      metadata,
    });
    const state: RuntimeTaskState = {
      appId: result.appId,
      appVersion: this.appVersion,
      packageHash: this.packageHash,
      manifestHash: this.manifestHash,
      entryKey: result.entryKey ?? entryKey,
      taskId: result.taskId,
      traceId: result.traceId,
      sessionId: result.sessionId,
      turnId: result.turnId,
      workspaceId,
      taskKind: result.taskKind,
      startedAt: result.submittedAt || this.now(),
      request: {
        ...input,
        taskKind,
        input: runtimeRequest.input,
      },
      retryOfTaskId: retry?.retryOfTaskId,
      retryAttempt: retry?.retryAttempt,
    };
    this.tasks.set(state.taskId, state);
    await this.persistRuntimeTaskState(state);
    return buildTaskRecord(state);
  }

  private async getRuntimeTask(
    entryKey: string,
    taskLookup: string | AgentAppTaskLookup,
  ): Promise<AgentAppTaskRecord | null> {
    const lookup = normalizeTaskLookup(taskLookup);
    const state =
      this.tasks.get(lookup.taskId) ??
      this.loadPersistedRuntimeTaskState(lookup.taskId);
    const sessionId = state?.sessionId ?? normalizeString(lookup.sessionId);
    if (!sessionId) {
      return null;
    }
    const snapshot = await this.api.getTask({
      appId: state?.appId ?? this.appId,
      taskId: state?.taskId ?? lookup.taskId,
      sessionId,
    });
    const nextState =
      state ??
      (await this.buildRuntimeTaskStateFromLookup(entryKey, lookup, snapshot));
    if (
      !nextState.request.expectedOutput &&
      lookup.expectedOutput !== undefined
    ) {
      nextState.request = {
        ...nextState.request,
        expectedOutput: lookup.expectedOutput,
      };
    }
    nextState.latestSnapshot = snapshot;
    this.tasks.set(nextState.taskId, nextState);
    await this.persistRuntimeTaskState(nextState);
    return buildTaskRecord(nextState, snapshot);
  }

  private async buildRuntimeTaskStateFromLookup(
    entryKey: string,
    lookup: AgentAppTaskLookup,
    snapshot: AgentAppRuntimeTaskSnapshot,
  ): Promise<RuntimeTaskState> {
    const taskKind = normalizeString(lookup.taskKind) ?? "agent_app.task";
    const workspaceId =
      normalizeString(lookup.workspaceId) ??
      normalizeString(this.workspaceId) ??
      (await this.workspaceIdResolver());
    return {
      appId: snapshot.appId || this.appId,
      appVersion: this.appVersion,
      packageHash: this.packageHash,
      manifestHash: this.manifestHash,
      entryKey,
      taskId: lookup.taskId,
      traceId: normalizeString(lookup.traceId) ?? lookup.taskId,
      sessionId: normalizeString(lookup.sessionId) ?? snapshot.sessionId,
      turnId:
        normalizeString(lookup.turnId) ??
        readLatestTurnId(snapshot.threadRead) ??
        "",
      workspaceId,
      taskKind,
      startedAt: normalizeString(lookup.startedAt) ?? this.now(),
      request: {
        title: normalizeString(lookup.title) ?? "Agent App 任务",
        taskKind,
        input: lookup.input,
        expectedOutput: lookup.expectedOutput,
      },
    };
  }

  private async cancelRuntimeTask(
    taskLookup: string | AgentAppTaskLookup,
  ): Promise<AgentAppTaskRecord> {
    const taskId = normalizeTaskLookup(taskLookup).taskId;
    const state = await this.requireTask(taskId);
    await this.api.cancelTask({
      appId: state.appId,
      taskId: state.taskId,
      sessionId: state.sessionId,
      turnId: state.turnId,
    });
    const cancelled: AgentAppRuntimeTaskSnapshot = {
      appId: state.appId,
      taskId: state.taskId,
      sessionId: state.sessionId,
      status: "thread_read_available",
      taskStatus: "cancelled",
      taskEvents: [
        {
          id: `${taskId}:cancelled`,
          eventType: "task:cancelled",
          status: "cancelled",
          message: "已向 Lime AgentRuntime 请求取消任务。",
          occurredAt: this.now(),
        },
      ],
      threadRead: null,
    };
    return buildTaskRecord(state, cancelled);
  }

  private async retryRuntimeTask(
    entryKey: string,
    taskLookup: string | AgentAppTaskLookup,
  ): Promise<AgentAppTaskRecord> {
    const taskId = normalizeTaskLookup(taskLookup).taskId;
    const source = await this.requireTask(taskId);
    const retryAttempt = (source.retryAttempt ?? 0) + 1;
    return this.startRuntimeTask(
      entryKey,
      buildRetryRequest(source, retryAttempt),
      {
        retryOfTaskId: source.taskId,
        retryAttempt,
        sessionId: source.sessionId,
      },
    );
  }

  private async submitRuntimeHostResponse(
    input: AgentAppTaskHostResponseRequest,
  ): Promise<AgentAppTaskHostResponseResult> {
    const state = await this.requireTask(input.taskId);
    const actionScope: NonNullable<
      AgentRuntimeRespondActionRequest["action_scope"]
    > = {
      session_id: input.actionScope?.sessionId ?? state.sessionId,
    };
    if (input.actionScope?.threadId) {
      actionScope.thread_id = input.actionScope.threadId;
    }
    if (input.actionScope?.turnId || state.turnId) {
      actionScope.turn_id = input.actionScope?.turnId ?? state.turnId;
    }
    const runtimeRequest: AgentRuntimeRespondActionRequest = {
      session_id: state.sessionId,
      request_id: input.requestId,
      action_type: input.actionType,
      confirmed: input.confirmed ?? true,
      metadata: {
        ...(input.metadata ?? {}),
        agent_app_runtime: {
          app_id: state.appId,
          entry_key: state.entryKey,
          task_id: state.taskId,
          source: "agent_app_host_bridge",
        },
      },
      event_name: `agent_app_runtime:${state.appId}:${state.taskId}:host_response`,
      action_scope: actionScope,
    };
    if (input.response !== undefined) {
      runtimeRequest.response = input.response;
    }
    if (input.userData !== undefined) {
      runtimeRequest.user_data = input.userData;
    }
    await this.api.submitHostResponse({
      appId: state.appId,
      taskId: state.taskId,
      runtimeRequest,
    });
    return {
      taskId: state.taskId,
      requestId: input.requestId,
      status: "submitted",
      submittedAt: this.now(),
    };
  }

  private async persistRuntimeTaskState(
    state: RuntimeTaskState,
  ): Promise<void> {
    try {
      const sdk = this.delegate.createSdkContext(state.entryKey ?? state.appId);
      await sdk.storage.set(runtimeTaskStorageKey(state.taskId), {
        schemaVersion: 1,
        state,
      });
    } catch (error) {
      console.warn("Agent App runtime task state persistence skipped", error);
    }
  }

  private listPersistedRuntimeTaskStates(
    query?: AgentAppProvenanceQuery,
  ): RuntimeTaskState[] {
    return this.delegate
      .getStorageEntries({ appId: query?.appId ?? this.appId })
      .filter((entry) => entry.key.startsWith(RUNTIME_TASK_STORAGE_PREFIX))
      .map((entry) => readPersistedRuntimeTaskState(entry.value))
      .filter((state): state is RuntimeTaskState => {
        if (!state) {
          return false;
        }
        if (query?.appId && state.appId !== query.appId) {
          return false;
        }
        if (query?.entryKey && state.entryKey !== query.entryKey) {
          return false;
        }
        return true;
      });
  }

  private loadPersistedRuntimeTaskState(
    taskId: string,
  ): RuntimeTaskState | null {
    const entry = this.delegate
      .getStorageEntries({ appId: this.appId })
      .find((item) => item.key === runtimeTaskStorageKey(taskId));
    const state = readPersistedRuntimeTaskState(entry?.value);
    if (state) {
      this.tasks.set(state.taskId, state);
      return state;
    }
    return null;
  }

  private async requireTask(taskId: string): Promise<RuntimeTaskState> {
    const state =
      this.tasks.get(taskId) ?? this.loadPersistedRuntimeTaskState(taskId);
    if (state) {
      return state;
    }
    throw new Error(`未找到 Agent App runtime task：${taskId}`);
  }
}
