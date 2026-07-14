import {
  AppServerClient,
  type AppServerAgentSessionActionReplayResponse,
  type AppServerAgentSessionFileCheckpointDetail,
  type AppServerAgentSessionFileCheckpointDiffResponse,
  type AppServerAgentSessionFileCheckpointListResponse,
  type AppServerAgentSessionFileCheckpointRestoreResponse,
  type AppServerAgentSessionFileCheckpointSummary,
  type AppServerAgentSessionActionRespondParams,
  type AppServerAgentSessionActionScope,
  type AppServerCapabilityListParams,
  type AppServerAgentSessionTurnCancelParams,
  type AppServerAgentSessionTurnStartParams,
  type AppServerThreadReadParams,
  type AppServerThreadReadResponse,
} from "@/lib/api/appServer";
import { isAppServerBridgeAvailable } from "@/lib/api/appServerBridgeAvailability";
import type { AgentRuntimeClient as StandardAgentRuntimeClient } from "@limecloud/agent-runtime-client";
import {
  AppServerAgentSessionEventDrainRouter,
  publishAppServerAgentSessionNotifications,
  publishAppServerRpcErrorNotifications,
} from "./appServerEventStream";
import { projectAppServerSessionReadResult } from "./appServerReadModelClient";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
import {
  agentRuntimeCapabilityManifestFromAppServerResponse,
  buildAgentRuntimeResumeContract,
} from "./capabilityContract";
import type {
  AgentRuntimeCapabilityManifestRequest,
  AgentRuntimeCompactSessionRequest,
  AgentRuntimeDiffFileCheckpointRequest,
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
  AgentRuntimeFileCheckpointSummary,
  AgentRuntimeGetFileCheckpointRequest,
  AgentRuntimeInterruptTurnRequest,
  AgentRuntimeListFileCheckpointsRequest,
  AgentRuntimePromoteQueuedTurnRequest,
  AgentRuntimeRemoveQueuedTurnRequest,
  AgentRuntimeReplayRequestRequest,
  AgentRuntimeReplayedActionRequiredView,
  AgentRuntimeRespondActionRequest,
  AgentRuntimeRestoreFileCheckpointRequest,
  AgentRuntimeResumeThreadRequest,
  AgentRuntimeThreadReadModel,
} from "./types";
import type { AgentRuntimeCapabilityManifest } from "@limecloud/agent-ui-contracts";

export type AgentRuntimeAppServerClient = Pick<
  AppServerClient,
  | "readSession"
  | "readThread"
  | "startTurn"
  | "cancelTurn"
  | "replayAction"
  | "compactAgentSession"
  | "resumeAgentSessionThread"
  | "removeAgentSessionQueuedTurn"
  | "promoteAgentSessionQueuedTurn"
  | "respondAction"
  | "drainEvents"
  | "listAgentSessionFileCheckpoints"
  | "getAgentSessionFileCheckpoint"
  | "diffAgentSessionFileCheckpoint"
  | "restoreAgentSessionFileCheckpoint"
  | "listCapabilities"
>;

export type AgentRuntimeLifecycleClient = Pick<
  StandardAgentRuntimeClient,
  "startTurn" | "cancelTurn" | "respondAction" | "readThread"
>;

type AgentRuntimeLifecycleStartTurnParams = Parameters<
  AgentRuntimeLifecycleClient["startTurn"]
>[0];
type AgentRuntimeLifecycleCancelTurnParams = Parameters<
  AgentRuntimeLifecycleClient["cancelTurn"]
>[0];
type AgentRuntimeLifecycleRespondActionParams = Parameters<
  AgentRuntimeLifecycleClient["respondAction"]
>[0];
type AgentRuntimeLifecycleReadThreadParams = Parameters<
  AgentRuntimeLifecycleClient["readThread"]
>[0];

export interface AgentRuntimeThreadClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeAppServerClient;
  standardRuntimeClient?: AgentRuntimeLifecycleClient;
  isAppServerTurnLifecycleAvailable?: () => boolean;
  enableAppServerEventDrain?: boolean;
}

