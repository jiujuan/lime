import type { AgentEvent } from "./agentProtocolEventTypes";
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
  pickStringField,
} from "./agentProtocolParserUtils";

export function parseAgentToolEvent(
  type: string,
  event: Record<string, unknown>,
): AgentEvent | null {
  switch (type) {
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
      const requestId =
        (event.request_id as string | undefined) ||
        (actionData.request_id as string | undefined) ||
        (actionData.id as string | undefined) ||
        "";
      const actionType =
        (event.action_type as string | undefined) ||
        (actionData.action_type as string | undefined) ||
        (actionData.type as string | undefined) ||
        "tool_confirmation";

      return {
        type: "action_required",
        request_id: requestId,
        action_type: actionType as AgentActionRequiredType,
        scope: normalizeActionRequiredScope(event.scope ?? actionData.scope),
        tool_name:
          (event.tool_name as string | undefined) ||
          (actionData.tool_name as string | undefined),
        arguments:
          (event.arguments as Record<string, unknown> | undefined) ||
          (actionData.arguments as Record<string, unknown> | undefined),
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
      };
    }
    case "action_resolved": {
      const actionData =
        (event.data as Record<string, unknown> | undefined) || {};
      const requestId =
        (event.request_id as string | undefined) ||
        (actionData.request_id as string | undefined) ||
        (actionData.requestId as string | undefined) ||
        (actionData.id as string | undefined) ||
        "";
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
