import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerClient,
  AppServerRpcError,
  isAppServerJsonRpcNotification,
  type AppServerAgentAttachment,
  type AppServerAgentEvent,
  type AppServerAgentSessionActionRespondParams,
  type AppServerAgentSessionActionScope,
  type AppServerAgentSessionTurnCancelParams,
  type AppServerAgentSessionTurnStartParams,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import { isDevBridgeAvailable } from "@/lib/dev-bridge";
import { isElectronHostCommandAvailable } from "@/lib/electron-host";
import { publishAgentRuntimeEvent } from "../agentRuntimeEvents";
import { createAppServerReadModelClient } from "./appServerReadModelClient";
import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
import type {
  AgentRuntimeCompactSessionRequest,
  AgentRuntimeDiffFileCheckpointRequest,
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
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
  AgentRuntimeSubmitTurnRequest,
  AgentRuntimeThreadReadModel,
} from "./types";

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_EVENT_DRAIN_LIMIT = 50;
const APP_SERVER_EVENT_DRAIN_INTERVAL_MS = 250;
const APP_SERVER_EVENT_ROUTE_TTL_MS = 30 * 60 * 1000;

export type AgentRuntimeAppServerClient = Pick<
  AppServerClient,
  "readSession" | "startTurn" | "cancelTurn" | "respondAction" | "drainEvents"
>;

export interface AgentRuntimeThreadClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeAppServerClient;
  isAppServerTurnLifecycleAvailable?: () => boolean;
  enableAppServerEventDrain?: boolean;
}

