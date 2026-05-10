import type { AgentRun, AgentRunStatus } from "@/lib/api/executionRun";
import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "./agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "./conversationProjectionStore";

export type AgentUiRemoteTaskProjectionEvent =
  | "created"
  | "updated"
  | "needs_input"
  | "auth_required"
  | "artifact_updated"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentUiRemoteTaskAgentCard {
  id?: string | null;
  name?: string | null;
  provider?: string | null;
  url?: string | null;
}

export interface AgentUiRemoteTaskArtifactRef {
  artifactId: string;
  artifactPath?: string | null;
  contentRef?: string | null;
  contentUrl?: string | null;
  mimeType?: string | null;
  byteSize?: string | null;
  digest?: string | null;
  preview?: string | null;
  title?: string | null;
  status?: string | null;
}

export interface AgentUiRemoteTaskProjectionInput {
  remoteTaskId: string;
  event: AgentUiRemoteTaskProjectionEvent;
  agentCard?: AgentUiRemoteTaskAgentCard | null;
  taskId?: string | null;
  title?: string | null;
  inputSummary?: string | null;
  source?: string | null;
  channel?: string | null;
  accountId?: string | null;
  inboundMessageId?: string | null;
  inputRequired?: boolean | null;
  authRequired?: boolean | null;
  authStatus?: string | null;
  remoteEvent?: string | null;
  remoteStatus?: string | null;
  status?: AgentUiRuntimeStatus | null;
  artifacts?: AgentUiRemoteTaskArtifactRef[];
  timestamp?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
}

function normalizeText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeRemoteTaskId(
  input: AgentUiRemoteTaskProjectionInput,
): string {
  return input.remoteTaskId.trim();
}

function resolveRemoteRuntimeStatus(
  input: AgentUiRemoteTaskProjectionInput,
): AgentUiRuntimeStatus {
  if (input.status) {
    return input.status;
  }

  switch (input.event) {
    case "created":
      return "queued";
    case "auth_required":
    case "needs_input":
      return "needs_input";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "artifact_updated":
    case "updated":
    default:
      return "running";
  }
}

function resolveRemotePhase(status: AgentUiRuntimeStatus): AgentUiPhase {
  switch (status) {
    case "queued":
    case "submitted":
    case "accepted":
      return "planning";
    case "preparing":
      return "preparing";
    case "running":
      return "acting";
    case "needs_input":
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "aborted":
      return "cancelled";
    default:
      return "unknown";
  }
}

function isTerminalRemoteStatus(status: AgentUiRuntimeStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "aborted"
  );
}