export function createThreadClient(deps: AgentRuntimeThreadClientDeps = {}) {
  const {
    invokeCommand = invokeAgentRuntimeCommand,
    appServerClient = new AppServerClient(),
    isAppServerTurnLifecycleAvailable = defaultIsAppServerTurnLifecycleAvailable,
    enableAppServerEventDrain,
  } = deps;
  void invokeCommand;
  const standardRuntimeClient =
    deps.standardRuntimeClient ??
    createAppServerAgentRuntimeLifecycleClient(appServerClient);
  const appServerEventRouter = shouldEnableAppServerEventDrain(
    appServerClient,
    enableAppServerEventDrain,
    deps.standardRuntimeClient,
  )
    ? new AppServerAgentSessionEventDrainRouter(appServerClient)
    : null;

  async function submitAgentRuntimeTurn(
    request: AppServerAgentSessionTurnStartParams,
  ): Promise<void> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const route = appServerEventRouter?.register({
      eventName: request.runtimeOptions?.eventName ?? undefined,
      sessionId: request.sessionId,
      turnId: request.turnId ?? undefined,
    });
    try {
      const result = await standardRuntimeClient.startTurn(request);
      if (route) {
        route.publish(result.notifications);
      } else {
        publishAppServerAgentSessionNotifications(
          request.runtimeOptions?.eventName ?? undefined,
          result.notifications,
        );
      }
    } catch (error) {
      publishAppServerRpcErrorNotifications(error, {
        eventName: request.runtimeOptions?.eventName ?? undefined,
        sessionId: request.sessionId,
        turnId: request.turnId ?? undefined,
      });
      throw error;
    }
  }

  async function interruptAgentRuntimeTurn(
    request: AgentRuntimeInterruptTurnRequest,
  ): Promise<boolean> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const result = await standardRuntimeClient.cancelTurn(
      appServerTurnCancelParamsFromRequest(request),
    );
    publishAppServerAgentSessionNotifications(
      request.event_name,
      result.notifications,
    );
    return true;
  }

  async function compactAgentRuntimeSession(
    request: AgentRuntimeCompactSessionRequest,
  ): Promise<void> {
    const result = await appServerClient.compactAgentSession({
      sessionId: request.session_id,
      eventName: request.event_name,
    });
    publishAppServerAgentSessionNotifications(
      request.event_name,
      result.notifications,
    );
  }

  async function resumeAgentRuntimeThread(
    request: AgentRuntimeResumeThreadRequest,
  ): Promise<boolean> {
    const eventName = `agentSession/event/${request.session_id}`;
    const resumeContract = buildAgentRuntimeResumeContract({
      sessionId: request.session_id,
      turnId: request.turn_id,
      openActionIds: request.open_action_ids,
      decisions: request.decisions,
    });
    const route = appServerEventRouter?.register({
      eventName,
      sessionId: request.session_id,
      turnId: request.turn_id,
    });
    try {
      const result = await appServerClient.resumeAgentSessionThread({
        sessionId: request.session_id,
        resumeContract,
      });
      if (route) {
        route.publish(result.notifications);
      } else {
        publishAppServerAgentSessionNotifications(
          eventName,
          result.notifications,
        );
      }
      return result.result.resumed === true;
    } catch (error) {
      publishAppServerRpcErrorNotifications(error, {
        eventName,
        sessionId: request.session_id,
        turnId: request.turn_id,
      });
      throw error;
    }
  }

  async function getAgentRuntimeCapabilityManifest(
    request: AgentRuntimeCapabilityManifestRequest = {},
  ): Promise<AgentRuntimeCapabilityManifest> {
    const params: AppServerCapabilityListParams = {
      ...(request.app_id ? { appId: request.app_id } : {}),
      ...(request.workspace_id ? { workspaceId: request.workspace_id } : {}),
      ...(request.session_id ? { sessionId: request.session_id } : {}),
      ...(request.cursor ? { cursor: request.cursor } : {}),
      ...(typeof request.limit === "number" ? { limit: request.limit } : {}),
    };
    const result = await appServerClient.listCapabilities(params);
    return agentRuntimeCapabilityManifestFromAppServerResponse(
      result.result.capabilities ?? [],
      result.result.runtimeCapabilityManifest,
      {
        sessionId: request.session_id,
      },
    );
  }

  async function replayAgentRuntimeRequest(
    request: AgentRuntimeReplayRequestRequest,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null> {
    const response = await appServerClient.replayAction(
      appServerActionReplayParamsFromRequest(request),
    );
    const result = agentRuntimeReplayedActionFromAppServer(
      response.result.action,
    );
    assertReplayedActionRequiredViewOrNull(
      "agentSession/action/replay",
      result,
    );
    return result;
  }

  async function removeAgentRuntimeQueuedTurn(
    request: AgentRuntimeRemoveQueuedTurnRequest,
  ): Promise<boolean> {
    const result = await appServerClient.removeAgentSessionQueuedTurn({
      sessionId: request.session_id,
      queuedTurnId: request.queued_turn_id,
    });
    publishAppServerAgentSessionNotifications(
      `agentSession/event/${request.session_id}`,
      result.notifications,
    );
    return result.result.removed === true;
  }

  async function promoteAgentRuntimeQueuedTurn(
    request: AgentRuntimePromoteQueuedTurnRequest,
  ): Promise<boolean> {
    const result = await appServerClient.promoteAgentSessionQueuedTurn({
      sessionId: request.session_id,
      queuedTurnId: request.queued_turn_id,
    });
    publishAppServerAgentSessionNotifications(
      `agentSession/event/${request.session_id}`,
      result.notifications,
    );
    return result.result.promoted === true;
  }

  async function respondAgentRuntimeAction(
    request: AgentRuntimeRespondActionRequest,
  ): Promise<void> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const eventName = appServerActionRespondEventNameFromRequest(request);
    const route = appServerEventRouter?.register({
      eventName,
      sessionId: request.session_id,
      turnId: request.action_scope?.turn_id,
    });
    try {
      const result = await standardRuntimeClient.respondAction(
        appServerActionRespondParamsFromRequest(request),
      );
      if (route) {
        route.publish(result.notifications);
      } else {
        publishAppServerAgentSessionNotifications(
          eventName,
          result.notifications,
        );
      }
    } catch (error) {
      publishAppServerRpcErrorNotifications(error, {
        eventName,
        sessionId: request.session_id,
        turnId: request.action_scope?.turn_id,
      });
      throw error;
    }
  }

  async function getAgentRuntimeThreadRead(
    sessionId: string,
  ): Promise<AgentRuntimeThreadReadModel> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required to read App Server session");
    }
    const response = await appServerClient.readSession({
      sessionId: normalizedSessionId,
    });
    return projectAppServerSessionReadResult(response.result);
  }

  async function readAgentRuntimeThread(
    threadId: string,
  ): Promise<AppServerThreadReadResponse> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new Error(
        "threadId is required to read canonical App Server thread",
      );
    }
    const response = await appServerClient.readThread({
      threadId: normalizedThreadId,
      turnsView: "full",
    } satisfies AppServerThreadReadParams);
    return response.result;
  }

  async function readThreadSessionId(threadId: string): Promise<string> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new Error("threadId is required to resolve App Server session");
    }
    const response = await appServerClient.readThread({
      threadId: normalizedThreadId,
      turnsView: "notLoaded",
    } satisfies AppServerThreadReadParams);
    const resolvedThreadId = response.result.thread.threadId.trim();
    if (resolvedThreadId !== normalizedThreadId) {
      throw new Error(
        `thread/read returned mismatched threadId: expected ${normalizedThreadId}, received ${resolvedThreadId || "<empty>"}`,
      );
    }
    const sessionId = response.result.thread.sessionId.trim();
    if (!sessionId) {
      throw new Error(
        `thread/read returned an empty sessionId for ${normalizedThreadId}`,
      );
    }
    return sessionId;
  }

  async function listAgentRuntimeFileCheckpoints(
    request: AgentRuntimeListFileCheckpointsRequest,
  ): Promise<AgentRuntimeFileCheckpointListResult> {
    const command = "agentSession/fileCheckpoint/list";
    const result = await appServerClient.listAgentSessionFileCheckpoints({
      sessionId: request.session_id,
    });
    return projectAppServerFileCheckpointListResult(command, result.result);
  }

  async function getAgentRuntimeFileCheckpoint(
    request: AgentRuntimeGetFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDetail> {
    const command = "agentSession/fileCheckpoint/get";
    const result = await appServerClient.getAgentSessionFileCheckpoint({
      sessionId: request.session_id,
      checkpointId: request.checkpoint_id,
    });
    return projectAppServerFileCheckpointDetail(command, result.result);
  }

  async function diffAgentRuntimeFileCheckpoint(
    request: AgentRuntimeDiffFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDiffResult> {
    const command = "agentSession/fileCheckpoint/diff";
    const result = await appServerClient.diffAgentSessionFileCheckpoint({
      sessionId: request.session_id,
      checkpointId: request.checkpoint_id,
    });
    return projectAppServerFileCheckpointDiffResult(command, result.result);
  }

  async function restoreAgentRuntimeFileCheckpoint(
    request: AgentRuntimeRestoreFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointRestoreResult> {
    const command = "agentSession/fileCheckpoint/restore";
    const result = await appServerClient.restoreAgentSessionFileCheckpoint({
      sessionId: request.session_id,
      checkpointId: request.checkpoint_id,
      confirmRestore: request.confirm_restore,
      createBackup: request.create_backup,
    });
    return projectAppServerFileCheckpointRestoreResult(command, result.result);
  }

  return {
    compactAgentRuntimeSession,
    diffAgentRuntimeFileCheckpoint,
    getAgentRuntimeFileCheckpoint,
    getAgentRuntimeCapabilityManifest,
    getAgentRuntimeThreadRead,
    readAgentRuntimeThread,
    readThreadSessionId,
    interruptAgentRuntimeTurn,
    listAgentRuntimeFileCheckpoints,
    promoteAgentRuntimeQueuedTurn,
    removeAgentRuntimeQueuedTurn,
    replayAgentRuntimeRequest,
    respondAgentRuntimeAction,
    restoreAgentRuntimeFileCheckpoint,
    resumeAgentRuntimeThread,
    submitAgentRuntimeTurn,
  };
}

function defaultIsAppServerTurnLifecycleAvailable(): boolean {
  return isAppServerBridgeAvailable();
}

function assertAppServerTurnLifecycleAvailable(
  isAvailable: () => boolean,
): void {
  if (!isAvailable()) {
    throw new Error(
      "App Server turn lifecycle is unavailable; Agent Runtime requires the App Server current lifecycle channel.",
    );
  }
}

function shouldEnableAppServerEventDrain(
  appServerClient: AgentRuntimeAppServerClient,
  override: boolean | undefined,
  standardRuntimeClient: AgentRuntimeLifecycleClient | undefined,
): boolean {
  if (override !== undefined) {
    return override;
  }
  if (standardRuntimeClient) {
    return false;
  }
  return appServerClient instanceof AppServerClient;
}

function createAppServerAgentRuntimeLifecycleClient(
  appServerClient: AgentRuntimeAppServerClient,
): AgentRuntimeLifecycleClient {
  return {
    startTurn: (params: AgentRuntimeLifecycleStartTurnParams) =>
      appServerClient.startTurn(
        params as unknown as AppServerAgentSessionTurnStartParams,
      ) as ReturnType<AgentRuntimeLifecycleClient["startTurn"]>,
    cancelTurn: (params: AgentRuntimeLifecycleCancelTurnParams) =>
      appServerClient.cancelTurn(
        params as unknown as AppServerAgentSessionTurnCancelParams,
      ) as ReturnType<AgentRuntimeLifecycleClient["cancelTurn"]>,
    respondAction: (params: AgentRuntimeLifecycleRespondActionParams) =>
      appServerClient.respondAction(
        params as unknown as AppServerAgentSessionActionRespondParams,
      ) as ReturnType<AgentRuntimeLifecycleClient["respondAction"]>,
    readThread: (params: AgentRuntimeLifecycleReadThreadParams) =>
      appServerClient.readThread(
        params as unknown as AppServerThreadReadParams,
      ) as ReturnType<AgentRuntimeLifecycleClient["readThread"]>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isFileCheckpointSummary(
  value: unknown,
): value is AgentRuntimeFileCheckpointListResult["checkpoints"][number] {
  return (
    isRecord(value) &&
    isRequiredString(value.checkpoint_id) &&
    isRequiredString(value.turn_id) &&
    isRequiredString(value.path) &&
    isRequiredString(value.source) &&
    (typeof value.updated_at === "string" ||
      typeof value.updated_at === "number") &&
    isOptionalFiniteNumber(value.version_no) &&
    isOptionalString(value.version_id) &&
    isOptionalString(value.request_id) &&
    isOptionalString(value.title) &&
    isOptionalString(value.kind) &&
    isOptionalString(value.status) &&
    isOptionalString(value.preview_text) &&
    isOptionalString(value.snapshot_path) &&
    typeof value.validation_issue_count === "number" &&
    Number.isFinite(value.validation_issue_count)
  );
}

function isFileCheckpointListResult(
  value: unknown,
): value is AgentRuntimeFileCheckpointListResult {
  return (
    isRecord(value) &&
    isRequiredString(value.session_id) &&
    isRequiredString(value.thread_id) &&
    typeof value.checkpoint_count === "number" &&
    Number.isFinite(value.checkpoint_count) &&
    Array.isArray(value.checkpoints) &&
    value.checkpoints.every(isFileCheckpointSummary)
  );
}

function isFileCheckpointDetail(
  value: unknown,
): value is AgentRuntimeFileCheckpointDetail {
  return (
    isRecord(value) &&
    isRequiredString(value.session_id) &&
    isRequiredString(value.thread_id) &&
    isFileCheckpointSummary(value.checkpoint) &&
    isRequiredString(value.live_path) &&
    isRequiredString(value.snapshot_path) &&
    Array.isArray(value.version_history) &&
    isStringArray(value.validation_issues) &&
    (value.content === undefined || typeof value.content === "string")
  );
}

function isFileCheckpointDiffResult(
  value: unknown,
): value is AgentRuntimeFileCheckpointDiffResult {
  return (
    isRecord(value) &&
    isRequiredString(value.session_id) &&
    isRequiredString(value.thread_id) &&
    isFileCheckpointSummary(value.checkpoint) &&
    isOptionalString(value.current_version_id) &&
    isOptionalString(value.previous_version_id)
  );
}

function isFileCheckpointRestoreResult(
  value: unknown,
): value is AgentRuntimeFileCheckpointRestoreResult {
  return (
    isRecord(value) &&
    isRequiredString(value.session_id) &&
    isRequiredString(value.thread_id) &&
    isFileCheckpointSummary(value.checkpoint) &&
    isRequiredString(value.live_path) &&
    isRequiredString(value.snapshot_path) &&
    (value.backup_path === undefined ||
      value.backup_path === null ||
      typeof value.backup_path === "string") &&
    (typeof value.restored_at === "string" ||
      typeof value.restored_at === "number")
  );
}

function readField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(record, camelKey)) {
    return record[camelKey];
  }
  return snakeKey ? record[snakeKey] : undefined;
}

function isOptionalNullableString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isAppServerFileCheckpointSummary(
  value: unknown,
): value is AppServerAgentSessionFileCheckpointSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "checkpointId", "checkpoint_id")) &&
    isRequiredString(readField(value, "turnId", "turn_id")) &&
    isRequiredString(readField(value, "path")) &&
    isRequiredString(readField(value, "source")) &&
    isRequiredString(readField(value, "updatedAt", "updated_at")) &&
    isOptionalFiniteNumber(readField(value, "versionNo", "version_no")) &&
    isOptionalString(readField(value, "versionId", "version_id")) &&
    isOptionalString(readField(value, "requestId", "request_id")) &&
    isOptionalString(readField(value, "title")) &&
    isOptionalString(readField(value, "kind")) &&
    isOptionalString(readField(value, "status")) &&
    isOptionalString(readField(value, "previewText", "preview_text")) &&
    isOptionalString(readField(value, "snapshotPath", "snapshot_path")) &&
    typeof readField(
      value,
      "validationIssueCount",
      "validation_issue_count",
    ) === "number" &&
    Number.isFinite(
      readField(value, "validationIssueCount", "validation_issue_count"),
    )
  );
}

