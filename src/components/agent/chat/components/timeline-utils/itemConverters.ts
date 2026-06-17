import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ActionRequired, AgentThreadItem } from "../../types";
import { mapItemStatus } from "./statusMapping";
import { stringifyResponse } from "./textFormatting";

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function mergeResultMetadata(
  metadata: Record<string, unknown> | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata && !extra) {
    return undefined;
  }
  return {
    ...(metadata || {}),
    ...(extra || {}),
  };
}

function toQuestionOptions(
  options: Array<{ label: string; description?: string }> | undefined,
) {
  return options?.map((option) => ({
    label: option.label,
    description: option.description,
  }));
}

export function toActionRequired(item: AgentThreadItem): ActionRequired | null {
  if (item.type === "approval_request") {
    return {
      requestId: item.request_id,
      actionType: "tool_confirmation",
      toolName: item.tool_name,
      arguments:
        item.arguments && typeof item.arguments === "object"
          ? (item.arguments as Record<string, unknown>)
          : undefined,
      prompt: item.prompt,
      status: item.status === "completed" ? "submitted" : "pending",
      submittedResponse: stringifyResponse(item.response),
      submittedUserData: item.response,
    };
  }

  if (item.type === "request_user_input") {
    return {
      requestId: item.request_id,
      actionType:
        item.action_type === "elicitation" ? "elicitation" : "ask_user",
      prompt: item.prompt,
      questions: item.questions?.map((question) => ({
        question: question.question,
        header: question.header,
        options: toQuestionOptions(question.options),
        multiSelect: question.multi_select,
      })),
      status: item.status === "completed" ? "submitted" : "pending",
      submittedResponse: stringifyResponse(item.response),
      submittedUserData: item.response,
    };
  }

  return null;
}

export function toToolCallState(item: AgentThreadItem): ToolCallState | null {
  switch (item.type) {
    case "tool_call":
      {
        const metadata = metadataRecord(item.metadata);
        return {
          id: item.id,
          name: item.tool_name,
          arguments:
            item.arguments === undefined
              ? undefined
              : JSON.stringify(item.arguments, null, 2),
          status: mapItemStatus(item.status),
          result:
            item.output !== undefined ||
            item.error !== undefined ||
            item.metadata !== undefined
              ? {
                  success:
                    item.success ??
                    (item.status === "completed" && item.error === undefined),
                  output: item.output || "",
                  error: item.error,
                  metadata,
                }
              : undefined,
          metadata,
          startTime: new Date(item.started_at),
          endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        };
      }
    case "command_execution":
      return {
        id: item.id,
        name: "exec_command",
        arguments: JSON.stringify(
          { command: item.command, cwd: item.cwd },
          null,
          2,
        ),
        status: mapItemStatus(item.status),
        result:
          item.aggregated_output !== undefined ||
          item.error !== undefined ||
          item.exit_code !== undefined ||
          item.metadata !== undefined
            ? {
                success:
                  item.status === "completed" &&
                  item.error === undefined &&
                  (item.exit_code === undefined || item.exit_code === 0),
                output: item.aggregated_output || "",
                error: item.error,
                metadata: mergeResultMetadata(metadataRecord(item.metadata), {
                  ...(item.exit_code !== undefined
                    ? { exit_code: item.exit_code }
                    : {}),
                  cwd: item.cwd,
                }),
              }
            : undefined,
        metadata: metadataRecord(item.metadata),
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
      };
    case "patch":
      {
        const metadata = metadataRecord(item.metadata);
        return {
          id: item.id,
          name: "apply_patch",
          arguments: JSON.stringify(
            { paths: item.paths ?? item.summary ?? [] },
            null,
            2,
          ),
          status: mapItemStatus(item.status),
          result:
            item.stdout !== undefined ||
            item.stderr !== undefined ||
            item.success !== undefined ||
            item.metadata !== undefined
              ? {
                  success:
                    item.success ??
                    (item.status === "completed" && item.stderr === undefined),
                  output: item.stdout || item.text || "",
                  error: item.stderr,
                  metadata,
                }
              : undefined,
          metadata,
          startTime: new Date(item.started_at),
          endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        };
      }
    case "web_search":
      {
        const metadata = metadataRecord(item.metadata);
        return {
          id: item.id,
          name: "web_search",
          arguments:
            item.query !== undefined || item.action !== undefined
              ? JSON.stringify(
                  { action: item.action || "web_search", query: item.query },
                  null,
                  2,
                )
              : undefined,
          status: mapItemStatus(item.status),
          result:
            item.output !== undefined || metadata
              ? {
                  success: item.status !== "failed",
                  output: item.output || "",
                  metadata,
                }
              : undefined,
          metadata,
          startTime: new Date(item.started_at),
          endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        };
      }
    default:
      return null;
  }
}
