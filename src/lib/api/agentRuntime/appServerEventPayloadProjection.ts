import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  type AppServerAgentEvent,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import { normalizeActionArguments } from "@/lib/api/agentActionArguments";
import {
  isLegacyTurnTerminalAppServerEventType,
  normalizeRecord,
  normalizeToolArguments,
  normalizeToolExecutionResult,
  parseEventTimestampMs,
  providerTraceStageFromEventType,
  readBoolean,
  readFiniteNumber,
  readString,
  readStringArray,
  readToolCallId,
  readToolName,
  readAppServerAgentEvent,
} from "./appServerEventPayloadUtils";
import {
  projectTextDeltaBatchPayload,
  readActionQuestions,
  readActionResolvedData,
  readActionScope,
  readAgentMessageDeltaText,
  readAgentMessageFromPayload,
  readAgentMessageItemId,
  readAgentMessagePhase,
  readAgentThreadItemFromPayload,
  readCanonicalAgentThreadTurn,
  readArtifactSnapshotSignalFromPayload,
  readCommandExecutionItemFromPayload,
  readFileReadItemFromPayload,
  readHookItemFromPayload,
  readPatchItemFromPayload,
  readPluginWorkerHookItemFromPayload,
  readPluginWorkerRetryItemFromPayload,
  readUserMessageItemFromPayload,
} from "./appServerEventTimelineReaders";
import { readCanonicalThreadItem } from "./appServerCanonicalItemReader";

export function projectAppServerAgentEventPayload(
  notification: AppServerJsonRpcNotification,
): Record<string, unknown> | null {
  return projectAppServerAgentEventPayloadInternal(notification, false);
}

/** Test-only entry for frozen raw lifecycle fixtures during canonical cutover. */
export function projectRawAppServerAgentEventPayloadForTests(
  notification: AppServerJsonRpcNotification,
): Record<string, unknown> | null {
  return projectAppServerAgentEventPayloadInternal(notification, true);
}