function isAppServerFileCheckpointListResponse(
  value: unknown,
): value is AppServerAgentSessionFileCheckpointListResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "sessionId", "session_id")) &&
    isRequiredString(readField(value, "threadId", "thread_id")) &&
    typeof readField(value, "checkpointCount", "checkpoint_count") ===
      "number" &&
    Number.isFinite(readField(value, "checkpointCount", "checkpoint_count")) &&
    Array.isArray(readField(value, "checkpoints")) &&
    (readField(value, "checkpoints") as unknown[]).every(
      isAppServerFileCheckpointSummary,
    )
  );
}

function isAppServerFileCheckpointDetail(
  value: unknown,
): value is AppServerAgentSessionFileCheckpointDetail {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "sessionId", "session_id")) &&
    isRequiredString(readField(value, "threadId", "thread_id")) &&
    isAppServerFileCheckpointSummary(readField(value, "checkpoint")) &&
    isRequiredString(readField(value, "livePath", "live_path")) &&
    isRequiredString(readField(value, "snapshotPath", "snapshot_path")) &&
    Array.isArray(readField(value, "versionHistory", "version_history")) &&
    isStringArray(readField(value, "validationIssues", "validation_issues")) &&
    (readField(value, "content") === undefined ||
      typeof readField(value, "content") === "string")
  );
}

