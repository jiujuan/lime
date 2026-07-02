import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerRpcError,
  type AppServerAgentEvent,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import {
  getDefaultAppServerEventBus,
  type AppServerEventBus,
} from "@/lib/api/appServerEventBus";
import { publishProcessedAgentRuntimeEvent } from "../agentRuntimeEvents";
import { projectAgentRuntimeSequenceGateNotifications } from "./eventSequenceGate";

const APP_SERVER_EVENT_DRAIN_LIMIT = 50;
const APP_SERVER_EVENT_DRAIN_FAST_FIRST_LIMIT = 1;
const APP_SERVER_EVENT_DRAIN_FAST_FIRST_INTERVAL_MS = 24;
const APP_SERVER_EVENT_DRAIN_INTERVAL_MS = 250;
const APP_SERVER_EVENT_ROUTE_TTL_MS = 30 * 60 * 1000;

type AppServerEventDrainClient = {
  drainEvents: (limit?: number) => Promise<unknown[]> | unknown[];
};
type AppServerEventBusLike = Pick<AppServerEventBus, "subscribe">;

export type AppServerAgentSessionEventRouteParams = {
  eventName?: string;
  sessionId?: string;
  turnId?: string;
};

type AppServerAgentSessionEventRoute = {
  eventName: string;
  expiresAt: number;
  hasPublishedEvent: boolean;
  seenEventIds: Set<string>;
  sessionId: string;
  turnId?: string;
};

export class AppServerAgentSessionEventDrainRouter {
  readonly #closedRouteKeys = new Set<string>();
  readonly #eventBus: AppServerEventBusLike;
  readonly #routes = new Map<string, AppServerAgentSessionEventRoute>();
  #unsubscribeFromEventBus: (() => void) | null = null;

  constructor(
    appServerClient: AppServerEventDrainClient,
    eventBus: AppServerEventBusLike = getDefaultAppServerEventBus(
      appServerClient,
    ),
  ) {
    this.#eventBus = eventBus;
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
      hasPublishedEvent: false,
    };
    const key = routeKey(route);
    this.#closedRouteKeys.delete(key);
    this.#routes.set(key, route);
    this.#ensureEventBusSubscription();

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

    for (const notification of sortAppServerAgentSessionNotifications(
      notifications,
    )) {
      this.#routeNotification(notification, fallbackEventName);
    }
    this.#stopEventBusSubscriptionIfIdle();
  }

  #ensureEventBusSubscription(): void {
    if (this.#unsubscribeFromEventBus) {
      return;
    }

    this.#unsubscribeFromEventBus = this.#eventBus.subscribe({
      getDrainOptions: () => {
        this.#pruneExpiredRoutes();
        if (this.#hasRouteWaitingForFirstEvent()) {
          return {
            intervalMs: APP_SERVER_EVENT_DRAIN_FAST_FIRST_INTERVAL_MS,
            limit: APP_SERVER_EVENT_DRAIN_FAST_FIRST_LIMIT,
          };
        }
        return {
          intervalMs: APP_SERVER_EVENT_DRAIN_INTERVAL_MS,
          limit: APP_SERVER_EVENT_DRAIN_LIMIT,
        };
      },
      onNotifications: (notifications) => {
        this.routeNotifications(notifications);
      },
    });
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
      route.hasPublishedEvent = true;
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

  #hasRouteWaitingForFirstEvent(): boolean {
    for (const route of this.#routes.values()) {
      if (!route.hasPublishedEvent) {
        return true;
      }
    }
    return false;
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
    this.#stopEventBusSubscriptionIfIdle();
  }

  #stopEventBusSubscriptionIfIdle(): void {
    if (this.#routes.size > 0 || !this.#unsubscribeFromEventBus) {
      return;
    }
    this.#unsubscribeFromEventBus();
    this.#unsubscribeFromEventBus = null;
  }
}

export function publishAppServerRpcErrorNotifications(
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

function isTerminalAppServerAgentEvent(event: AppServerAgentEvent): boolean {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "turn.canceled"
  );
}

function routeKey(route: AppServerAgentSessionEventRouteParams): string {
  return `${route.sessionId}\u0000${route.turnId ?? ""}\u0000${route.eventName}`;
}

function parseEventTimestampMs(timestamp: string | undefined): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortAppServerAgentSessionNotifications(
  notifications: AppServerJsonRpcNotification[],
): AppServerJsonRpcNotification[] {
  if (notifications.length <= 1) {
    return notifications;
  }

  return notifications
    .map((notification, index) => ({
      notification,
      event: readAppServerAgentEvent(notification.params),
      index,
    }))
    .sort((left, right) => {
      const leftEvent = left.event;
      const rightEvent = right.event;
      if (!leftEvent || !rightEvent) {
        return left.index - right.index;
      }
      if (leftEvent.sessionId !== rightEvent.sessionId) {
        return left.index - right.index;
      }
      if ((leftEvent.turnId ?? "") !== (rightEvent.turnId ?? "")) {
        return left.index - right.index;
      }
      if (leftEvent.sequence !== rightEvent.sequence) {
        return leftEvent.sequence - rightEvent.sequence;
      }
      return left.index - right.index;
    })
    .map(({ notification }) => notification);
}

