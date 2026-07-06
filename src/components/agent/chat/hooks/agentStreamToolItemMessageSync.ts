import type { Dispatch, SetStateAction } from "react";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";

type MessageContentPart = NonNullable<Message["contentParts"]>[number];
type MessageToolUsePart = Extract<MessageContentPart, { type: "tool_use" }>;
type MessageToolCallState = NonNullable<Message["toolCalls"]>[number];
type MessageToolCallResult = NonNullable<MessageToolCallState["result"]>;

export function stringifyThreadItemToolArguments(
  value: unknown,
): string | undefined {
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

function metadataFromThreadItem(
  item: AgentThreadItem,
): Record<string, unknown> | undefined {
  return item.metadata && typeof item.metadata === "object"
    ? (item.metadata as Record<string, unknown>)
    : undefined;
}

function toolExecutionResultFromThreadItem(
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallResult | undefined {
  if (item.status === "in_progress") {
    return undefined;
  }
  const structuredContent = item.structuredContent ?? item.structured_content;
  return {
    success: item.success ?? item.status === "completed",
    output: item.output || "",
    error: item.error,
    structuredContent,
    structured_content: structuredContent,
    metadata: metadataFromThreadItem(item),
  };
}

export function toolCallStateFromThreadItem(
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallState {
  return {
    id: item.id,
    name: item.tool_name || item.id,
    arguments: stringifyThreadItemToolArguments(item.arguments),
    status:
      item.status === "failed"
        ? "failed"
        : item.status === "completed"
          ? "completed"
          : "running",
    result: toolExecutionResultFromThreadItem(item),
    metadata: metadataFromThreadItem(item),
    startTime: item.started_at ? new Date(item.started_at) : new Date(),
    endTime: item.completed_at ? new Date(item.completed_at) : undefined,
  };
}

export function mergeToolCallStateFromItem(
  existing: MessageToolCallState | undefined,
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallState {
  const fromItem = toolCallStateFromThreadItem(item);
  return {
    ...existing,
    ...fromItem,
    arguments: fromItem.arguments ?? existing?.arguments,
    result: fromItem.result ?? existing?.result,
    progress: item.status === "in_progress" ? existing?.progress : undefined,
    logs: existing?.logs,
  };
}

function mergeThreadItemMetadataIntoToolUsePart(
  part: MessageToolUsePart,
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolUsePart {
  const itemMetadata = metadataFromThreadItem(item);
  const metadata = {
    ...(itemMetadata ?? {}),
    ...(part.metadata ?? {}),
    sequence: item.sequence,
    turnId: item.turn_id,
  };
  return {
    ...part,
    metadata,
  };
}

export function syncExistingMessageToolCallFromThreadItem(params: {
  assistantMsgId: string;
  item: AgentThreadItem;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): void {
  if (params.item.type !== "tool_call") {
    return;
  }
  const toolCallItem = params.item;
  params.setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }
      const hasExistingToolCall = Boolean(
        message.toolCalls?.some((toolCall) => toolCall.id === params.item.id),
      );
      const hasExistingToolUsePart = Boolean(
        message.contentParts?.some(
          (part) =>
            part.type === "tool_use" && part.toolCall.id === params.item.id,
        ),
      );
      if (!hasExistingToolCall && !hasExistingToolUsePart) {
        return message;
      }

      const updateToolCall = (
        toolCall: MessageToolCallState,
      ): MessageToolCallState =>
        toolCall.id === toolCallItem.id
          ? mergeToolCallStateFromItem(toolCall, toolCallItem)
          : toolCall;

      return {
        ...message,
        toolCalls: message.toolCalls?.map(updateToolCall),
        contentParts: message.contentParts?.map((part) =>
          part.type === "tool_use" && part.toolCall.id === toolCallItem.id
            ? {
                ...mergeThreadItemMetadataIntoToolUsePart(part, toolCallItem),
                toolCall: updateToolCall(part.toolCall),
              }
            : part,
        ),
      };
    }),
  );
}
