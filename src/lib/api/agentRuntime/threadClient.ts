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
  type AppServerRequestResult,
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
    try {
      const result = await appServerClient.startTurn(
        appServerTurnStartParamsFromRequest(request),
      );
      const turnId = resolveStartTurnRouteTurnId(result, request);
      const route = appServerEventRouter?.register({
        eventName: request.event_name,
        sessionId: request.session_id,
        turnId,
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
        turnId: request.turn_id,
      });
      throw error;
    }
  }

  async function interruptAgentRuntimeTurn(
    request: AgentRuntimeInterruptTurnRequest,
  ): Promise<boolean> {
    assertAppServerTurnLifecycleAvailable(isAppServerTurnLifecycleAvailable);
    await appServerClient.cancelTurn(
      appServerTurnCancelParamsFromRequest(request),
    );
    return true;
  }

  async function compactAgentRuntimeSession(
    request: AgentRuntimeCompactSessionRequest,
  ): Promise<void> {
    return await invokeCommand<void>(AGENT_RUNTIME_COMMANDS.compactSession, {
      request,
    });
  }

  async function resumeAgentRuntimeThread(
    request: AgentRuntimeResumeThreadRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(AGENT_RUNTIME_COMMANDS.resumeThread, {
      request,
    });
  }

  async function replayAgentRuntimeRequest(
    request: AgentRuntimeReplayRequestRequest,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null> {
    return await invokeCommand<AgentRuntimeReplayedActionRequiredView | null>(
      AGENT_RUNTIME_COMMANDS.replayRequest,
      {
        request,
      },
    );
  }

  async function removeAgentRuntimeQueuedTurn(
    request: AgentRuntimeRemoveQueuedTurnRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(
      AGENT_RUNTIME_COMMANDS.removeQueuedTurn,
      {
        request,
      },
    );
  }

  async function promoteAgentRuntimeQueuedTurn(
    request: AgentRuntimePromoteQueuedTurnRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(
      AGENT_RUNTIME_COMMANDS.promoteQueuedTurn,
      { request },
    );
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
    return await invokeCommand<AgentRuntimeFileCheckpointListResult>(
      AGENT_RUNTIME_COMMANDS.listFileCheckpoints,
      { request },
    );
  }

  async function getAgentRuntimeFileCheckpoint(
    request: AgentRuntimeGetFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDetail> {
    return await invokeCommand<AgentRuntimeFileCheckpointDetail>(
      AGENT_RUNTIME_COMMANDS.getFileCheckpoint,
      { request },
    );
  }

  async function diffAgentRuntimeFileCheckpoint(
    request: AgentRuntimeDiffFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDiffResult> {
    return await invokeCommand<AgentRuntimeFileCheckpointDiffResult>(
      AGENT_RUNTIME_COMMANDS.diffFileCheckpoint,
      { request },
    );
  }

  async function restoreAgentRuntimeFileCheckpoint(
    request: AgentRuntimeRestoreFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointRestoreResult> {
    return await invokeCommand<AgentRuntimeFileCheckpointRestoreResult>(
      AGENT_RUNTIME_COMMANDS.restoreFileCheckpoint,
      { request },
    );
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
  sessionId: string;
  turnId?: string;
};

type AppServerAgentSessionTurnStartResult = AppServerRequestResult<{
  turn?: {
    turnId?: string;
  };
}> | {
  result?: {
    turn?: {
      turnId?: string;
    };
  };
  notifications?: AppServerJsonRpcNotification[];
};

class AppServerAgentSessionEventDrainRouter {
  readonly #appServerClient: AgentRuntimeAppServerClient;
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
      expiresAt: Date.now() + APP_SERVER_EVENT_ROUTE_TTL_MS,
    };
    this.#routes.set(routeKey(route), route);
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

        const messages = await this.#appServerClient
          .drainEvents(APP_SERVER_EVENT_DRAIN_LIMIT)
          .catch(() => []);
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
    if (matchedRoutes.length === 0 && fallbackEventName) {
      publishAppServerAgentSessionNotifications(fallbackEventName, [
        notification,
      ]);
      return;
    }

    for (const route of matchedRoutes) {
      publishAppServerAgentSessionNotifications(route.eventName, [
        notification,
      ]);
      if (isTerminalAppServerAgentEvent(event)) {
        this.#routes.delete(routeKey(route));
      }
    }
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
    event.type === "turn.done" ||
    event.type === "turn.final_done" ||
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "turn.canceled" ||
    event.type === "turn.cancelled"
  );
}

function routeKey(route: AppServerAgentSessionEventRoute): string {
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

function resolveStartTurnRouteTurnId(
  result: AppServerAgentSessionTurnStartResult,
  request: AgentRuntimeSubmitTurnRequest,
): string | undefined {
  const resultTurnId = result.result?.turn?.turnId?.trim();
  if (resultTurnId) {
    return resultTurnId;
  }

  const requestTurnId = request.turn_id?.trim();
  if (requestTurnId) {
    return requestTurnId;
  }

  for (const notification of result.notifications ?? []) {
    const event = readAppServerAgentEvent(notification.params);
    const notificationTurnId = event?.turnId?.trim();
    if (notificationTurnId) {
      return notificationTurnId;
    }
  }

  return undefined;
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
      return {
        ...basePayload,
        type: "text_delta",
        text: readString(payload, "text", "delta", "message") ?? "",
      };
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
    case "turn.done":
    case "turn.completed":
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
        type: "error",
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
        asterChatRequest: request,
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