function normalizeArtifactRefs(
  artifacts: AgentUiRemoteTaskArtifactRef[] | undefined,
): AgentUiRemoteTaskArtifactRef[] {
  const seen = new Set<string>();
  return (artifacts ?? []).filter((artifact) => {
    const artifactId = artifact.artifactId.trim();
    if (!artifactId || seen.has(artifactId)) {
      return false;
    }
    seen.add(artifactId);
    return true;
  });
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRecordField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = readRecord(record?.[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readText(value: unknown): string | undefined {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }
  return normalizeText(`${value}`);
}

function readTextField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readText(record?.[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readBooleanField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readPreviewField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  const preview = readTextField(record, keys);
  if (!preview) {
    return undefined;
  }
  return preview.length > 240 ? `${preview.slice(0, 240)}...` : preview;
}

function parseAgentRunMetadata(
  metadata: AgentRun["metadata"],
): Record<string, unknown> | undefined {
  if (!metadata?.trim()) {
    return undefined;
  }

  try {
    return readRecord(JSON.parse(metadata));
  } catch {
    return undefined;
  }
}

function resolveRemoteTaskMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const sourceMetadata = readRecordField(metadata, [
    "source_metadata",
    "sourceMetadata",
  ]);
  return readRecordField(sourceMetadata, ["remote_task", "remoteTask"]);
}

function resolveRemoteEventFromRunStatus(
  status: AgentRunStatus,
): AgentUiRemoteTaskProjectionEvent {
  switch (status) {
    case "queued":
      return "created";
    case "running":
      return "updated";
    case "success":
      return "completed";
    case "error":
    case "timeout":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "updated";
  }
}

function resolveRemoteRuntimeStatusFromRunStatus(
  status: AgentRunStatus,
): AgentUiRuntimeStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "success":
      return "completed";
    case "error":
    case "timeout":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return (
    status === "success" ||
    status === "error" ||
    status === "timeout" ||
    status === "canceled"
  );
}

function hasRemoteAuthNeed(input: {
  authRequired?: boolean;
  authStatus?: string;
}): boolean {
  const authStatus = normalizeText(input.authStatus)?.toLowerCase();
  return (
    input.authRequired === true ||
    authStatus === "auth_required" ||
    authStatus === "authentication_required" ||
    authStatus === "needs_auth" ||
    authStatus === "needs_oauth"
  );
}

function normalizeRemoteEventToken(
  value?: string,
): AgentUiRemoteTaskProjectionEvent | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  switch (normalized) {
    case "created":
    case "new":
    case "open":
    case "pending":
    case "submitted":
    case "queued":
      return "created";
    case "active":
    case "in_progress":
    case "processing":
    case "streaming":
    case "updated":
    case "running":
    case "working":
    case "accepted":
      return "updated";
    case "awaiting_input":
    case "blocked":
    case "needs_input":
    case "input_required":
    case "paused":
    case "requires_input":
    case "waiting":
      return "needs_input";
    case "auth_required":
    case "authentication_required":
    case "authorization_required":
    case "needs_auth":
    case "needs_oauth":
      return "auth_required";
    case "artifact_updated":
    case "artifact_update":
    case "artifact_changed":
      return "artifact_updated";
    case "completed":
    case "complete":
    case "finished":
    case "success":
    case "succeeded":
    case "done":
      return "completed";
    case "failed":
    case "error":
    case "errored":
    case "failure":
    case "rejected":
    case "timed_out":
    case "timeout":
      return "failed";
    case "cancelled":
    case "canceled":
    case "aborted":
      return "cancelled";
    default:
      return undefined;
  }
}

function normalizeRemoteRuntimeStatusToken(
  value?: string,
): AgentUiRuntimeStatus | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  switch (normalized) {
    case "queued":
      return "queued";
    case "submitted":
      return "submitted";
    case "accepted":
      return "accepted";
    case "preparing":
      return "preparing";
    case "running":
    case "active":
    case "in_progress":
    case "processing":
    case "streaming":
    case "working":
      return "running";
    case "awaiting_input":
    case "blocked":
    case "paused":
    case "waiting":
    case "needs_input":
    case "input_required":
    case "requires_input":
    case "auth_required":
    case "authentication_required":
    case "authorization_required":
    case "needs_auth":
    case "needs_oauth":
      return "needs_input";
    case "completed":
    case "complete":
    case "finished":
    case "success":
    case "succeeded":
    case "done":
      return "completed";
    case "failed":
    case "error":
    case "errored":
    case "failure":
    case "rejected":
    case "timed_out":
    case "timeout":
      return "failed";
    case "cancelled":
    case "canceled":
    case "aborted":
      return "cancelled";
    case "closed":
      return "closed";
    default:
      return undefined;
  }
}

function isTerminalRemoteEvent(
  event: AgentUiRemoteTaskProjectionEvent,
): boolean {
  return event === "completed" || event === "failed" || event === "cancelled";
}

function resolveRemoteEventFromRunSource(input: {
  status: AgentRunStatus;
  inputRequired?: boolean;
  authRequired?: boolean;
  authStatus?: string;
  remoteEvent?: string;
  remoteStatus?: string;
  artifactCount?: number;
}): AgentUiRemoteTaskProjectionEvent {
  if (isTerminalRunStatus(input.status)) {
    return resolveRemoteEventFromRunStatus(input.status);
  }
  const remoteEvent = normalizeRemoteEventToken(input.remoteEvent);
  const remoteStatusEvent = normalizeRemoteEventToken(input.remoteStatus);

  if (remoteEvent && isTerminalRemoteEvent(remoteEvent)) {
    return remoteEvent;
  }
  if (remoteStatusEvent && isTerminalRemoteEvent(remoteStatusEvent)) {
    return remoteStatusEvent;
  }
  if (hasRemoteAuthNeed(input)) {
    return "auth_required";
  }
  if (input.inputRequired === true) {
    return "needs_input";
  }
  if (remoteEvent) {
    return remoteEvent;
  }
  if (remoteStatusEvent && !isTerminalRemoteEvent(remoteStatusEvent)) {
    return remoteStatusEvent;
  }
  if ((input.artifactCount ?? 0) > 0) {
    return "artifact_updated";
  }
  return resolveRemoteEventFromRunStatus(input.status);
}

