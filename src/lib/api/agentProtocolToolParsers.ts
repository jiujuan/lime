import type { AgentEvent } from "./agentProtocolEventTypes";
import { normalizeActionArguments } from "./agentActionArguments";
import type {
  AgentActionRequiredQuestion,
  AgentActionRequiredType,
} from "./agentProtocolCoreTypes";
import {
  normalizeActionRequiredScope,
  normalizeOptionalNumber,
  normalizeRecord,
  normalizeToolArguments,
  normalizeToolExecutionResult,
  pickStringArrayField,
  pickStringField,
} from "./agentProtocolParserUtils";

function readHookRunSource(
  event: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeRecord(event.run) ?? normalizeRecord(event.payload) ?? event;
}

function normalizeHookRunStatus(
  status: string | undefined,
): "in_progress" | "completed" | "failed" {
  switch (status) {
    case "running":
    case "in_progress":
      return "in_progress";
    case "failed":
    case "blocked":
    case "stopped":
      return "failed";
    default:
      return "completed";
  }
}

function normalizeHookEntries(value: unknown):
  | Array<{
      kind: string;
      text: string;
    }>
  | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .map((entry) => {
      const record = normalizeRecord(entry);
      const kind = record ? pickStringField(record, "kind", "type") : undefined;
      const text = record
        ? pickStringField(record, "text", "message", "content")
        : undefined;
      return kind && text ? { kind, text } : null;
    })
    .filter((entry): entry is { kind: string; text: string } =>
      Boolean(entry),
    );
  return entries.length > 0 ? entries : undefined;
}

function readActionRequestId(
  event: Record<string, unknown>,
  actionData: Record<string, unknown>,
): string {
  return (
    pickStringField(event, "request_id", "requestId") ??
    pickStringField(actionData, "request_id", "requestId") ??
    pickStringField(event, "action_id", "actionId", "id") ??
    pickStringField(actionData, "action_id", "actionId", "id") ??
    ""
  );
}

function parseAgentHookLifecycleEvent(
  type: string,
  event: Record<string, unknown>,
): AgentEvent {
  const run = readHookRunSource(event);
  const rawStatus =
    pickStringField(run, "status", "hook_status", "hookStatus") ??
    (type === "hook.started" ||
    type === "hook_started" ||
    type === "hook/started" ||
    type === "workflow.hook.started"
      ? "running"
      : "completed");
  const entries = normalizeHookEntries(run.entries ?? event.entries);
  const output =
    pickStringField(run, "output", "text", "message", "statusMessage") ||
    entries?.map((entry) => `${entry.kind}: ${entry.text}`).join("\n");

  return {
    type:
      rawStatus === "running" || rawStatus === "in_progress"
        ? "item_started"
        : "item_completed",
    item: {
      id:
        pickStringField(
          run,
          "id",
          "runId",
          "run_id",
          "hookRunId",
          "hook_run_id",
        ) || "",
      thread_id: pickStringField(event, "thread_id", "threadId") || "",
      turn_id: pickStringField(event, "turn_id", "turnId") || "",
      sequence:
        typeof event.sequence === "number" && Number.isFinite(event.sequence)
          ? event.sequence
          : 0,
      type: "hook",
      status: normalizeHookRunStatus(rawStatus),
      started_at:
        pickStringField(run, "started_at", "startedAt") ||
        pickStringField(event, "timestamp") ||
        new Date(0).toISOString(),
      completed_at:
        rawStatus === "running" || rawStatus === "in_progress"
          ? undefined
          : pickStringField(run, "completed_at", "completedAt") ||
            pickStringField(event, "timestamp"),
      updated_at:
        pickStringField(run, "updated_at", "updatedAt") ||
        pickStringField(event, "timestamp") ||
        new Date(0).toISOString(),
      run_id:
        pickStringField(
          run,
          "id",
          "runId",
          "run_id",
          "hookRunId",
          "hook_run_id",
        ) || "",
      event_name: pickStringField(run, "eventName", "event_name", "hookEvent"),
      handler_type: pickStringField(run, "handlerType", "handler_type"),
      execution_mode: pickStringField(run, "executionMode", "execution_mode"),
      scope: pickStringField(run, "scope", "hookScope"),
      source_path: pickStringField(run, "sourcePath", "source_path"),
      source: pickStringField(run, "source"),
      display_order: normalizeOptionalNumber(
        run.displayOrder ?? run.display_order,
      ),
      status_message: pickStringField(
        run,
        "statusMessage",
        "status_message",
        "message",
      ),
      duration_ms: normalizeOptionalNumber(run.durationMs ?? run.duration_ms),
      entries,
      output,
      target_item_id: pickStringField(
        run,
        "targetItemId",
        "target_item_id",
        "toolCallId",
        "tool_call_id",
      ),
      hook_status: rawStatus,
      metadata: {
        eventClass: type,
        raw: run,
      },
    },
  };
}