function isAppServerFileCheckpointDiffResponse(
  value: unknown,
): value is AppServerAgentSessionFileCheckpointDiffResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "sessionId", "session_id")) &&
    isRequiredString(readField(value, "threadId", "thread_id")) &&
    isAppServerFileCheckpointSummary(readField(value, "checkpoint")) &&
    isOptionalString(
      readField(value, "currentVersionId", "current_version_id"),
    ) &&
    isOptionalString(
      readField(value, "previousVersionId", "previous_version_id"),
    )
  );
}

function isAppServerFileCheckpointRestoreResponse(
  value: unknown,
): value is AppServerAgentSessionFileCheckpointRestoreResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "sessionId", "session_id")) &&
    isRequiredString(readField(value, "threadId", "thread_id")) &&
    isAppServerFileCheckpointSummary(readField(value, "checkpoint")) &&
    isRequiredString(readField(value, "livePath", "live_path")) &&
    isRequiredString(readField(value, "snapshotPath", "snapshot_path")) &&
    isOptionalNullableString(readField(value, "backupPath", "backup_path")) &&
    isRequiredString(readField(value, "restoredAt", "restored_at"))
  );
}

function assignStringIfPresent<T extends object>(
  target: Partial<T>,
  key: keyof T,
  value: unknown,
): void {
  if (typeof value === "string") {
    target[key] = value as T[keyof T];
  }
}