function projectAppServerAgentEventPayloadInternal(
  notification: AppServerJsonRpcNotification,
  allowRawLifecycle: boolean,
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

  const canonicalEvent = normalizeRecord(
    normalizeRecord(notification.params)?.canonicalEvent,
  );
  if (canonicalEvent) {
    return projectCanonicalThreadEvent(
      canonicalEvent,
      event,
      payload,
      basePayload,
    );
  }
  if (!allowRawLifecycle && !isCurrentNonThreadSideChannelEvent(event.type)) {
    return null;
  }

  switch (event.type) {
    case "thread.started":
      return {
        ...basePayload,
        type: "thread_started",
        thread_id: event.threadId ?? event.sessionId,
      };
    case "turn.started": {
      const turn = readCanonicalTurnProjection(
        notification,
        event,
        "inProgress",
        "running",
      );
      if (!turn) {
        return null;
      }
      return {
        ...basePayload,
        type: "turn_started",
        turn,
      };
    }
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
          normalizeRecord(payload.provider_metadata) ??
          normalizeRecord(payload.metadata),
      };
    case "reasoning.started":
      return {
        ...basePayload,
        type: "reasoning_started",
        reasoningId: readString(payload, "reasoningId", "reasoning_id", "id"),
        model: normalizeRecord(payload.model),
        providerMetadata:
          normalizeRecord(payload.providerMetadata) ??
          normalizeRecord(payload.provider_metadata) ??
          normalizeRecord(payload.metadata),
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
          normalizeRecord(payload.provider_metadata) ??
          normalizeRecord(payload.metadata),
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
          normalizeRecord(payload.provider_metadata) ??
          normalizeRecord(payload.metadata),
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
        runtime_provider_backend: readString(
          payload,
          "runtime_provider_backend",
          "runtimeProviderBackend",
        ),
        runtime_provider_selector: readString(
          payload,
          "runtime_provider_selector",
          "runtimeProviderSelector",
        ),
        runtime_provider_protocol: readString(
          payload,
          "runtime_provider_protocol",
          "runtimeProviderProtocol",
        ),
        runtime_provider_active_model: readString(
          payload,
          "runtime_provider_active_model",
          "runtimeProviderActiveModel",
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
        metadata: normalizeRecord(payload.metadata),
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
        metadata: normalizeRecord(payload.metadata),
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
        metadata: normalizeRecord(payload.metadata),
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
    case "tool.failed":
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
    case "hook.started":
    case "hook/started":
    case "workflow.hook.started":
      return {
        ...basePayload,
        type: "item_started",
        item: readHookItemFromPayload(payload, event),
      };
    case "hook.completed":
    case "hook/completed":
    case "workflow.hook.completed":
      return {
        ...basePayload,
        type: "item_completed",
        item: readHookItemFromPayload(payload, event),
      };
    case "plugin_worker.hook":
      return {
        ...basePayload,
        type: "item_completed",
        item: readPluginWorkerHookItemFromPayload(payload, event),
      };
    case "plugin_worker.retry":
      return {
        ...basePayload,
        type: "item_completed",
        item: readPluginWorkerRetryItemFromPayload(payload, event),
      };
    case "workflow.run.started":
    case "workflow.run.retrying":
    case "workflow.step.started":
    case "workflow.step.retrying":
    case "workflow.tool.started":
    case "workflow.connector.requested":
    case "workflow.connector.completed":
    case "workflow.artifact.delta":
    case "workflow.step.progress":
    case "workflow.step.completed":
    case "workflow.tool.completed":
    case "workflow.run.completed":
    case "workflow.step.failed":
    case "workflow.run.failed":
    case "workflow.step.canceled":
    case "workflow.run.canceled":
      return projectWorkflowReadModelRefreshPayload(
        basePayload,
        payload,
        event,
      );
    case "action.required":
      return {
        ...basePayload,
        type: "action_required",
        request_id: readActionRequestId(payload),
        action_type:
          readString(payload, "action_type", "actionType", "type") ??
          "tool_confirmation",
        scope: readActionScope(payload, event),
        tool_name: readToolName(payload),
        arguments: readActionArguments(payload),
        prompt: readString(payload, "prompt", "message", "reason"),
        questions: readActionQuestions(payload),
        available_decisions:
          readStringArray(
            normalizeRecord(payload.data) ?? {},
            "availableDecisions",
            "available_decisions",
          ) ??
          readStringArray(payload, "availableDecisions", "available_decisions"),
        requested_schema:
          normalizeRecord(payload.requested_schema) ??
          normalizeRecord(payload.requestedSchema) ??
          normalizeRecord(payload.schema),
      };
    case "action.resolved":
      return {
        ...basePayload,
        type: "action_resolved",
        request_id: readActionRequestId(payload),
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
    case "turn.completed": {
      const turn = readCanonicalTurnProjection(
        notification,
        event,
        "completed",
        "completed",
      );
      if (!turn) {
        return null;
      }
      return {
        ...basePayload,
        type: "turn_completed",
        text: readString(payload, "text", "delta", "message", "content"),
        usage: payload.usage,
        turn,
      };
    }
    case "turn.failed": {
      const turn = readCanonicalTurnProjection(
        notification,
        event,
        "failed",
        "failed",
      );
      if (!turn) {
        return null;
      }
      return {
        ...basePayload,
        type: "turn_failed",
        turn,
      };
    }
    case "turn.canceled": {
      const turn = readCanonicalTurnProjection(
        notification,
        event,
        "interrupted",
        "canceled",
      );
      if (!turn) {
        return null;
      }
      return {
        ...basePayload,
        type: "turn_canceled",
        text: readString(payload, "text", "delta", "message", "content"),
        usage: payload.usage,
        turn: {
          ...turn,
          error_message: "本轮已中止",
        },
      };
    }
    default:
      return isCurrentNonThreadSideChannelEvent(event.type)
        ? { ...basePayload, type: event.type.split(".").join("_") }
        : null;
  }
}

function projectCanonicalThreadEvent(
  canonicalEvent: Record<string, unknown>,
  event: AppServerAgentEvent,
  rawPayload: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): Record<string, unknown> | null {
  const method = readString(canonicalEvent, "method");
  const params = normalizeRecord(canonicalEvent.params);
  if (!params) {
    return null;
  }

  switch (method) {
    case "thread/updated": {
      const sessionId = readString(params, "sessionId", "session_id");
      const threadId = readString(params, "threadId", "thread_id");
      if (
        sessionId !== event.sessionId ||
        !threadId ||
        (event.threadId !== undefined && threadId !== event.threadId)
      ) {
        return null;
      }
      return { ...basePayload, type: "thread_started", thread_id: threadId };
    }
    case "turn/updated":
      return projectCanonicalTurnEvent(params, event, rawPayload, basePayload);
    case "item/updated":
      return projectCanonicalItemEvent(params, event, rawPayload, basePayload);
    default:
      return null;
  }
}

function projectCanonicalTurnEvent(
  turn: Record<string, unknown>,
  event: AppServerAgentEvent,
  rawPayload: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): Record<string, unknown> | null {
  const status = readString(turn, "status");
  const expectedStatus = expectedCanonicalTurnStatus(event.type);
  if (expectedStatus && !expectedStatus.includes(status ?? "")) {
    return null;
  }
  const projectedStatus =
    status === "interrupted"
      ? "canceled"
      : status === "notStarted" || status === "inProgress"
        ? "running"
        : status;
  if (!projectedStatus) {
    return null;
  }
  const canonicalTurn = readCanonicalTurnProjection(
    {
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: { canonicalEvent: { method: "turn/updated", params: turn } },
    },
    event,
    status ?? "",
    projectedStatus,
  );
  if (!canonicalTurn) {
    return null;
  }

  const presentation = {
    text: readString(rawPayload, "text", "delta", "message", "content"),
    usage: rawPayload.usage,
  };
  switch (status) {
    case "notStarted":
    case "inProgress":
      return { ...basePayload, type: "turn_started", turn: canonicalTurn };
    case "completed":
      return {
        ...basePayload,
        ...presentation,
        type: "turn_completed",
        turn: canonicalTurn,
      };
    case "failed":
      return { ...basePayload, type: "turn_failed", turn: canonicalTurn };
    case "interrupted":
      return {
        ...basePayload,
        ...presentation,
        type: "turn_canceled",
        turn: { ...canonicalTurn, error_message: "本轮已中止" },
      };
    default:
      return null;
  }
}

function projectCanonicalItemEvent(
  item: Record<string, unknown>,
  event: AppServerAgentEvent,
  rawPayload: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): Record<string, unknown> | null {
  const projectedItem = readCanonicalThreadItem(item, event);
  if (!projectedItem) {
    return null;
  }
  const status = readString(item, "status");
  const canonicalPayload = normalizeRecord(item.payload);
  if (readString(canonicalPayload ?? {}, "type") === "approval") {
    return projectCanonicalApprovalEvent(
      projectedItem,
      canonicalPayload ?? {},
      status,
      event,
      rawPayload,
      basePayload,
    );
  }
  if (
    readString(canonicalPayload ?? {}, "type") === "agentMessage" &&
    !["completed", "failed", "interrupted", "cancelled"].includes(status ?? "")
  ) {
    const text = readString(canonicalPayload ?? {}, "text") ?? "";
    const phase = readString(canonicalPayload ?? {}, "phase");
    const itemId = readString(item, "itemId", "item_id");
    return {
      ...basePayload,
      type: "text_delta",
      text,
      itemId,
      item_id: itemId,
      phase,
    };
  }
  const createdAtMs = readFiniteNumber(item, "createdAtMs");
  const updatedAtMs = readFiniteNumber(item, "updatedAtMs");
  const type = ["completed", "failed", "interrupted", "cancelled"].includes(
    status ?? "",
  )
    ? "item_completed"
    : event.type === "item.updated"
      ? "item_updated"
      : event.type === "item.started" ||
          status === "pending" ||
          createdAtMs === updatedAtMs
        ? "item_started"
        : "item_updated";
  const deltaType = event.type.includes("delta") ? "item_updated" : type;
  return { ...basePayload, type: deltaType, item: projectedItem };
}

function projectCanonicalApprovalEvent(
  projectedItem: Record<string, unknown>,
  canonicalPayload: Record<string, unknown>,
  status: string | undefined,
  event: AppServerAgentEvent,
  rawPayload: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): Record<string, unknown> | null {
  const requestId = readString(canonicalPayload, "request_id");
  const action = normalizeRecord(canonicalPayload.action);
  const actionType = readString(action ?? {}, "kind");
  const runtimeEvent = normalizeRecord(rawPayload.runtimeEvent);
  const rawRequestId =
    readString(rawPayload, "requestId", "actionId") ??
    readString(
      runtimeEvent ?? {},
      "requestId",
      "request_id",
      "actionId",
      "action_id",
    ) ??
    readString(rawPayload, "action_id", "request_id");
  const rawActionType =
    readString(rawPayload, "actionType") ??
    readString(runtimeEvent ?? {}, "actionType", "action_type") ??
    readString(rawPayload, "action_type");
  if (
    !requestId ||
    !actionType ||
    (rawRequestId !== undefined && rawRequestId !== requestId) ||
    (rawActionType !== undefined && rawActionType !== actionType)
  ) {
    return null;
  }

  const terminal = ["completed", "failed", "interrupted", "cancelled"].includes(
    status ?? "",
  );
  if (
    (event.type === "action.required" && terminal) ||
    (event.type === "action.resolved" && !terminal)
  ) {
    return null;
  }

  const scope = {
    session_id: event.sessionId,
    thread_id: readString(projectedItem, "thread_id"),
    turn_id: readString(projectedItem, "turn_id"),
  };
  if (!terminal) {
    return {
      ...basePayload,
      type: "action_required",
      request_id: requestId,
      action_type: actionType,
      scope,
      prompt: readString(projectedItem, "prompt"),
      available_decisions: projectedItem.available_decisions,
    };
  }
  if (actionType === "tool_confirmation") {
    return {
      ...basePayload,
      type: "item_completed",
      item: projectedItem,
    };
  }

  const decision = readString(canonicalPayload, "decision");
  const response = normalizeRecord(projectedItem.response);
  if (!decision || !response) {
    if (!allowsDecisionlessApprovalResolution(actionType)) {
      return null;
    }
    return {
      ...basePayload,
      type: "action_resolved",
      request_id: requestId,
      action_type: actionType,
      scope,
    };
  }
  return {
    ...basePayload,
    type: "action_resolved",
    request_id: requestId,
    action_type: actionType,
    scope,
    approved: decision === "approved" || decision === "approvedForSession",
    feedback: readString(canonicalPayload, "reason_code"),
    permission_mode: readString(response, "decision"),
    data: response,
  };
}

function allowsDecisionlessApprovalResolution(actionType: string): boolean {
  return ["ask_user", "elicitation", "mcp_elicitation"].includes(actionType);
}

function expectedCanonicalTurnStatus(eventType: string): string[] | null {
  switch (eventType) {
    case "turn.accepted":
    case "turn.started":
      return ["notStarted", "inProgress"];
    case "turn.completed":
      return ["completed"];
    case "turn.failed":
      return ["failed"];
    case "turn.canceled":
      return ["interrupted"];
    default:
      return null;
  }
}

function isCurrentNonThreadSideChannelEvent(eventType: string): boolean {
  return (
    providerTraceStageFromEventType(eventType) !== undefined ||
    eventType === "runtime.status" ||
    eventType === "image_task.presentation.generated" ||
    eventType === "image_task.created" ||
    eventType === "image_task.parameters.required" ||
    eventType === "image_task_parameters_required" ||
    eventType === "media.read.chunk" ||
    eventType === "media.read.completed"
  );
}

function readCanonicalTurnProjection(
  notification: AppServerJsonRpcNotification,
  event: AppServerAgentEvent,
  expectedStatus: string,
  projectedStatus: string,
): Record<string, unknown> | null {
  const params = normalizeRecord(notification.params);
  const canonicalEvent = normalizeRecord(params?.canonicalEvent);
  if (readString(canonicalEvent ?? {}, "method") !== "turn/updated") {
    return null;
  }

  const turn = normalizeRecord(canonicalEvent?.params);
  if (!turn || readString(turn, "status") !== expectedStatus) {
    return null;
  }

  const sessionId = readString(turn, "sessionId", "session_id");
  const threadId = readString(turn, "threadId", "thread_id");
  const turnId = readString(turn, "turnId", "turn_id", "id");
  if (
    sessionId !== event.sessionId ||
    !threadId ||
    !turnId ||
    (event.threadId !== undefined && threadId !== event.threadId) ||
    (event.turnId !== undefined && turnId !== event.turnId)
  ) {
    return null;
  }

  return readCanonicalAgentThreadTurn(turn, event, projectedStatus);
}

function readActionRequestId(payload: Record<string, unknown>): string {
  return (
    readString(
      payload,
      "request_id",
      "requestId",
      "action_id",
      "actionId",
      "id",
    ) ?? ""
  );
}

const ACTION_ARGUMENT_PAYLOAD_FIELDS = [
  "additional_permissions",
  "additionalPermissions",
  "action",
  "call_id",
  "callId",
  "completed_at_ms",
  "completedAtMs",
  "decision_source",
  "decisionSource",
  "environment_id",
  "environmentId",
  "guardian_review_action",
  "guardianReviewAction",
  "item_id",
  "itemId",
  "network_approval_context",
  "networkApprovalContext",
  "owner_call_id",
  "ownerCallId",
  "proposed_network_policy_amendments",
  "proposedNetworkPolicyAmendments",
  "review",
  "review_id",
  "reviewId",
  "started_at_ms",
  "startedAtMs",
  "target_item_id",
  "targetItemId",
  "tool_call_id",
  "toolCallId",
] as const;

function readActionArguments(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const source =
    normalizeRecord(payload.arguments) ?? normalizeRecord(payload.data) ?? {};
  const enriched: Record<string, unknown> = {};
  for (const key of ACTION_ARGUMENT_PAYLOAD_FIELDS) {
    if (payload[key] !== undefined) {
      enriched[key] = payload[key];
    }
  }
  return normalizeActionArguments({ ...enriched, ...source });
}

function projectWorkflowReadModelRefreshPayload(
  basePayload: Record<string, unknown>,
  payload: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> {
  const workflowRunId = readString(
    payload,
    "workflowRunId",
    "workflow_run_id",
    "runId",
    "run_id",
  );
  const workflowKey = readString(payload, "workflowKey", "workflow_key", "key");
  const stepId = readString(payload, "stepId", "step_id", "id");
  const status = readString(payload, "status");
  const checkpoints = [workflowRunId, stepId].filter((value): value is string =>
    Boolean(value),
  );
  const workflowMetadata = {
    sourceType: "runtime_status",
    source: "workflow_read_model_refresh",
    surface: "runtime_status",
    visibility: "diagnostics",
    persistence: "transient",
    runtime_event_type: event.type,
    workflow_run_id: workflowRunId,
    workflow_key: workflowKey,
    workflow_status: status,
    step_id: stepId,
    agentui: {
      eventClass: "workflow.read_model_refresh",
      surface: "runtime_status",
      visibility: "diagnostics",
      status_kind: "workflow_read_model_refresh",
      runtime_event_type: event.type,
      workflow_run_id: workflowRunId,
      workflow_key: workflowKey,
      step_id: stepId,
    },
  };

  return {
    ...basePayload,
    type: "runtime_status",
    runtime_event_type: event.type,
    workflow_run_id: workflowRunId,
    workflow_key: workflowKey,
    step_id: stepId,
    status: {
      phase: "routing",
      title: "Workflow read model refresh",
      detail: `${event.type} recorded in workflow read model`,
      checkpoints,
      metadata: workflowMetadata,
    },
  };
}