export function publishAppServerAgentSessionNotifications(
  eventName: string | undefined,
  notifications: AppServerJsonRpcNotification[] | undefined,
): void {
  if (!eventName || !notifications?.length) {
    return;
  }

  for (const notification of sortAppServerAgentSessionNotifications(
    notifications,
  )) {
    publishAppServerAgentSessionNotificationsFromPipeline(eventName, [
      notification,
    ]);
  }
}

export function publishAppServerAgentSessionNotificationsFromPipeline(
  eventName: string | undefined,
  notifications: AppServerJsonRpcNotification[] | undefined,
): void {
  if (!eventName || !notifications?.length) {
    return;
  }

  for (const notification of notifications) {
    const processedNotifications = projectAgentRuntimeSequenceGateNotifications(
      eventName,
      notification,
    );
    for (const processedNotification of processedNotifications) {
      const payload = projectAppServerAgentEventPayload(processedNotification);
      if (payload) {
        publishProcessedAgentRuntimeEvent(eventName, payload);
      }
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
  if (isLegacyTurnTerminalAppServerEventType(event.type)) {
    return null;
  }
  if (event.type.startsWith("workflow.")) {
    return null;
  }

  const payload = normalizeRecord(event.payload) ?? {};
  const rendererEventReceivedAt = Date.now();
  const basePayload = {
    ...payload,
    event_id: event.eventId,
    renderer_event_received_at: rendererEventReceivedAt,
    sequence: event.sequence,
    server_event_emitted_at: parseEventTimestampMs(event.timestamp) ?? null,
    session_id: event.sessionId,
    thread_id: event.threadId,
    turn_id: event.turnId,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case "thread.started":
      return {
        ...basePayload,
        type: "thread_started",
        thread_id: event.threadId ?? event.sessionId,
      };
    case "turn.started":
      return {
        ...basePayload,
        type: "turn_started",
        turn: readAgentThreadTurnFromPayload(payload, event, "running"),
      };
    case "item.started":
      return {
        ...basePayload,
        type: "item_started",
        item: readAgentThreadItemFromPayload(payload, event, "in_progress"),
      };
    case "item.updated":
      return {
        ...basePayload,
        type: "item_updated",
        item: readAgentThreadItemFromPayload(payload, event, "in_progress"),
      };
    case "message.created":
      return {
        ...basePayload,
        type: "item_started",
        item: readUserMessageItemFromPayload(payload, event),
      };
    case "message.delta":
      if (readString(payload, "type") === "text_delta_batch") {
        return projectTextDeltaBatchPayload(basePayload, payload);
      }
      return {
        ...basePayload,
        type: "text_delta",
        text: readAgentMessageDeltaText(payload) ?? "",
        itemId: readAgentMessageItemId(payload),
        item_id: readAgentMessageItemId(payload),
        phase: readAgentMessagePhase(payload),
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
      const item = readAgentThreadItemFromPayload(payload, event, "completed");
      return {
        ...basePayload,
        type: "item_completed",
        item,
      };
    }
    case "reasoning.delta":
      return {
        ...basePayload,
        type: "reasoning_delta",
        reasoningId: readString(payload, "reasoningId", "reasoning_id", "id"),
        text: readString(payload, "text", "delta", "message") ?? "",
        delta: readString(payload, "delta", "text", "message") ?? "",
        model: normalizeRecord(payload.model),
        providerMetadata:
          normalizeRecord(payload.providerMetadata) ??
          normalizeRecord(payload.provider_metadata),
      };
    case "reasoning.started":
      return {
        ...basePayload,
        type: "reasoning_started",
        reasoningId: readString(payload, "reasoningId", "reasoning_id", "id"),
        model: normalizeRecord(payload.model),
        providerMetadata:
          normalizeRecord(payload.providerMetadata) ??
          normalizeRecord(payload.provider_metadata),
      };
    case "reasoning.final":
      return {
        ...basePayload,
        type: "reasoning_final",
        reasoningId: readString(payload, "reasoningId", "reasoning_id", "id"),
        text: readString(payload, "text", "delta", "message") ?? "",
        model: normalizeRecord(payload.model),
        providerMetadata:
          normalizeRecord(payload.providerMetadata) ??
          normalizeRecord(payload.provider_metadata),
      };
    case "reasoning.ended":
      return {
        ...basePayload,
        type: "reasoning_ended",
        reasoningId: readString(payload, "reasoningId", "reasoning_id", "id"),
        status: readString(payload, "status"),
        model: normalizeRecord(payload.model),
        providerMetadata:
          normalizeRecord(payload.providerMetadata) ??
          normalizeRecord(payload.provider_metadata),
      };
    case "thinking.delta":
      return {
        ...basePayload,
        type: "thinking_delta",
        text: readString(payload, "text", "delta", "message") ?? "",
      };
    case "provider.request.started":
    case "provider.first_event.received":
    case "provider.first_text_delta.received":
    case "provider.failed":
    case "provider.canceled":
      return {
        ...basePayload,
        type: "provider_trace",
        runtime_event_type: event.type,
        stage:
          readString(payload, "stage") ??
          providerTraceStageFromEventType(event.type),
        provider: readString(payload, "provider", "providerId", "provider_id"),
        model: readString(payload, "model", "modelName", "model_name"),
        attempt: readFiniteNumber(payload, "attempt"),
        elapsed_ms: readFiniteNumber(payload, "elapsed_ms", "elapsedMs"),
        text_chars: readFiniteNumber(payload, "text_chars", "textChars"),
        status: readString(payload, "status"),
        failure_category: readString(
          payload,
          "failure_category",
          "failureCategory",
        ),
        retryable: readBoolean(payload, "retryable"),
        non_retryable_provider_rejection: readBoolean(
          payload,
          "non_retryable_provider_rejection",
          "nonRetryableProviderRejection",
        ),
        cancel_reason: readString(payload, "cancel_reason", "cancelReason"),
        provider_request_id: readString(
          payload,
          "provider_request_id",
          "providerRequestId",
        ),
        provider_request_id_header: readString(
          payload,
          "provider_request_id_header",
          "providerRequestIdHeader",
        ),
      };
    case "plan.delta":
    case "plan.final":
      return {
        ...basePayload,
        type: event.type === "plan.final" ? "plan_final" : "plan_delta",
        text: readString(payload, "text", "delta", "message", "content") ?? "",
        delta: readString(payload, "delta", "text", "message", "content"),
        plan: payload.plan,
        explanation: readString(payload, "explanation"),
        sourceItemId: readString(payload, "sourceItemId", "source_item_id"),
        toolCallId: readString(payload, "toolCallId", "tool_call_id"),
        revisionId: readString(payload, "revisionId", "revision_id"),
        source: readString(payload, "source"),
      };
    case "model.effective":
      return {
        ...basePayload,
        type: "model_effective",
        model: payload.model,
        modelRef: payload.modelRef ?? payload.model_ref,
        provider: readString(payload, "provider", "providerId", "provider_id"),
        modelName: readString(
          payload,
          "modelName",
          "model_name",
          "modelId",
          "model_id",
        ),
        source: readString(payload, "source"),
        serviceModelSlot: readString(
          payload,
          "serviceModelSlot",
          "service_model_slot",
        ),
        reasoning: payload.reasoning,
        capability: payload.capability,
        toolCalling: payload.toolCalling ?? payload.tool_calling,
        requestedReasoningEffort: readString(
          payload,
          "requestedReasoningEffort",
          "requested_reasoning_effort",
        ),
      };
    case "tool.started":
      return {
        ...basePayload,
        type: "tool_start",
        tool_name: readString(payload, "tool_name", "toolName", "name") ?? "",
        tool_id: readToolCallId(payload) ?? "",
        arguments: normalizeToolArguments(
          payload.arguments ??
            payload.args ??
            payload.input ??
            payload.parameters,
        ),
      };
    case "tool.args":
      return {
        ...basePayload,
        type: "tool_input_delta",
        tool_id: readToolCallId(payload) ?? "",
        tool_name: readToolName(payload),
        delta: normalizeToolArguments(
          payload.rawArgs ??
            payload.raw_args ??
            payload.args ??
            payload.arguments ??
            payload.input,
        ),
        accumulated_arguments: normalizeToolArguments(
          payload.rawArgs ??
            payload.raw_args ??
            payload.args ??
            payload.arguments ??
            payload.input,
        ),
        provider: readString(payload, "provider", "source"),
      };
    case "tool.args.delta":
    case "tool.input.delta":
      return {
        ...basePayload,
        type: "tool_input_delta",
        tool_id: readToolCallId(payload) ?? "",
        tool_name: readToolName(payload),
        delta: readString(payload, "delta", "text", "chunk") ?? "",
        accumulated_arguments: readString(
          payload,
          "accumulated_arguments",
          "accumulatedArguments",
          "rawArgs",
          "raw_args",
        ),
        provider: readString(payload, "provider", "source"),
      };
    case "tool.progress":
      return {
        ...basePayload,
        type: "tool_progress",
        tool_id: readToolCallId(payload) ?? "",
        progress: {
          message: readString(payload, "message", "detail", "title"),
          progress: readFiniteNumber(payload, "progress", "completed"),
          total: readFiniteNumber(payload, "total"),
          metadata: normalizeRecord(payload.metadata),
        },
      };
    case "tool.output.delta":
      return {
        ...basePayload,
        type: "tool_output_delta",
        tool_id: readToolCallId(payload) ?? "",
        delta: readString(payload, "delta", "text", "output", "preview") ?? "",
        output_kind:
          readString(payload, "output_kind", "outputKind", "stream") ??
          undefined,
        metadata: normalizeRecord(payload.metadata),
      };
    case "tool.result":
      return {
        ...basePayload,
        type: "tool_end",
        tool_id: readToolCallId(payload) ?? "",
        result: normalizeToolExecutionResult(payload),
      };
    case "image_task.created": {
      const response = normalizeRecord(payload.response);
      const responseSource = response ?? {};
      const record = normalizeRecord(response?.record);
      const responsePayload = normalizeRecord(record?.payload);
      return {
        ...basePayload,
        type: "image_task_created",
        task_id:
          readString(payload, "task_id", "taskId") ??
          readString(responseSource, "task_id", "taskId") ??
          "",
        task_type:
          readString(payload, "task_type", "taskType") ??
          readString(responseSource, "task_type", "taskType"),
        task_family:
          readString(payload, "task_family", "taskFamily") ??
          readString(responseSource, "task_family", "taskFamily"),
        status:
          readString(payload, "status") ?? readString(responseSource, "status"),
        normalized_status:
          readString(payload, "normalized_status", "normalizedStatus") ??
          readString(responseSource, "normalized_status", "normalizedStatus"),
        artifact_path:
          readString(payload, "artifact_path", "artifactPath") ??
          readString(responseSource, "artifact_path", "artifactPath"),
        absolute_path:
          readString(payload, "absolute_path", "absolutePath") ??
          readString(responseSource, "absolute_path", "absolutePath"),
        ...(response ? { response } : {}),
        ...(responsePayload ? { payload: responsePayload } : {}),
      };
    }
    case "image_task.parameters.required":
    case "image_task_parameters_required": {
      const missing =
        readStringArray(
          payload,
          "missing",
          "missingParameters",
          "missing_parameters",
        ) ?? [];
      const prompt =
        readString(payload, "prompt", "message", "reason") ??
        "图片生成还需要补充必要信息。";
      return {
        ...basePayload,
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "图片生成需要补充信息",
          detail: missing.length > 0 ? `缺少: ${missing.join(", ")}` : prompt,
          checkpoints: missing,
          metadata: {
            source: readString(payload, "source") ?? "image_command_workflow",
            agentui: {
              workflow_key: "image_command_workflow",
              status_kind: "image_task_parameters_required",
              missing,
              missing_parameters: missing,
              image_task: normalizeRecord(payload.image_task),
            },
          },
        },
      };
    }
    case "file.read":
      return {
        ...basePayload,
        type: "item_completed",
        item: readFileReadItemFromPayload(payload, event),
      };
    case "command.started":
      return {
        ...basePayload,
        type: "item_started",
        item: readCommandExecutionItemFromPayload(
          payload,
          event,
          "in_progress",
        ),
      };
    case "command.output":
      return {
        ...basePayload,
        type: "item_updated",
        item: readCommandExecutionItemFromPayload(
          payload,
          event,
          "in_progress",
        ),
      };
    case "patch.started":
      return {
        ...basePayload,
        type: "item_started",
        item: readPatchItemFromPayload(payload, event, "in_progress"),
      };
    case "patch.applied":
    case "patch.completed":
      return {
        ...basePayload,
        type: "item_completed",
        item: readPatchItemFromPayload(payload, event, "completed"),
      };
    case "patch.failed":
      return {
        ...basePayload,
        type: "item_completed",
        item: readPatchItemFromPayload(payload, event, "failed"),
      };
    case "command.exited": {
      const exitCode = readFiniteNumber(payload, "exitCode", "exit_code");
      return {
        ...basePayload,
        type: "item_completed",
        item: readCommandExecutionItemFromPayload(
          payload,
          event,
          typeof exitCode === "number" && exitCode !== 0
            ? "failed"
            : "completed",
        ),
      };
    }
    case "artifact.snapshot":
      return {
        ...basePayload,
        type: "artifact_snapshot",
        artifact: readArtifactSnapshotSignalFromPayload(payload, event),
      };
    case "agent_app_worker.hook":
      return {
        ...basePayload,
        type: "item_completed",
        item: readAgentAppWorkerHookItemFromPayload(payload, event),
      };
    case "agent_app_worker.retry":
      return {
        ...basePayload,
        type: "item_completed",
        item: readAgentAppWorkerRetryItemFromPayload(payload, event),
      };
    case "workflow.run.started":
    case "workflow.run.retrying":
    case "workflow.step.started":
    case "workflow.step.retrying":
    case "workflow.tool.started":
    case "workflow.connector.requested":
    case "workflow.connector.completed":
    case "workflow.hook.started":
    case "workflow.hook.completed":
    case "workflow.artifact.delta":
    case "workflow.step.progress":
    case "workflow.step.completed":
    case "workflow.tool.completed":
    case "workflow.run.completed":
    case "workflow.step.failed":
    case "workflow.run.failed":
      return null;
    case "action.required":
      return {
        ...basePayload,
        type: "action_required",
        request_id: readString(payload, "request_id", "requestId", "id") ?? "",
        action_type:
          readString(payload, "action_type", "actionType", "type") ??
          "tool_confirmation",
        scope: readActionScope(payload, event),
        tool_name: readToolName(payload),
        arguments:
          normalizeRecord(payload.arguments) ?? normalizeRecord(payload.data),
        prompt: readString(payload, "prompt", "message", "reason"),
        questions: readActionQuestions(payload),
        requested_schema:
          normalizeRecord(payload.requested_schema) ??
          normalizeRecord(payload.requestedSchema) ??
          normalizeRecord(payload.schema),
      };
    case "action.resolved":
      return {
        ...basePayload,
        type: "action_resolved",
        request_id: readString(payload, "request_id", "requestId", "id") ?? "",
        action_type:
          readString(payload, "action_type", "actionType", "type") ??
          "tool_confirmation",
        scope: readActionScope(payload, event),
        approved: readBoolean(payload, "approved", "confirmed", "approve"),
        feedback: readString(payload, "feedback", "message", "reason"),
        permission_mode: readString(
          payload,
          "permission_mode",
          "permissionMode",
        ),
        data: readActionResolvedData(payload),
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
    case "turn.failed":
      return {
        ...basePayload,
        type: "turn_failed",
        turn: normalizeRecord(payload.turn) ?? {
          id: event.turnId ?? "",
          thread_id: event.threadId ?? event.sessionId,
          prompt_text:
            readString(payload, "prompt_text", "promptText", "prompt") ?? "",
          status: "failed",
          started_at: event.timestamp,
          completed_at: event.timestamp,
          created_at: event.timestamp,
          updated_at: event.timestamp,
          error_message:
            readString(payload, "message", "error", "reason") ??
            "App Server turn failed",
        },
      };
    case "turn.canceled":
      return {
        ...basePayload,
        type: "turn_canceled",
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
          error_message: "本轮已中止",
        },
      };
    default:
      return {
        ...basePayload,
        type: event.type.split(".").join("_"),
      };
  }
}

function isLegacyTurnTerminalAppServerEventType(type: string): boolean {
  return (
    type === "done" ||
    type === "final_done" ||
    type === "cancelled" ||
    type === "turn.done" ||
    type === "turn.final_done" ||
    type === "turn.cancelled"
  );
}

export function readAppServerAgentEvent(
  params: unknown,
): AppServerAgentEvent | null {
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

function readBoolean(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readFiniteNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function providerTraceStageFromEventType(type: string): string | undefined {
  switch (type) {
    case "provider.request.started":
      return "request_started";
    case "provider.first_event.received":
      return "first_event_received";
    case "provider.first_text_delta.received":
      return "first_text_delta_received";
    case "provider.failed":
      return "failed";
    case "provider.canceled":
      return "canceled";
    default:
      return undefined;
  }
}

function readToolCallId(record: Record<string, unknown>): string | undefined {
  return readString(
    record,
    "toolCallId",
    "tool_call_id",
    "toolId",
    "tool_id",
    "commandId",
    "command_id",
    "id",
  );
}

function readToolName(record: Record<string, unknown>): string | undefined {
  return readString(record, "toolName", "tool_name", "name");
}

function normalizeToolArguments(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeToolResultOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeToolExecutionResult(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawResult = normalizeRecord(payload.result);
  const source = rawResult ?? payload;
  const error = readString(source, "error", "message");
  const metadata = normalizeRecord(source.metadata);
  const success =
    typeof source.success === "boolean" ? source.success : error ? false : true;

  return {
    success,
    output: normalizeToolResultOutput(
      source.output ?? source.text ?? source.content,
    ),
    ...(error ? { error } : {}),
    ...(Array.isArray(source.images) ? { images: source.images } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function readArtifactSnapshotSignalFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const artifact = normalizeRecord(payload.artifact) ?? payload;
  const artifactRef = readString(
    artifact,
    "artifactRef",
    "artifact_ref",
    "artifactId",
    "artifact_id",
    "id",
  );
  const artifactId =
    readString(artifact, "artifactId", "artifact_id", "id", "artifactRef") ??
    event.eventId;
  const filePath = readString(
    artifact,
    "filePath",
    "file_path",
    "path",
    "artifactPath",
    "artifact_path",
  );
  const sidecarRef =
    normalizeRecord(artifact.sidecarRef) ?? normalizeRecord(payload.sidecarRef);
  const metadata = {
    ...(normalizeRecord(artifact.metadata) ??
      normalizeRecord(payload.metadata) ??
      {}),
    sessionId: event.sessionId,
    ...(event.threadId ? { threadId: event.threadId } : {}),
    ...(event.turnId ? { turnId: event.turnId } : {}),
    artifactId,
    ...(artifactRef ? { artifactRef, appServerArtifactRef: artifactRef } : {}),
    ...(filePath ? { filePath } : {}),
    ...(sidecarRef ? { sidecarRef } : {}),
    ...copyDefinedFields(artifact, [
      "contentStatus",
      "contentBytes",
      "contentSha256",
    ]),
    ...copyDefinedFields(payload, [
      "contentStatus",
      "contentBytes",
      "contentSha256",
    ]),
  };
  return {
    ...artifact,
    artifactId,
    artifact_id: readString(artifact, "artifact_id") ?? artifactId,
    ...(artifactRef ? { artifactRef, artifact_ref: artifactRef } : {}),
    ...(filePath ? { filePath, file_path: filePath } : {}),
    ...(typeof artifact.content === "string"
      ? { content: artifact.content }
      : typeof payload.content === "string"
        ? { content: payload.content }
        : {}),
    metadata,
  };
}

function copyDefinedFields(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .map((key) => [key, record[key]] as const)
      .filter(([, value]) => typeof value !== "undefined"),
  );
}

function normalizeAgentAppWorkerTimelineStatus(
  status: string | undefined,
): "completed" | "failed" {
  return status === "failed" || status === "error" ? "failed" : "completed";
}

function readAgentAppWorkerHookItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const status = readString(payload, "status");
  const hookKey = readString(payload, "hookKey", "hook_key") ?? "hook";
  const hookEvent = readString(payload, "hookEvent", "hook_event");
  const hookScope = readString(payload, "hookScope", "hook_scope");
  const reasonCode = readString(payload, "reasonCode", "reason_code");
  const resultSummary = readString(
    payload,
    "resultSummary",
    "result_summary",
    "message",
    "summary",
  );
  const text =
    resultSummary ??
    [hookScope, hookEvent, hookKey, status, reasonCode]
      .filter(Boolean)
      .join(" · ");
  return {
    ...readAgentThreadItemBase(
      payload,
      event,
      normalizeAgentAppWorkerTimelineStatus(status),
    ),
    id: `${event.eventId}:agent-app-worker-hook`,
    type: "turn_summary",
    text,
    metadata: {
      source: "agent_app_worker.hook",
      eventType: event.type,
      status,
      hookKey,
      hookEvent,
      hookScope,
      reasonCode,
      resultSummary,
      agentAppWorker: normalizeRecord(payload.agentAppWorker),
      agent_app_worker: normalizeRecord(payload.agent_app_worker),
      raw: payload,
    },
  };
}

function readAgentAppWorkerRetryItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const status = readString(payload, "status") ?? "failed";
  const message =
    readString(
      payload,
      "message",
      "errorMessage",
      "error_message",
      "error",
      "retryAdvice",
      "retry_advice",
    ) ?? "agent_app_worker.retry";
  return {
    ...readAgentThreadItemBase(
      payload,
      event,
      normalizeAgentAppWorkerTimelineStatus(status),
    ),
    id: `${event.eventId}:agent-app-worker-retry`,
    type: "turn_summary",
    text: message,
    metadata: {
      source: "agent_app_worker.retry",
      eventType: event.type,
      status,
      retryAttempt: readFiniteNumber(payload, "retryAttempt", "retry_attempt"),
      retryMaxAttempts: readFiniteNumber(
        payload,
        "retryMaxAttempts",
        "retry_max_attempts",
      ),
      failureCategory: readString(
        payload,
        "failureCategory",
        "failure_category",
      ),
      errorCode: readString(payload, "errorCode", "error_code"),
      agentAppWorker: normalizeRecord(payload.agentAppWorker),
      agent_app_worker: normalizeRecord(payload.agent_app_worker),
      raw: payload,
    },
  };
}

function readCommandString(payload: Record<string, unknown>): string {
  const argv = Array.isArray(payload.commandArgv)
    ? payload.commandArgv.filter(
        (part): part is string => typeof part === "string",
      )
    : [];
  return (
    readString(
      payload,
      "canonicalCommand",
      "canonical_command",
      "command",
      "commandSummary",
      "command_summary",
    ) ??
    argv.join(" ") ??
    ""
  );
}

function readCommandOutput(payload: Record<string, unknown>): string {
  return (
    readString(
      payload,
      "aggregated_output",
      "aggregatedOutput",
      "output",
      "preview",
      "delta",
      "text",
    ) ?? ""
  );
}

function readCommandExecutionItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
  status: "in_progress" | "completed" | "failed",
): Record<string, unknown> {
  const commandId = readToolCallId(payload) ?? event.eventId;
  const startedAt =
    readString(payload, "startedAt", "started_at", "timestamp") ??
    event.timestamp;
  const exitCode = readFiniteNumber(payload, "exitCode", "exit_code");
  const metadata = normalizeRecord(payload.metadata);
  return {
    id: commandId,
    thread_id: event.threadId ?? event.sessionId,
    turn_id: event.turnId ?? "",
    sequence: event.sequence,
    status,
    started_at: startedAt,
    completed_at: status === "in_progress" ? undefined : event.timestamp,
    updated_at: event.timestamp,
    type: "command_execution",
    command: readCommandString(payload),
    cwd: readString(payload, "cwd", "workingDirectory", "working_dir") ?? "",
    aggregated_output: readCommandOutput(payload),
    exit_code: exitCode,
    error: readString(payload, "error", "message"),
    metadata: {
      ...(metadata ?? {}),
      eventClass: event.type,
      outputRef: readString(payload, "outputRef", "output_ref"),
      contentRef: readString(payload, "contentRef", "content_ref"),
      refIds: readStringArray(payload, "refIds", "ref_ids"),
    },
  };
}

function readPatchItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
  status: "in_progress" | "completed" | "failed",
): Record<string, unknown> {
  const patchId =
    readString(
      payload,
      "patchId",
      "patch_id",
      "toolCallId",
      "tool_call_id",
      "id",
    ) ?? event.eventId;
  const paths = readPatchPaths(payload);
  const stdout = readString(payload, "stdout", "output", "summary");
  const stderr = readString(payload, "stderr", "error", "message", "reason");
  const metadata = normalizeRecord(payload.metadata);
  return {
    id: patchId,
    thread_id: event.threadId ?? event.sessionId,
    turn_id: event.turnId ?? "",
    sequence: event.sequence,
    status,
    started_at:
      readString(payload, "startedAt", "started_at", "timestamp") ??
      event.timestamp,
    completed_at: status === "in_progress" ? undefined : event.timestamp,
    updated_at: event.timestamp,
    type: "patch",
    text:
      readString(payload, "text", "patch", "message") ??
      (paths.length > 0
        ? `Patch changed ${paths.join(", ")}`
        : "Patch applied"),
    summary: paths.length > 0 ? paths : undefined,
    paths: paths.length > 0 ? paths : undefined,
    success:
      readBoolean(payload, "success") ??
      (status === "failed" ? false : status === "completed" ? true : undefined),
    stdout,
    stderr,
    metadata: {
      ...(metadata ?? {}),
      eventClass: event.type,
      autoApproved: readBoolean(payload, "autoApproved", "auto_approved"),
      status: readString(payload, "status"),
    },
  };
}

function readPatchPaths(payload: Record<string, unknown>): string[] {
  const directPaths =
    readStringArray(payload, "paths", "changedFiles", "changed_files") ?? [];
  if (directPaths.length > 0) {
    return directPaths;
  }

  const changes = normalizeRecord(payload.changes);
  if (!changes) {
    return [];
  }
  return Object.keys(changes).filter(Boolean);
}

function readFileReadItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const path = readString(payload, "path", "filePath", "file_path") ?? "";
  const contentRef = readString(payload, "contentRef", "content_ref");
  const outputRef = readString(payload, "outputRef", "output_ref");
  const metadata = normalizeRecord(payload.metadata);
  return {
    id: readToolCallId(payload) ?? event.eventId,
    thread_id: event.threadId ?? event.sessionId,
    turn_id: event.turnId ?? "",
    sequence: event.sequence,
    status: "completed",
    started_at: event.timestamp,
    completed_at: event.timestamp,
    updated_at: event.timestamp,
    type: "file_artifact",
    path,
    source: "file_read",
    metadata: {
      ...(metadata ?? {}),
      eventClass: event.type,
      toolCallId: readToolCallId(payload),
      toolName: readToolName(payload),
      outputRef,
      contentRef,
      refIds: readStringArray(payload, "refIds", "ref_ids"),
      startLine: readFiniteNumber(payload, "startLine", "start_line"),
      endLine: readFiniteNumber(payload, "endLine", "end_line"),
      fileType: readString(payload, "fileType", "file_type"),
    },
  };
}