function assignNumberIfPresent<T extends object>(
  target: Partial<T>,
  key: keyof T,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value as T[keyof T];
  }
}

function assignNullableStringIfPresent<T extends object>(
  target: Partial<T>,
  key: keyof T,
  value: unknown,
): void {
  if (value === null || typeof value === "string") {
    target[key] = value as T[keyof T];
  }
}

function assignIfPresent<T extends object>(
  target: Partial<T>,
  key: keyof T,
  value: unknown,
): void {
  if (value !== undefined) {
    target[key] = value as T[keyof T];
  }
}

function projectAppServerFileCheckpointSummary(
  command: string,
  value: unknown,
): AgentRuntimeFileCheckpointSummary {
  if (!isAppServerFileCheckpointSummary(value)) {
    throw new Error(`${command} did not return file checkpoint summary`);
  }
  const record = value as unknown as Record<string, unknown>;
  const summary: AgentRuntimeFileCheckpointSummary = {
    checkpoint_id: readField(record, "checkpointId", "checkpoint_id") as string,
    turn_id: readField(record, "turnId", "turn_id") as string,
    path: readField(record, "path") as string,
    source: readField(record, "source") as string,
    updated_at: readField(record, "updatedAt", "updated_at") as string,
    validation_issue_count: readField(
      record,
      "validationIssueCount",
      "validation_issue_count",
    ) as number,
  };
  assignNumberIfPresent(
    summary,
    "version_no",
    readField(record, "versionNo", "version_no"),
  );
  assignStringIfPresent(
    summary,
    "version_id",
    readField(record, "versionId", "version_id"),
  );
  assignStringIfPresent(
    summary,
    "request_id",
    readField(record, "requestId", "request_id"),
  );
  assignStringIfPresent(summary, "title", readField(record, "title"));
  assignStringIfPresent(summary, "kind", readField(record, "kind"));
  assignStringIfPresent(summary, "status", readField(record, "status"));
  assignStringIfPresent(
    summary,
    "preview_text",
    readField(record, "previewText", "preview_text"),
  );
  assignStringIfPresent(
    summary,
    "snapshot_path",
    readField(record, "snapshotPath", "snapshot_path"),
  );
  if (!isFileCheckpointSummary(summary)) {
    throw new Error(`${command} did not return file checkpoint summary`);
  }
  return summary;
}