function resolveRemoteRuntimeStatusFromRunSource(input: {
  status: AgentRunStatus;
  inputRequired?: boolean;
  authRequired?: boolean;
  authStatus?: string;
  remoteEvent?: string;
  remoteStatus?: string;
  artifactCount?: number;
}): AgentUiRuntimeStatus {
  if (isTerminalRunStatus(input.status)) {
    return resolveRemoteRuntimeStatusFromRunStatus(input.status);
  }
  const remoteStatus = normalizeRemoteRuntimeStatusToken(input.remoteStatus);
  const remoteEvent = normalizeRemoteEventToken(input.remoteEvent);

  if (remoteStatus && isTerminalRemoteStatus(remoteStatus)) {
    return remoteStatus;
  }
  if (remoteEvent && isTerminalRemoteEvent(remoteEvent)) {
    return resolveRemoteRuntimeStatus({
      remoteTaskId: "_",
      event: remoteEvent,
    });
  }
  if (hasRemoteAuthNeed(input) || input.inputRequired === true) {
    return "needs_input";
  }
  if (remoteStatus) {
    return remoteStatus;
  }
  if (remoteEvent) {
    return resolveRemoteRuntimeStatus({
      remoteTaskId: "_",
      event: remoteEvent,
    });
  }
  if ((input.artifactCount ?? 0) > 0) {
    return "running";
  }
  return resolveRemoteRuntimeStatusFromRunStatus(input.status);
}

function buildRemoteAgentCardFromRunMetadata(
  remoteTask: Record<string, unknown>,
): AgentUiRemoteTaskAgentCard {
  const agentCard = readRecordField(remoteTask, ["agentCard", "agent_card"]);
  const channel = readTextField(remoteTask, ["channel", "provider"]);
  const accountId = readTextField(remoteTask, ["accountId", "account_id"]);
  return {
    id:
      readTextField(agentCard, ["id", "agentId", "agent_id"]) ??
      (channel && accountId ? `${channel}:${accountId}` : undefined),
    name:
      readTextField(agentCard, ["name", "title", "displayName"]) ??
      (channel ? `${channel} Remote` : undefined),
    provider: readTextField(agentCard, ["provider"]) ?? channel,
    url: readTextField(agentCard, ["url", "cardUrl", "card_url"]),
  };
}

function buildRemoteArtifactRefFromMetadata(
  value: unknown,
): AgentUiRemoteTaskArtifactRef | null {
  const record = readRecord(value);
  const artifactId = readTextField(record, ["artifactId", "artifact_id", "id"]);
  if (!artifactId) {
    return null;
  }

  return {
    artifactId,
    artifactPath: readTextField(record, [
      "artifactPath",
      "artifact_path",
      "path",
    ]),
    contentRef: readTextField(record, [
      "contentRef",
      "content_ref",
      "blobRef",
      "blob_ref",
      "dataRef",
      "data_ref",
    ]),
    contentUrl: readTextField(record, [
      "contentUrl",
      "content_url",
      "downloadUrl",
      "download_url",
      "href",
      "uri",
      "url",
    ]),
    mimeType: readTextField(record, [
      "mimeType",
      "mime_type",
      "mediaType",
      "media_type",
      "contentType",
      "content_type",
    ]),
    byteSize: readTextField(record, [
      "byteSize",
      "byte_size",
      "sizeBytes",
      "size_bytes",
      "size",
    ]),
    digest: readTextField(record, ["digest", "sha256", "checksum", "hash"]),
    preview: readPreviewField(record, [
      "preview",
      "textPreview",
      "text_preview",
    ]),
    title: readTextField(record, ["title", "name"]),
    status: readTextField(record, ["status"]),
  };
}