function readActionScope(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> | undefined {
  const scope = normalizeRecord(payload.scope);
  const sessionId =
    readString(scope ?? {}, "session_id", "sessionId") ?? event.sessionId;
  const threadId =
    readString(scope ?? {}, "thread_id", "threadId") ??
    event.threadId ??
    event.sessionId;
  const turnId = readString(scope ?? {}, "turn_id", "turnId") ?? event.turnId;
  if (!sessionId && !threadId && !turnId) {
    return undefined;
  }
  return {
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(threadId ? { thread_id: threadId } : {}),
    ...(turnId ? { turn_id: turnId } : {}),
  };
}

function readActionQuestions(
  payload: Record<string, unknown>,
): unknown[] | undefined {
  if (Array.isArray(payload.questions)) {
    return payload.questions;
  }
  const data = normalizeRecord(payload.data);
  if (Array.isArray(data?.questions)) {
    return data.questions;
  }
  return undefined;
}

function readActionResolvedData(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const data = normalizeRecord(payload.data);
  return {
    ...(data ?? {}),
    ...(readBoolean(payload, "approved", "confirmed", "approve") !== undefined
      ? {
          approved: readBoolean(payload, "approved", "confirmed", "approve"),
        }
      : {}),
    ...(readString(payload, "feedback", "message", "reason")
      ? { feedback: readString(payload, "feedback", "message", "reason") }
      : {}),
    ...(readString(payload, "decision", "status")
      ? { decision: readString(payload, "decision", "status") }
      : {}),
    ...(readString(payload, "permission_mode", "permissionMode")
      ? {
          permission_mode: readString(
            payload,
            "permission_mode",
            "permissionMode",
          ),
        }
      : {}),
  };
}

function projectTextDeltaBatchPayload(
  basePayload: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const chunks = readStringArray(payload, "chunks", "deltas") ?? [];
  return {
    ...basePayload,
    type: "text_delta_batch",
    text: readAgentMessageDeltaText(payload) ?? chunks.join(""),
    chunks,
    itemId: readAgentMessageItemId(payload),
    item_id: readAgentMessageItemId(payload),
    phase: readAgentMessagePhase(payload),
    boundary:
      readString(payload, "boundary", "streamBoundary", "stream_kind") ??
      "provider",
  };
}

function readAgentMessageItemId(
  payload: Record<string, unknown>,
): string | undefined {
  return readString(
    payload,
    "itemId",
    "item_id",
    "id",
    "messageId",
    "message_id",
  );
}

function readAgentMessageDeltaText(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    readString(payload, "text", "delta", "message") ??
    readString(
      normalizeRecord(payload.content) ?? {},
      "text",
      "delta",
      "message",
    )
  );
}