function projectAppServerFileCheckpointListResult(
  command: string,
  value: unknown,
): AgentRuntimeFileCheckpointListResult {
  if (!isAppServerFileCheckpointListResponse(value)) {
    throw new Error(`${command} did not return file checkpoint list`);
  }
  const record = value as unknown as Record<string, unknown>;
  const result: AgentRuntimeFileCheckpointListResult = {
    session_id: readField(record, "sessionId", "session_id") as string,
    thread_id: readField(record, "threadId", "thread_id") as string,
    checkpoint_count: readField(
      record,
      "checkpointCount",
      "checkpoint_count",
    ) as number,
    checkpoints: (readField(record, "checkpoints") as unknown[]).map(
      (checkpoint) =>
        projectAppServerFileCheckpointSummary(command, checkpoint),
    ),
  };
  assertFileCheckpointListResult(command, result);
  return result;
}

function projectAppServerFileCheckpointDetail(
  command: string,
  value: unknown,
): AgentRuntimeFileCheckpointDetail {
  if (!isAppServerFileCheckpointDetail(value)) {
    throw new Error(`${command} did not return file checkpoint detail`);
  }
  const record = value as unknown as Record<string, unknown>;
  const detail: AgentRuntimeFileCheckpointDetail = {
    session_id: readField(record, "sessionId", "session_id") as string,
    thread_id: readField(record, "threadId", "thread_id") as string,
    checkpoint: projectAppServerFileCheckpointSummary(
      command,
      readField(record, "checkpoint"),
    ),
    live_path: readField(record, "livePath", "live_path") as string,
    snapshot_path: readField(record, "snapshotPath", "snapshot_path") as string,
    version_history: readField(
      record,
      "versionHistory",
      "version_history",
    ) as unknown[],
    validation_issues: readField(
      record,
      "validationIssues",
      "validation_issues",
    ) as string[],
  };
  assignIfPresent(
    detail,
    "checkpoint_document",
    readField(record, "checkpointDocument", "checkpoint_document"),
  );
  assignIfPresent(
    detail,
    "live_document",
    readField(record, "liveDocument", "live_document"),
  );
  assignIfPresent(detail, "metadata", readField(record, "metadata"));
  assignStringIfPresent(detail, "content", readField(record, "content"));
  assertFileCheckpointDetail(command, detail);
  return detail;
}