function buildRemoteArtifactRefsFromMetadataValue(
  value: unknown,
): AgentUiRemoteTaskArtifactRef[] {
  if (Array.isArray(value)) {
    return value
      .map(buildRemoteArtifactRefFromMetadata)
      .filter(
        (artifact): artifact is AgentUiRemoteTaskArtifactRef =>
          artifact !== null,
      );
  }

  const artifact = buildRemoteArtifactRefFromMetadata(value);
  return artifact ? [artifact] : [];
}

function buildRemoteArtifactRefsFromRunMetadata(
  remoteTask: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
): AgentUiRemoteTaskArtifactRef[] {
  const result = readRecord(metadata?.result);
  const remoteTaskDetail =
    readRecordField(remoteTask, ["task", "remoteTask", "remote_task"]) ??
    readRecordField(remoteTask, ["a2aTask", "a2a_task"]);
  const remoteTaskArtifacts =
    remoteTask.artifacts ??
    remoteTask.artifactRefs ??
    remoteTask.artifact_refs ??
    remoteTask.artifactUpdates ??
    remoteTask.artifact_updates;
  const remoteTaskDetailArtifacts =
    remoteTaskDetail?.artifacts ??
    remoteTaskDetail?.artifactRefs ??
    remoteTaskDetail?.artifact_refs;
  const metadataArtifacts =
    metadata?.artifacts ?? metadata?.artifactRefs ?? metadata?.artifact_refs;
  const resultArtifacts =
    result?.artifacts ?? result?.artifactRefs ?? result?.artifact_refs;

  return [
    remoteTaskArtifacts,
    remoteTaskDetailArtifacts,
    metadataArtifacts,
    resultArtifacts,
  ].flatMap(buildRemoteArtifactRefsFromMetadataValue);
}

export function buildRemoteTaskAgentUiProjectionInputFromAgentRun(
  run: AgentRun,
): AgentUiRemoteTaskProjectionInput | null {
  const metadata = parseAgentRunMetadata(run.metadata);
  const remoteTask = resolveRemoteTaskMetadata(metadata);
  const remoteTaskId = readTextField(remoteTask, [
    "remoteTaskId",
    "remote_task_id",
    "taskId",
    "task_id",
  ]);
  if (!remoteTask || !remoteTaskId) {
    return null;
  }
  const inputRequired = readBooleanField(remoteTask, [
    "inputRequired",
    "input_required",
  ]);
  const authRequired = readBooleanField(remoteTask, [
    "authRequired",
    "auth_required",
  ]);
  const authStatus = readTextField(remoteTask, ["authStatus", "auth_status"]);
  const remoteEvent = readTextField(remoteTask, [
    "event",
    "remoteEvent",
    "remote_event",
    "taskEvent",
    "task_event",
    "lifecycleEvent",
    "lifecycle_event",
  ]);
  const remoteStatus = readTextField(remoteTask, [
    "runtimeStatus",
    "runtime_status",
    "taskStatus",
    "task_status",
    "remoteStatus",
    "remote_status",
    "status",
    "state",
    "phase",
  ]);
  const artifacts = buildRemoteArtifactRefsFromRunMetadata(
    remoteTask,
    metadata,
  );

  return {
    remoteTaskId,
    event: resolveRemoteEventFromRunSource({
      status: run.status,
      inputRequired,
      authRequired,
      authStatus,
      remoteEvent,
      remoteStatus,
      artifactCount: artifacts.length,
    }),
    status: resolveRemoteRuntimeStatusFromRunSource({
      status: run.status,
      inputRequired,
      authRequired,
      authStatus,
      remoteEvent,
      remoteStatus,
      artifactCount: artifacts.length,
    }),
    agentCard: buildRemoteAgentCardFromRunMetadata(remoteTask),
    taskId: readTextField(remoteTask, ["taskId", "task_id"]),
    title: readTextField(remoteTask, ["title", "name", "summary"]),
    inputSummary: readTextField(remoteTask, [
      "inputSummary",
      "input_summary",
      "textPreview",
      "text_preview",
    ]),
    source: readTextField(remoteTask, ["source"]),
    channel: readTextField(remoteTask, ["channel"]),
    accountId: readTextField(remoteTask, ["accountId", "account_id"]),
    inboundMessageId: readTextField(remoteTask, [
      "inboundMessageId",
      "inbound_message_id",
      "messageId",
      "message_id",
    ]),
    inputRequired,
    authRequired,
    authStatus,
    remoteEvent,
    remoteStatus,
    artifacts,
    timestamp: run.finished_at ?? run.updated_at ?? run.started_at,
    sessionId:
      normalizeText(run.session_id) ??
      readTextField(remoteTask, ["sessionId", "session_id"]),
    threadId: readTextField(remoteTask, ["threadId", "thread_id"]),
    runId: run.id,
  };
}

