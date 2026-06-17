import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ActionRequired, AgentThreadItem } from "../../types";
import { mapItemStatus } from "./statusMapping";
import { stringifyResponse } from "./textFormatting";

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
                metadata:
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as Record<string, unknown>)
                    : undefined,
              }
            : undefined,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
      };
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
          item.exit_code !== undefined
            ? {
                success:
                  item.status === "completed" && item.error === undefined,
                output: item.aggregated_output || "",
                error: item.error,
                metadata:
                  item.exit_code !== undefined
                    ? { exit_code: item.exit_code, cwd: item.cwd }
                    : { cwd: item.cwd },
              }
            : undefined,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
      };
    case "patch":
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
          item.success !== undefined
            ? {
                success:
                  item.success ??
                  (item.status === "completed" && item.stderr === undefined),
                output: item.stdout || item.text || "",
                error: item.stderr,
                metadata:
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as Record<string, unknown>)
                    : undefined,
              }
            : undefined,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
      };
    case "web_search":
      return {
        id: item.id,
        name: "web_search",
        arguments:
          item.query !== undefined
            ? JSON.stringify(
                { action: item.action || "web_search", query: item.query },
                null,
                2,
              )
            : undefined,
        status: mapItemStatus(item.status),
        result:
          item.output !== undefined
            ? {
                success: item.status !== "failed",
                output: item.output,
              }
            : undefined,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
      };
    default:
      return null;
  }
}