function projectAppServerFileCheckpointDiffResult(
  command: string,
  value: unknown,
): AgentRuntimeFileCheckpointDiffResult {
  if (!isAppServerFileCheckpointDiffResponse(value)) {
    throw new Error(`${command} did not return file checkpoint diff`);
  }
  const record = value as unknown as Record<string, unknown>;
  const result: AgentRuntimeFileCheckpointDiffResult = {
    session_id: readField(record, "sessionId", "session_id") as string,
    thread_id: readField(record, "threadId", "thread_id") as string,
    checkpoint: projectAppServerFileCheckpointSummary(
      command,
      readField(record, "checkpoint"),
    ),
  };
  assignStringIfPresent(
    result,
    "current_version_id",
    readField(record, "currentVersionId", "current_version_id"),
  );
  assignStringIfPresent(
    result,
    "previous_version_id",
    readField(record, "previousVersionId", "previous_version_id"),
  );
  assignIfPresent(result, "diff", readField(record, "diff"));
  assertFileCheckpointDiffResult(command, result);
  return result;
}

function projectAppServerFileCheckpointRestoreResult(
  command: string,
  value: unknown,
): AgentRuntimeFileCheckpointRestoreResult {
  if (!isAppServerFileCheckpointRestoreResponse(value)) {
    throw new Error(`${command} did not return file checkpoint restore result`);
  }
  const record = value as unknown as Record<string, unknown>;
  const result: AgentRuntimeFileCheckpointRestoreResult = {
    session_id: readField(record, "sessionId", "session_id") as string,
    thread_id: readField(record, "threadId", "thread_id") as string,
    checkpoint: projectAppServerFileCheckpointSummary(
      command,
      readField(record, "checkpoint"),
    ),
    live_path: readField(record, "livePath", "live_path") as string,
    snapshot_path: readField(record, "snapshotPath", "snapshot_path") as string,
    restored_at: readField(record, "restoredAt", "restored_at") as string,
  };
  assignNullableStringIfPresent(
    result,
    "backup_path",
    readField(record, "backupPath", "backup_path"),
  );
  assertFileCheckpointRestoreResult(command, result);
  return result;
}

function assertFileCheckpointListResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeFileCheckpointListResult {
  if (!isFileCheckpointListResult(value)) {
    throw new Error(`${command} did not return file checkpoint list`);
  }
}

function isReplayedActionRequiredView(
  value: unknown,
): value is AgentRuntimeReplayedActionRequiredView {
  return (
    isRecord(value) &&
    value.type === "action_required" &&
    isRequiredString(value.request_id) &&
    (value.action_type === "tool_confirmation" ||
      value.action_type === "ask_user" ||
      value.action_type === "elicitation") &&
    (value.tool_name === undefined || typeof value.tool_name === "string") &&
    (value.arguments === undefined || isRecord(value.arguments)) &&
    (value.prompt === undefined || typeof value.prompt === "string") &&
    (value.requested_schema === undefined || isRecord(value.requested_schema))
  );
}