export function buildAgentUiRemoteTaskProjectionEventsFromAgentRun(
  run: AgentRun,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const input = buildRemoteTaskAgentUiProjectionInputFromAgentRun(run);
  return input ? buildAgentUiRemoteTaskProjectionEvents(input, context) : [];
}

export function buildAgentUiRemoteTaskProjectionEvents(
  input: AgentUiRemoteTaskProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const remoteTaskId = normalizeRemoteTaskId(input);
  if (!remoteTaskId) {
    return [];
  }

  const runtimeStatus = resolveRemoteRuntimeStatus(input);
  const phase = resolveRemotePhase(runtimeStatus);
  const timestamp = normalizeText(input.timestamp) ?? context.timestamp;
  const sessionId = normalizeText(input.sessionId ?? context.sessionId);
  const threadId = normalizeText(input.threadId ?? context.threadId);
  const runId = normalizeText(input.runId ?? context.runId);
  const taskId = normalizeText(input.taskId ?? context.taskId) ?? remoteTaskId;
  const agentId = normalizeText(input.agentCard?.id) ?? remoteTaskId;
  const agentName =
    normalizeText(input.agentCard?.name) ??
    normalizeText(input.title) ??
    "Remote teammate";
  const artifacts = normalizeArtifactRefs(input.artifacts);
  const primaryArtifact =
    artifacts.find(
      (artifact) =>
        normalizeText(artifact.contentRef) ||
        normalizeText(artifact.contentUrl) ||
        normalizeText(artifact.mimeType) ||
        normalizeText(artifact.digest) ||
        normalizeText(artifact.preview),
    ) ?? artifacts[0];
  const artifactIds = artifacts.map((artifact) => artifact.artifactId.trim());
  const artifactPaths = artifacts
    .map((artifact) => normalizeText(artifact.artifactPath))
    .filter((artifactPath): artifactPath is string => Boolean(artifactPath));
  const acceptsAction = !isTerminalRemoteStatus(runtimeStatus);
  const inputRequired =
    acceptsAction &&
    (input.inputRequired === true ||
      input.event === "needs_input" ||
      input.event === "auth_required");
  const authRequired =
    acceptsAction &&
    (input.authRequired === true || input.event === "auth_required");
  const payload = {
    remoteEvent: input.event,
    remoteTaskId,
    title: normalizeText(input.title),
    inputSummary: normalizeText(input.inputSummary),
    source: normalizeText(input.source),
    channel: normalizeText(input.channel),
    accountId: normalizeText(input.accountId),
    inboundMessageId: normalizeText(input.inboundMessageId),
    agentCardId: normalizeText(input.agentCard?.id),
    agentCardName: normalizeText(input.agentCard?.name),
    agentCardProvider: normalizeText(input.agentCard?.provider),
    provider:
      normalizeText(input.agentCard?.provider) ?? normalizeText(input.channel),
    agentCardUrl: normalizeText(input.agentCard?.url),
    inputRequired,
    authRequired,
    authStatus:
      normalizeText(input.authStatus) ??
      (authRequired ? "auth_required" : undefined),
    remoteSourceEvent: normalizeText(input.remoteEvent),
    remoteStatus: normalizeText(input.remoteStatus),
    runtimeEntity: "external_task",
    runtimeStatus,
    artifactCount: artifacts.length,
    primaryArtifactId: primaryArtifact?.artifactId.trim(),
    primaryArtifactPath: normalizeText(primaryArtifact?.artifactPath),
    primaryArtifactTitle: normalizeText(primaryArtifact?.title),
    primaryArtifactContentRef: normalizeText(primaryArtifact?.contentRef),
    primaryArtifactContentUrl: normalizeText(primaryArtifact?.contentUrl),
    primaryArtifactMimeType: normalizeText(primaryArtifact?.mimeType),
    primaryArtifactByteSize: normalizeText(primaryArtifact?.byteSize),
    primaryArtifactDigest: normalizeText(primaryArtifact?.digest),
    primaryArtifactPreview: normalizeText(primaryArtifact?.preview),
  };
  const shared = {
    sourceType: "remote_task_projection" as const,
    timestamp,
    sessionId,
    threadId,
    runId,
    taskId,
    remoteTaskId,
    agentId,
    agentName,
    agentRole: "remote_teammate",
    agentSource:
      normalizeText(input.agentCard?.provider) ??
      normalizeText(input.channel) ??
      "remote_task",
    topology: "remote_teammate" as const,
    runtimeEntity: "external_task" as const,
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    refs: {
      ...(artifactIds.length > 0 ? { artifactIds } : {}),
      ...(artifactPaths.length > 0 ? { artifactPaths } : {}),
    },
    rawEventRef: remoteTaskId,
  };
  const actionRequiredEvent: AgentUiProjectionEvent | null =
    payload.inputRequired || payload.authRequired
      ? {
          ...shared,
          type: "action.required",
          actionId: `${remoteTaskId}:${payload.authRequired ? "auth" : "input"}`,
          owner: "action",
          scope: "action_request",
          phase: "waiting",
          surface: "remote_teammate",
          persistence: "snapshot",
          control: "answer",
          payload: {
            ...payload,
            actionKind: payload.authRequired
              ? "remote_task_auth_required"
              : "remote_task_input_required",
          },
        }
      : null;
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "remote_teammate",
      persistence: "snapshot",
      control: runtimeStatus === "needs_input" ? "answer" : "open_detail",
      payload,
    },
    {
      ...shared,
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase,
      surface: "remote_teammate",
      persistence: "snapshot",
      control: runtimeStatus === "needs_input" ? "answer" : "open_detail",
      payload,
    },
    ...(actionRequiredEvent ? [actionRequiredEvent] : []),
    ...artifacts.map<AgentUiProjectionEvent>((artifact) => ({
      ...shared,
      type: "artifact.updated",
      artifactId: artifact.artifactId.trim(),
      owner: "artifact",
      scope: "artifact",
      phase: "producing",
      surface: "artifact_workspace",
      persistence: "artifact_store",
      control: "open_detail",
      payload: {
        ...payload,
        artifactId: artifact.artifactId.trim(),
        artifactPath: normalizeText(artifact.artifactPath),
        artifactContentRef: normalizeText(artifact.contentRef),
        artifactContentUrl: normalizeText(artifact.contentUrl),
        artifactMimeType: normalizeText(artifact.mimeType),
        artifactByteSize: normalizeText(artifact.byteSize),
        artifactDigest: normalizeText(artifact.digest),
        artifactPreview: normalizeText(artifact.preview),
        artifactTitle: normalizeText(artifact.title),
        artifactStatus: normalizeText(artifact.status),
      },
      refs: {
        artifactIds: [artifact.artifactId.trim()],
        ...(normalizeText(artifact.artifactPath)
          ? { artifactPaths: [normalizeText(artifact.artifactPath) as string] }
          : {}),
      },
    })),
  ];

  if (isTerminalRemoteStatus(runtimeStatus)) {
    events.push({
      ...shared,
      type: "worker.notification",
      workerNotificationId: `${remoteTaskId}:${runtimeStatus}`,
      owner: "agent",
      scope: "agent",
      phase,
      surface: "worker_notifications",
      persistence: "archive",
      control: "open_detail",
      payload: {
        ...payload,
        notificationKind: "remote_task_terminal",
      },
    });
  }

  return events.map((event, index) => ({
    ...event,
    sequence:
      typeof context.sequence === "number"
        ? context.sequence + index
        : undefined,
  }));
}

export function recordRemoteTaskAgentUiProjection(
  input: AgentUiRemoteTaskProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return recordAgentUiProjectionEvents(
    buildAgentUiRemoteTaskProjectionEvents(input, context),
  );
}

export function recordRemoteTaskAgentUiProjectionFromAgentRun(
  run: AgentRun,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return recordAgentUiProjectionEvents(
    buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run, context),
  );
}