function readAgentMessagePhase(
  payload: Record<string, unknown>,
): string | undefined {
  return readString(
    payload,
    "phase",
    "messagePhase",
    "message_phase",
    "streamPhase",
    "stream_phase",
  );
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

function readAgentThreadTurnFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
  fallbackStatus: string,
): Record<string, unknown> {
  const turn = normalizeRecord(payload.turn) ?? payload;
  const timestamp = event.timestamp;
  return {
    id: readString(turn, "id", "turnId", "turn_id") ?? event.turnId ?? "",
    thread_id:
      readString(turn, "thread_id", "threadId") ??
      event.threadId ??
      event.sessionId,
    prompt_text: readString(turn, "prompt_text", "promptText", "prompt") ?? "",
    status: readString(turn, "status") ?? fallbackStatus,
    started_at: readString(turn, "started_at", "startedAt") ?? timestamp,
    completed_at: readString(turn, "completed_at", "completedAt"),
    error_message: readString(turn, "error_message", "errorMessage", "error"),
    created_at: readString(turn, "created_at", "createdAt") ?? timestamp,
    updated_at: readString(turn, "updated_at", "updatedAt") ?? timestamp,
  };
}

function readAgentThreadItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
  fallbackStatus: "in_progress" | "completed" | "failed",
): Record<string, unknown> {
  const item = normalizeRecord(payload.item) ?? payload;
  const itemType = readString(item, "type") ?? "agent_message";
  const baseItem = readAgentThreadItemBase(item, event, fallbackStatus);

  if (itemType === "agent_message") {
    return {
      ...item,
      ...baseItem,
      type: "agent_message",
      text: readString(item, "text", "content", "message") ?? "",
      phase: readString(item, "phase"),
    };
  }

  return {
    ...item,
    ...baseItem,
    type: itemType,
  };
}