function assertReplayedActionRequiredViewOrNull(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeReplayedActionRequiredView | null {
  if (value !== null && !isReplayedActionRequiredView(value)) {
    throw new Error(`${command} did not return replayed action view`);
  }
}

function assertFileCheckpointDetail(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeFileCheckpointDetail {
  if (!isFileCheckpointDetail(value)) {
    throw new Error(`${command} did not return file checkpoint detail`);
  }
}

function assertFileCheckpointDiffResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeFileCheckpointDiffResult {
  if (!isFileCheckpointDiffResult(value)) {
    throw new Error(`${command} did not return file checkpoint diff`);
  }
}

function assertFileCheckpointRestoreResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeFileCheckpointRestoreResult {
  if (!isFileCheckpointRestoreResult(value)) {
    throw new Error(`${command} did not return file checkpoint restore result`);
  }
}

export {
  projectAppServerAgentEventPayload,
  publishAppServerAgentSessionNotifications,
} from "./appServerEventStream";

function appServerTurnCancelParamsFromRequest(
  request: AgentRuntimeInterruptTurnRequest,
): AppServerAgentSessionTurnCancelParams {
  if (!request.turn_id) {
    throw new Error("turn_id is required to cancel App Server turn");
  }
  return {
    sessionId: request.session_id,
    turnId: request.turn_id,
  };
}

export function appServerActionRespondParamsFromRequest(
  request: AgentRuntimeRespondActionRequest,
): AppServerAgentSessionActionRespondParams {
  return omitUndefined({
    sessionId: request.session_id,
    requestId: request.request_id,
    actionType: request.action_type,
    decision: request.decision,
    confirmed: request.confirmed,
    response: request.response,
    userData: request.user_data,
    metadata: request.metadata,
    eventName: request.event_name,
    actionScope: appServerActionScopeFromRequest(request.action_scope),
  });
}

function appServerActionRespondEventNameFromRequest(
  request: AgentRuntimeRespondActionRequest,
): string | undefined {
  const explicitEventName = request.event_name?.trim();
  if (explicitEventName) {
    return explicitEventName;
  }
  const sessionId = request.session_id.trim();
  return sessionId ? `agentSession/event/${sessionId}` : undefined;
}

function appServerActionReplayParamsFromRequest(
  request: AgentRuntimeReplayRequestRequest,
) {
  return {
    sessionId: request.session_id,
    requestId: request.request_id,
  };
}

function agentRuntimeReplayedActionFromAppServer(
  action: AppServerAgentSessionActionReplayResponse["action"],
): AgentRuntimeReplayedActionRequiredView | null {
  if (!action) {
    return null;
  }
  return omitUndefined({
    type: action.type,
    request_id: action.requestId,
    action_type: action.actionType,
    tool_name: action.toolName,
    arguments: isRecord(action.arguments) ? action.arguments : undefined,
    prompt: action.prompt,
    questions: action.questions,
    requested_schema: isRecord(action.requestedSchema)
      ? action.requestedSchema
      : undefined,
    available_decisions: action.availableDecisions,
    scope: action.scope
      ? omitUndefined({
          session_id: action.scope.sessionId,
          thread_id: action.scope.threadId,
          turn_id: action.scope.turnId,
        })
      : undefined,
  });
}

function appServerActionScopeFromRequest(
  scope?: AgentRuntimeRespondActionRequest["action_scope"],
): AppServerAgentSessionActionScope | undefined {
  if (!scope) {
    return undefined;
  }

  return omitUndefined({
    sessionId: scope.session_id,
    threadId: scope.thread_id,
    turnId: scope.turn_id,
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export const {
  compactAgentRuntimeSession,
  diffAgentRuntimeFileCheckpoint,
  getAgentRuntimeCapabilityManifest,
  getAgentRuntimeFileCheckpoint,
  getAgentRuntimeThreadRead,
  readAgentRuntimeThread,
  readThreadSessionId,
  interruptAgentRuntimeTurn,
  listAgentRuntimeFileCheckpoints,
  promoteAgentRuntimeQueuedTurn,
  removeAgentRuntimeQueuedTurn,
  replayAgentRuntimeRequest,
  respondAgentRuntimeAction,
  restoreAgentRuntimeFileCheckpoint,
  resumeAgentRuntimeThread,
  submitAgentRuntimeTurn,
} = createThreadClient();