export function createThreadClient({
  invokeCommand = invokeAgentRuntimeCommand,
  appServerClient = new AppServerClient(),
  isAppServerTurnLifecycleAvailable = defaultIsAppServerTurnLifecycleAvailable,
  enableAppServerEventDrain,
}: AgentRuntimeThreadClientDeps = {}) {
  const appServerReadModelClient = createAppServerReadModelClient({
    appServerClient,
  });
  const appServerEventRouter = shouldEnableAppServerEventDrain(
    appServerClient,
    enableAppServerEventDrain,
  )
    ? new AppServerAgentSessionEventDrainRouter(appServerClient)
    : null;

  async function submitAgentRuntimeTurn(
    request: AgentRuntimeSubmitTurnRequest,
  ): Promise<void> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const route = appServerEventRouter?.register({
      eventName: request.event_name,
      sessionId: request.session_id,
      turnId: request.turn_id,
    });
    try {
      const result = await appServerClient.startTurn(
        appServerTurnStartParamsFromRequest(request),
      );
      if (route) {
        route.publish(result.notifications);
      } else {
        publishAppServerAgentSessionNotifications(
          request.event_name,
          result.notifications,
        );
      }
    } catch (error) {
      publishAppServerRpcErrorNotifications(error, {
        eventName: request.event_name,
        sessionId: request.session_id,
        turnId: request.turn_id,
      });
      throw error;
    }
  }

  async function interruptAgentRuntimeTurn(
    request: AgentRuntimeInterruptTurnRequest,
  ): Promise<boolean> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    const result = await appServerClient.cancelTurn(
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
    const command = AGENT_RUNTIME_COMMANDS.compactSession;
    const result = await invokeCommand(command, { request });
    assertVoidResult(command, result);
  }

  async function resumeAgentRuntimeThread(
    request: AgentRuntimeResumeThreadRequest,
  ): Promise<boolean> {
    const command = AGENT_RUNTIME_COMMANDS.resumeThread;
    const result = await invokeCommand(command, { request });
    assertBooleanResult(command, result);
    return result;
  }

  async function replayAgentRuntimeRequest(
    request: AgentRuntimeReplayRequestRequest,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null> {
    const command = AGENT_RUNTIME_COMMANDS.replayRequest;
    const result = await invokeCommand(command, { request });
    assertReplayedActionRequiredViewOrNull(command, result);
    return result;
  }

  async function removeAgentRuntimeQueuedTurn(
    request: AgentRuntimeRemoveQueuedTurnRequest,
  ): Promise<boolean> {
    const command = AGENT_RUNTIME_COMMANDS.removeQueuedTurn;
    const result = await invokeCommand(command, { request });
    assertBooleanResult(command, result);
    return result;
  }

  async function promoteAgentRuntimeQueuedTurn(
    request: AgentRuntimePromoteQueuedTurnRequest,
  ): Promise<boolean> {
    const command = AGENT_RUNTIME_COMMANDS.promoteQueuedTurn;
    const result = await invokeCommand(command, { request });
    assertBooleanResult(command, result);
    return result;
  }

  async function respondAgentRuntimeAction(
    request: AgentRuntimeRespondActionRequest,
  ): Promise<void> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    try {
      const result = await appServerClient.respondAction(
        appServerActionRespondParamsFromRequest(request),
      );
      const route = appServerEventRouter?.register({
        eventName: request.event_name,
        sessionId: request.session_id,
        turnId: request.action_scope?.turn_id,
      });
      if (route) {
        route.publish(result.notifications);
      } else {
        publishAppServerAgentSessionNotifications(
          request.event_name,
          result.notifications,
        );
      }
    } catch (error) {
      publishAppServerRpcErrorNotifications(error, {
        eventName: request.event_name,
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
    return await appServerReadModelClient.getAgentRuntimeThreadRead(sessionId);
  }

  async function listAgentRuntimeFileCheckpoints(
    request: AgentRuntimeListFileCheckpointsRequest,
  ): Promise<AgentRuntimeFileCheckpointListResult> {
    const command = AGENT_RUNTIME_COMMANDS.listFileCheckpoints;
    const result = await invokeCommand(command, { request });
    assertFileCheckpointListResult(command, result);
    return result;
  }

  async function getAgentRuntimeFileCheckpoint(
    request: AgentRuntimeGetFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDetail> {
    const command = AGENT_RUNTIME_COMMANDS.getFileCheckpoint;
    const result = await invokeCommand(command, { request });
    assertFileCheckpointDetail(command, result);
    return result;
  }

  async function diffAgentRuntimeFileCheckpoint(
    request: AgentRuntimeDiffFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDiffResult> {
    const command = AGENT_RUNTIME_COMMANDS.diffFileCheckpoint;
    const result = await invokeCommand(command, { request });
    assertFileCheckpointDiffResult(command, result);
    return result;
  }

  async function restoreAgentRuntimeFileCheckpoint(
    request: AgentRuntimeRestoreFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointRestoreResult> {
    const command = AGENT_RUNTIME_COMMANDS.restoreFileCheckpoint;
    const result = await invokeCommand(command, { request });
    assertFileCheckpointRestoreResult(command, result);
    return result;
  }

  return {
    compactAgentRuntimeSession,
    diffAgentRuntimeFileCheckpoint,
    getAgentRuntimeFileCheckpoint,
    getAgentRuntimeThreadRead,
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
  return (
    isElectronHostCommandAvailable(APP_SERVER_HANDLE_JSON_LINES_COMMAND) ||
    isDevBridgeAvailable()
  );
}

function assertAppServerTurnLifecycleAvailable(
  isAvailable: () => boolean,
): void {
  if (!isAvailable()) {
    throw new Error(
      "App Server turn lifecycle is unavailable; current Agent runtime cannot use legacy agent_runtime_* commands.",
    );
  }
}

function shouldEnableAppServerEventDrain(
  appServerClient: AgentRuntimeAppServerClient,
  override: boolean | undefined,
): boolean {
  if (override !== undefined) {
    return override;
  }
  return appServerClient instanceof AppServerClient;
}

function publishAppServerRpcErrorNotifications(
  error: unknown,
  routeParams: AppServerAgentSessionEventRouteParams,
): void {
  if (
    !(error instanceof AppServerRpcError) ||
    !error.notifications.length ||
    !routeParams.eventName
  ) {
    return;
  }

  for (const notification of error.notifications) {
    if (doesNotificationMatchRoute(notification, routeParams)) {
      publishAppServerAgentSessionNotifications(routeParams.eventName, [
        notification,
      ]);
    }
  }
}

function doesNotificationMatchRoute(
  notification: AppServerJsonRpcNotification,
  routeParams: AppServerAgentSessionEventRouteParams,
): boolean {
  const event = readAppServerAgentEvent(notification.params);
  if (!event) {
    return true;
  }
  if (routeParams.sessionId && event.sessionId !== routeParams.sessionId) {
    return false;
  }
  if (
    routeParams.turnId &&
    event.turnId &&
    routeParams.turnId !== event.turnId
  ) {
    return false;
  }
  return true;
}

type AppServerAgentSessionEventRouteParams = {
  eventName?: string;
  sessionId?: string;
  turnId?: string;
};

type AppServerAgentSessionEventRoute = {
  eventName: string;
  expiresAt: number;
  seenEventIds: Set<string>;
  sessionId: string;
  turnId?: string;
};

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
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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

function assertVoidResult(command: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    throw new Error(`${command} did not return void`);
  }
}

function assertBooleanResult(
  command: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${command} did not return boolean`);
  }
}

function assertReplayedActionRequiredViewOrNull(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeReplayedActionRequiredView | null {
  if (value !== null && !isReplayedActionRequiredView(value)) {
    throw new Error(`${command} did not return replayed action view`);
  }
}

function assertFileCheckpointListResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeFileCheckpointListResult {
  if (!isFileCheckpointListResult(value)) {
    throw new Error(`${command} did not return file checkpoint list`);
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

class AppServerAgentSessionEventDrainRouter {
  readonly #appServerClient: AgentRuntimeAppServerClient;
  readonly #closedRouteKeys = new Set<string>();
  readonly #routes = new Map<string, AppServerAgentSessionEventRoute>();
  #draining = false;

  constructor(appServerClient: AgentRuntimeAppServerClient) {
    this.#appServerClient = appServerClient;
  }

  register(params: AppServerAgentSessionEventRouteParams): {
    publish: (notifications: AppServerJsonRpcNotification[]) => void;
  } | null {
    const eventName = params.eventName?.trim();
    const sessionId = params.sessionId?.trim();
    if (!eventName || !sessionId) {
      return null;
    }

    const route: AppServerAgentSessionEventRoute = {
      eventName,
      sessionId,
      turnId: params.turnId?.trim() || undefined,
      seenEventIds: new Set(),
      expiresAt: Date.now() + APP_SERVER_EVENT_ROUTE_TTL_MS,
    };
    const key = routeKey(route);
    this.#closedRouteKeys.delete(key);
    this.#routes.set(key, route);
    this.#startDrainLoop();

    return {
      publish: (notifications) => {
        this.routeNotifications(notifications, eventName);
      },
    };
  }

  routeNotifications(
    notifications: AppServerJsonRpcNotification[] | undefined,
    fallbackEventName?: string,
  ): void {
    if (!notifications?.length) {
      return;
    }

    for (const notification of notifications) {
      this.#routeNotification(notification, fallbackEventName);
    }
  }

  async #drainLoop(): Promise<void> {
    if (this.#draining) {
      return;
    }

    this.#draining = true;
    try {
      while (this.#routes.size > 0) {
        this.#pruneExpiredRoutes();
        if (this.#routes.size === 0) {
          break;
        }

        const drainedMessages = await Promise.resolve(
          this.#appServerClient.drainEvents(APP_SERVER_EVENT_DRAIN_LIMIT),
        ).catch(() => []);
        const messages = Array.isArray(drainedMessages) ? drainedMessages : [];
        const notifications: AppServerJsonRpcNotification[] = [];
        for (const message of messages) {
          if (isAppServerJsonRpcNotification(message)) {
            notifications.push(message);
          }
        }
        this.routeNotifications(notifications);

        if (this.#routes.size > 0) {
          await waitForAppServerEventDrainInterval();
        }
      }
    } finally {
      this.#draining = false;
    }
  }

  #startDrainLoop(): void {
    if (this.#draining) {
      return;
    }
    void this.#drainLoop();
  }

  #routeNotification(
    notification: AppServerJsonRpcNotification,
    fallbackEventName?: string,
  ): void {
    const event = readAppServerAgentEvent(notification.params);
    if (!event) {
      if (fallbackEventName) {
        publishAppServerAgentSessionNotifications(fallbackEventName, [
          notification,
        ]);
      }
      return;
    }

    const matchedRoutes = this.#matchingRoutes(event);
    if (
      matchedRoutes.length === 0 &&
      fallbackEventName &&
      !this.#isClosedFallbackRoute(event, fallbackEventName)
    ) {
      publishAppServerAgentSessionNotifications(fallbackEventName, [
        notification,
      ]);
      return;
    }

    for (const route of matchedRoutes) {
      if (route.seenEventIds.has(event.eventId)) {
        continue;
      }
      route.seenEventIds.add(event.eventId);
      publishAppServerAgentSessionNotifications(route.eventName, [
        notification,
      ]);
      if (isTerminalAppServerAgentEvent(event)) {
        const key = routeKey(route);
        this.#closedRouteKeys.add(key);
        this.#routes.delete(key);
      }
    }
  }

  #isClosedFallbackRoute(
    event: AppServerAgentEvent,
    fallbackEventName: string,
  ): boolean {
    return (
      this.#closedRouteKeys.has(
        routeKey({
          eventName: fallbackEventName,
          sessionId: event.sessionId,
          turnId: event.turnId,
        }),
      ) ||
      this.#closedRouteKeys.has(
        routeKey({
          eventName: fallbackEventName,
          sessionId: event.sessionId,
        }),
      )
    );
  }

  #matchingRoutes(
    event: AppServerAgentEvent,
  ): AppServerAgentSessionEventRoute[] {
    const routes: AppServerAgentSessionEventRoute[] = [];
    for (const route of this.#routes.values()) {
      if (route.sessionId !== event.sessionId) {
        continue;
      }
      if (route.turnId && event.turnId && route.turnId !== event.turnId) {
        continue;
      }
      routes.push(route);
    }
    return routes;
  }

  #pruneExpiredRoutes(): void {
    const now = Date.now();
    for (const [key, route] of this.#routes) {
      if (route.expiresAt <= now) {
        this.#routes.delete(key);
      }
    }
  }
}

function isTerminalAppServerAgentEvent(event: AppServerAgentEvent): boolean {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.done" ||
    event.type === "turn.final_done" ||
    event.type === "turn.failed" ||
    event.type === "turn.canceled" ||
    event.type === "turn.cancelled"
  );
}

function routeKey(route: AppServerAgentSessionEventRouteParams): string {
  return `${route.sessionId}\u0000${route.turnId ?? ""}\u0000${route.eventName}`;
}

async function waitForAppServerEventDrainInterval(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, APP_SERVER_EVENT_DRAIN_INTERVAL_MS);
    const maybeUnref = (timer as { unref?: () => void } | undefined)?.unref;
    if (maybeUnref) {
      maybeUnref.call(timer);
    }
  });
}

export function publishAppServerAgentSessionNotifications(
  eventName: string | undefined,
  notifications: AppServerJsonRpcNotification[] | undefined,
): void {
  if (!eventName || !notifications?.length) {
    return;
  }

  for (const notification of notifications) {
    const payload = projectAppServerAgentEventPayload(notification);
    if (payload) {
      publishAgentRuntimeEvent(eventName, payload);
    }
  }
}

export function projectAppServerAgentEventPayload(
  notification: AppServerJsonRpcNotification,
): Record<string, unknown> | null {
  if (notification.method !== APP_SERVER_METHOD_AGENT_SESSION_EVENT) {
    return null;
  }

  const event = readAppServerAgentEvent(notification.params);
  if (!event) {
    return null;
  }

  const payload = normalizeRecord(event.payload) ?? {};
  const basePayload = {
    ...payload,
    event_id: event.eventId,
    sequence: event.sequence,
    session_id: event.sessionId,
    thread_id: event.threadId,
    turn_id: event.turnId,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case "message.delta":
      if (readString(payload, "type") === "text_delta_batch") {
        return projectTextDeltaBatchPayload(basePayload, payload);
      }
      return {
        ...basePayload,
        type: "text_delta",
        text: readString(payload, "text", "delta", "message") ?? "",
      };
    case "message.delta_batch":
    case "message.batch":
      return projectTextDeltaBatchPayload(basePayload, payload);
    case "message":
    case "message.completed":
      return {
        ...basePayload,
        type: "message",
        message: readAgentMessageFromPayload(payload, event.timestamp),
      };
    case "item.completed": {
      const item = readAgentThreadItemFromPayload(payload);
      if (item?.type === "agent_message") {
        return {
          ...basePayload,
          type: "message",
          message: readAgentMessageFromThreadItem(item, event.timestamp),
        };
      }
      return {
        ...basePayload,
        type: "item_completed",
        item,
      };
    }
    case "thinking.delta":
      return {
        ...basePayload,
        type: "thinking_delta",
        text: readString(payload, "text", "delta", "message") ?? "",
      };
    case "artifact.snapshot":
      return {
        ...basePayload,
        type: "artifact_snapshot",
      };
    case "action.required":
      return {
        ...basePayload,
        type: "action_required",
        request_id: readString(payload, "request_id", "requestId", "id") ?? "",
        action_type:
          readString(payload, "action_type", "actionType", "type") ??
          "tool_confirmation",
      };
    case "action.resolved":
      return {
        ...basePayload,
        type: "action_resolved",
        request_id: readString(payload, "request_id", "requestId", "id") ?? "",
        action_type:
          readString(payload, "action_type", "actionType", "type") ??
          "tool_confirmation",
      };
    case "runtime.status":
      return {
        ...basePayload,
        type: "runtime_status",
        status: normalizeRecord(payload.status) ?? payload,
      };
    case "turn.completed":
      return {
        ...basePayload,
        type: "turn_completed",
        text: readString(payload, "text", "delta", "message", "content"),
        usage: payload.usage,
        turn: normalizeRecord(payload.turn) ?? {
          id: event.turnId ?? "",
          thread_id: event.threadId ?? event.sessionId,
          prompt_text:
            readString(payload, "prompt_text", "promptText", "prompt") ?? "",
          status: "completed",
          started_at: event.timestamp,
          completed_at: event.timestamp,
          created_at: event.timestamp,
          updated_at: event.timestamp,
        },
      };
    case "turn.done":
      return {
        ...basePayload,
        type: "done",
        usage: payload.usage,
      };
    case "turn.final_done":
      return {
        ...basePayload,
        type: "final_done",
        usage: payload.usage,
      };
    case "turn.failed":
      return {
        ...basePayload,
        type: "error",
        message:
          readString(payload, "message", "error", "reason") ??
          "App Server turn failed",
      };
    case "turn.canceled":
    case "turn.cancelled":
      return {
        ...basePayload,
        type: "turn_completed",
        text: readString(payload, "text", "delta", "message", "content"),
        usage: payload.usage,
        turn: normalizeRecord(payload.turn) ?? {
          id: event.turnId ?? "",
          thread_id: event.threadId ?? event.sessionId,
          prompt_text:
            readString(payload, "prompt_text", "promptText", "prompt") ?? "",
          status: "canceled",
          started_at: event.timestamp,
          completed_at: event.timestamp,
          created_at: event.timestamp,
          updated_at: event.timestamp,
          error_message:
            readString(payload, "message", "error", "reason") ?? "本轮已中止",
        },
        message:
          readString(payload, "message", "error", "reason") ?? "本轮已中止",
      };
    default:
      return {
        ...basePayload,
        type: event.type.split(".").join("_"),
      };
  }
}

function readAppServerAgentEvent(params: unknown): AppServerAgentEvent | null {
  const record = normalizeRecord(params);
  const event = normalizeRecord(record?.event);
  if (!event) {
    return null;
  }

  const eventId = readString(event, "eventId", "event_id");
  const sessionId = readString(event, "sessionId", "session_id");
  const type = readString(event, "type");
  const timestamp = readString(event, "timestamp");
  const sequence = event.sequence;

  if (
    !eventId ||
    !sessionId ||
    !type ||
    !timestamp ||
    typeof sequence !== "number"
  ) {
    return null;
  }

  return {
    eventId,
    sequence,
    sessionId,
    threadId: readString(event, "threadId", "thread_id"),
    turnId: readString(event, "turnId", "turn_id"),
    type,
    timestamp,
    payload: event.payload,
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return undefined;
}

function projectTextDeltaBatchPayload(
  basePayload: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const chunks = readStringArray(payload, "chunks", "deltas") ?? [];
  return {
    ...basePayload,
    type: "text_delta_batch",
    text: readString(payload, "text", "delta", "message") ?? chunks.join(""),
    chunks,
    boundary:
      readString(payload, "boundary", "streamBoundary", "stream_kind") ??
      "provider",
  };
}

function readAgentMessageFromPayload(
  payload: Record<string, unknown>,
  timestamp: string,
) {
  const message = normalizeRecord(payload.message);
  const content = Array.isArray(message?.content)
    ? message.content
    : Array.isArray(payload.content)
      ? payload.content
      : readString(payload, "text", "delta", "message")
        ? [
            {
              type: "text",
              text: readString(payload, "text", "delta", "message") ?? "",
            },
          ]
        : [];

  return {
    id: readString(message ?? payload, "id", "messageId"),
    role: readString(message ?? payload, "role") ?? "assistant",
    content,
    timestamp: readTimestampMs(message?.timestamp, timestamp),
  };
}

function readAgentThreadItemFromPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const item = normalizeRecord(payload.item) ?? payload;
  const itemType = readString(item, "type");
  if (!itemType) {
    return undefined;
  }

  if (itemType === "agent_message") {
    return {
      ...item,
      type: "agent_message",
      text: readString(item, "text", "content", "message") ?? "",
      phase: readString(item, "phase"),
    };
  }

  return item;
}

function readAgentMessageFromThreadItem(
  item: Record<string, unknown>,
  timestamp: string,
) {
  return {
    id: readString(item, "id", "messageId"),
    role: "assistant",
    content: [
      {
        type: "text",
        text: readString(item, "text", "content", "message") ?? "",
      },
    ],
    timestamp: readTimestampMs(item.timestamp, timestamp),
  };
}

function readTimestampMs(value: unknown, fallback: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const parsedFallback = Date.parse(fallback);
  return Number.isFinite(parsedFallback) ? parsedFallback : Date.now();
}

export function appServerTurnStartParamsFromRequest(
  request: AgentRuntimeSubmitTurnRequest,
): AppServerAgentSessionTurnStartParams {
  return omitUndefined({
    sessionId: request.session_id,
    turnId: request.turn_id,
    input: omitUndefined({
      text: request.message,
      attachments: appServerAttachmentsFromImages(request.images),
    }),
    runtimeOptions: omitUndefined({
      stream: true,
      eventName: request.event_name,
      providerPreference: request.turn_config?.provider_preference,
      modelPreference: request.turn_config?.model_preference,
      metadata: request.turn_config?.metadata,
      queuedTurnId: request.queued_turn_id,
      hostOptions: {
        asterChatRequest: appServerAsterChatRequestFromRequest(request),
      },
    }),
    queueIfBusy: request.queue_if_busy,
    skipPreSubmitResume: request.skip_pre_submit_resume,
  });
}

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
    confirmed: request.confirmed,
    response: request.response,
    userData: request.user_data,
    metadata: request.metadata,
    eventName: request.event_name,
    actionScope: appServerActionScopeFromRequest(request.action_scope),
  });
}

function appServerAsterChatRequestFromRequest(
  request: AgentRuntimeSubmitTurnRequest,
): Record<string, unknown> {
  return omitUndefined({
    message: request.message,
    session_id: request.session_id,
    event_name: request.event_name,
    images: request.images,
    provider_config: request.turn_config?.provider_config,
    provider_preference: request.turn_config?.provider_preference,
    model_preference: request.turn_config?.model_preference,
    reasoning_effort: request.turn_config?.reasoning_effort,
    thinking_enabled: request.turn_config?.thinking_enabled,
    approval_policy: request.turn_config?.approval_policy,
    sandbox_policy: request.turn_config?.sandbox_policy,
    workspace_id: request.workspace_id ?? "",
    web_search: request.turn_config?.web_search,
    search_mode: request.turn_config?.search_mode,
    execution_strategy: request.turn_config?.execution_strategy,
    auto_continue: request.turn_config?.auto_continue,
    system_prompt: request.turn_config?.system_prompt,
    metadata: request.turn_config?.metadata,
    turn_id: request.turn_id,
    queue_if_busy: request.queue_if_busy,
    queued_turn_id: request.queued_turn_id,
  });
}

function appServerAttachmentsFromImages(
  images?: AgentRuntimeSubmitTurnRequest["images"],
): AppServerAgentAttachment[] | undefined {
  if (!images?.length) {
    return undefined;
  }

  return images.map((image, index) => ({
    kind: "image",
    uri: image.data,
    metadata: {
      mediaType: image.media_type,
      index,
    },
  }));
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
  getAgentRuntimeFileCheckpoint,
  getAgentRuntimeThreadRead,
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