function readUserMessageItemFromPayload(
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const input = normalizeRecord(payload.input);
  const contentRecord = normalizeRecord(payload.content);
  const content =
    readString(payload, "text", "message", "content") ??
    readString(input ?? {}, "text", "message", "content") ??
    readString(contentRecord ?? {}, "text", "message", "content") ??
    "";
  return {
    ...readAgentThreadItemBase(payload, event, "completed"),
    type: "user_message",
    content,
  };
}

function readAgentThreadItemBase(
  item: Record<string, unknown>,
  event: AppServerAgentEvent,
  fallbackStatus: "in_progress" | "completed" | "failed",
): Record<string, unknown> {
  return {
    id:
      readString(item, "id", "itemId", "item_id", "messageId", "message_id") ??
      event.eventId,
    thread_id:
      readString(item, "thread_id", "threadId") ??
      event.threadId ??
      event.sessionId,
    turn_id:
      readString(item, "turn_id", "turnId") ?? event.turnId ?? event.sessionId,
    sequence:
      typeof item.sequence === "number" ? item.sequence : event.sequence,
    status:
      readString(item, "status") ??
      (readString(item, "completed_at", "completedAt")
        ? "completed"
        : fallbackStatus),
    started_at: readString(item, "started_at", "startedAt") ?? event.timestamp,
    completed_at: readString(item, "completed_at", "completedAt"),
    updated_at: readString(item, "updated_at", "updatedAt") ?? event.timestamp,
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