export function parseAgentToolEvent(
  type: string,
  event: Record<string, unknown>,
): AgentEvent | null {
  switch (type) {
    case "hook.started":
    case "hook_started":
    case "hook/started":
    case "hook.completed":
    case "hook_completed":
    case "hook/completed":
    case "workflow.hook.started":
    case "workflow.hook.completed":
      return parseAgentHookLifecycleEvent(type, event);
    case "tool_start":
    case "tool_started":
    case "tool.started":
      return {
        type: "tool_start",
        tool_name:
          pickStringField(event, "tool_name", "toolName", "name") || "",
        tool_id: pickStringField(event, "tool_id", "toolId", "id") || "",
        arguments: normalizeToolArguments(
          event.arguments ?? event.args ?? event.input ?? event.parameters,
        ),
        metadata: normalizeRecord(event.metadata),
      };
    case "tool_end":
    case "tool_result":
    case "tool.result":
    case "tool.failed":
    case "tool_failed":
      return {
        type: "tool_end",
        tool_id:
          pickStringField(event, "tool_id", "toolId", "toolCallId", "id") || "",
        result: normalizeToolExecutionResult(event),
      };
    case "image_task_created":
    case "image_task.created": {
      const response = normalizeRecord(event.response);
      const responseSource = response ?? {};
      const record = normalizeRecord(response?.record);
      const payload =
        normalizeRecord(event.payload) || normalizeRecord(record?.payload);
      return {
        type: "image_task_created",
        task_id:
          pickStringField(event, "task_id", "taskId") ||
          pickStringField(responseSource, "task_id", "taskId") ||
          "",
        task_type:
          pickStringField(event, "task_type", "taskType") ||
          pickStringField(responseSource, "task_type", "taskType"),
        task_family:
          pickStringField(event, "task_family", "taskFamily") ||
          pickStringField(responseSource, "task_family", "taskFamily"),
        turn_id:
          pickStringField(event, "turn_id", "turnId") ||
          pickStringField(payload ?? {}, "turn_id", "turnId") ||
          pickStringField(record ?? {}, "turn_id", "turnId") ||
          pickStringField(responseSource, "turn_id", "turnId"),
        status:
          pickStringField(event, "status") ||
          pickStringField(responseSource, "status"),
        normalized_status:
          pickStringField(event, "normalized_status", "normalizedStatus") ||
          pickStringField(
            responseSource,
            "normalized_status",
            "normalizedStatus",
          ),
        artifact_path:
          pickStringField(event, "artifact_path", "artifactPath") ||
          pickStringField(responseSource, "artifact_path", "artifactPath"),
        absolute_path:
          pickStringField(event, "absolute_path", "absolutePath") ||
          pickStringField(responseSource, "absolute_path", "absolutePath"),
        ...(response ? { response } : {}),
        ...(payload ? { payload } : {}),
      };
    }
    case "image_task.presentation.generated":
    case "image_task_presentation_generated": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      const presentation = normalizeRecord(source.presentation);
      return {
        type: "image_task_presentation_generated",
        status: pickStringField(source, "status"),
        workflow_run_id: pickStringField(
          source,
          "workflow_run_id",
          "workflowRunId",
        ),
        session_id: pickStringField(source, "session_id", "sessionId"),
        thread_id: pickStringField(source, "thread_id", "threadId"),
        turn_id: pickStringField(source, "turn_id", "turnId"),
        ...(presentation ? { presentation } : {}),
      };
    }
    case "image_task.parameters.required":
    case "image_task_parameters_required": {
      const missing = Array.isArray(event.missing)
        ? event.missing.filter(
            (item): item is string => typeof item === "string",
          )
        : Array.isArray(event.missingParameters)
          ? event.missingParameters.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
      const prompt =
        pickStringField(event, "prompt", "message", "reason") ||
        "图片生成还需要补充必要信息。";
      return {
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "图片生成需要补充信息",
          detail: missing.length > 0 ? `缺少: ${missing.join(", ")}` : prompt,
          checkpoints: missing,
          metadata: {
            source:
              pickStringField(event, "source") || "image_command_workflow",
            agentui: {
              workflow_key: "image_command_workflow",
              status_kind: "image_task_parameters_required",
              missing,
              missing_parameters: missing,
              image_task: normalizeRecord(event.image_task),
            },
          },
        },
      };
    }
    case "tool_progress": {
      const progress = normalizeRecord(event.progress) || {};
      return {
        type: "tool_progress",
        tool_id: (event.tool_id as string) || "",
        progress: {
          message:
            typeof progress.message === "string" ? progress.message : undefined,
          progress: normalizeOptionalNumber(progress.progress),
          total: normalizeOptionalNumber(progress.total),
          metadata: normalizeRecord(progress.metadata),
        },
      };
    }
    case "tool_output_delta":
      return {
        type: "tool_output_delta",
        tool_id: (event.tool_id as string) || "",
        delta: (event.delta as string) || "",
        output_kind:
          typeof event.output_kind === "string" ? event.output_kind : undefined,
        metadata: normalizeRecord(event.metadata),
      };
    case "tool_input_delta":
      return {
        type: "tool_input_delta",
        tool_id: (event.tool_id as string) || "",
        tool_name:
          typeof event.tool_name === "string" ? event.tool_name : undefined,
        delta: (event.delta as string) || "",
        accumulated_arguments:
          typeof event.accumulated_arguments === "string"
            ? event.accumulated_arguments
            : undefined,
        provider:
          typeof event.provider === "string" ? event.provider : undefined,
        metadata: normalizeRecord(event.metadata),
      };
    case "artifact_snapshot":
    case "ArtifactSnapshot": {
      const nestedArtifact =
        event.artifact && typeof event.artifact === "object"
          ? (event.artifact as Record<string, unknown>)
          : undefined;
      return {
        type: "artifact_snapshot",
        artifact: {
          artifactId: String(
            nestedArtifact?.artifactId ||
              nestedArtifact?.artifact_id ||
              event.artifact_id ||
              event.artifactId ||
              event.id ||
              "artifact-unknown",
          ),
          filePath:
            (nestedArtifact?.filePath as string | undefined) ||
            (nestedArtifact?.file_path as string | undefined) ||
            (event.file_path as string | undefined) ||
            (event.filePath as string | undefined),
          content:
            (nestedArtifact?.content as string | undefined) ||
            (event.content as string | undefined),
          metadata:
            (nestedArtifact?.metadata as Record<string, unknown> | undefined) ||
            (event.metadata as Record<string, unknown> | undefined),
        },
      };
    }
    case "action_required": {
      const actionData =
        (event.data as Record<string, unknown> | undefined) || {};
      const requestId = readActionRequestId(event, actionData);
      const actionType =
        (event.action_type as string | undefined) ||
        (event.actionType as string | undefined) ||
        (actionData.action_type as string | undefined) ||
        (actionData.actionType as string | undefined) ||
        (actionData.type as string | undefined) ||
        "tool_confirmation";

      return {
        type: "action_required",
        request_id: requestId,
        action_type: actionType as AgentActionRequiredType,
        scope: normalizeActionRequiredScope(event.scope ?? actionData.scope),
        tool_name:
          (event.tool_name as string | undefined) ||
          (event.toolName as string | undefined) ||
          (actionData.tool_name as string | undefined) ||
          (actionData.toolName as string | undefined),
        arguments: readActionRequiredArguments(event, actionData, actionType),
        prompt:
          (event.prompt as string | undefined) ||
          (actionData.prompt as string | undefined) ||
          (actionData.message as string | undefined),
        questions:
          (event.questions as AgentActionRequiredQuestion[] | undefined) ||
          (actionData.questions as AgentActionRequiredQuestion[] | undefined),
        requested_schema:
          (event.requested_schema as Record<string, unknown> | undefined) ||
          (actionData.requested_schema as Record<string, unknown> | undefined),
        available_decisions:
          pickStringArrayField(event, "availableDecisions", "available_decisions") ??
          pickStringArrayField(
            actionData,
            "availableDecisions",
            "available_decisions",
          ),
      };
    }
    case "action_resolved": {
      const actionData =
        (event.data as Record<string, unknown> | undefined) || {};
      const requestId = readActionRequestId(event, actionData);
      const actionType =
        (event.action_type as string | undefined) ||
        (actionData.action_type as string | undefined) ||
        (actionData.actionType as string | undefined) ||
        (actionData.type as string | undefined) ||
        "tool_confirmation";

      return {
        type: "action_resolved",
        request_id: requestId,
        action_type: actionType,
        scope: normalizeActionRequiredScope(event.scope ?? actionData.scope),
        approved:
          typeof event.approved === "boolean"
            ? event.approved
            : typeof actionData.approved === "boolean"
              ? actionData.approved
              : typeof actionData.approve === "boolean"
                ? actionData.approve
                : undefined,
        feedback:
          typeof event.feedback === "string"
            ? event.feedback
            : typeof actionData.feedback === "string"
              ? actionData.feedback
              : undefined,
        permission_mode:
          typeof event.permission_mode === "string"
            ? event.permission_mode
            : typeof actionData.permission_mode === "string"
              ? actionData.permission_mode
              : typeof actionData.permissionMode === "string"
                ? actionData.permissionMode
                : undefined,
        data: actionData,
      };
    }
    default:
      return null;
  }
}

const ACTION_ARGUMENT_EVENT_FIELDS = [
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

function readActionRequiredArguments(
  event: Record<string, unknown>,
  actionData: Record<string, unknown>,
  actionType: string,
): Record<string, unknown> | undefined {
  const source =
    normalizeRecord(event.arguments) ??
    normalizeRecord(actionData.arguments) ??
    (actionType === "tool_confirmation" ||
    actionType === "network_approval" ||
    actionType === "request_permissions"
      ? actionData
      : {});
  const enriched: Record<string, unknown> = {};
  for (const key of ACTION_ARGUMENT_EVENT_FIELDS) {
    if (event[key] !== undefined) {
      enriched[key] = event[key];
    }
  }
  return normalizeActionArguments({ ...enriched, ...source });
}
