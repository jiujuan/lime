import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ActionRequired } from "../types";
import {
  isUnifiedWebSearchToolName,
} from "../utils/searchResultPreview";
import { isUnifiedWebFetchToolName } from "../utils/toolNameFamily";
import { isImportedSourceMetadata } from "../utils/importedSourceMetadata";

export type StreamingProcessEntry =
  | {
      kind: "thinking";
      id: string;
      text: string;
      defaultExpanded?: boolean;
      preserveSourceText?: boolean;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "tool";
      id: string;
      toolCall: ToolCallState;
    }
  | {
      kind: "action";
      id: string;
      actionRequired: ActionRequired;
    };

export function isImportedProcessMetadata(metadata: unknown): boolean {
  return isImportedSourceMetadata(metadata);
}

export function isImportedToolCall(toolCall: ToolCallState): boolean {
  const possibleToolMetadata = (toolCall as { metadata?: unknown }).metadata;
  return (
    isImportedProcessMetadata(toolCall.result?.metadata) ||
    isImportedProcessMetadata(possibleToolMetadata)
  );
}

export function shouldAutoExpandProcessEntries(
  entries: StreamingProcessEntry[],
  isMessageStreaming: boolean,
): boolean {
  if (
    entries.some(
      (entry) =>
        entry.kind === "thinking" && isImportedProcessMetadata(entry.metadata),
    )
  ) {
    return true;
  }

  if (
    entries.some(
      (entry) => entry.kind === "tool" && isImportedToolCall(entry.toolCall),
    )
  ) {
    return true;
  }

  if (!isMessageStreaming) {
    return false;
  }

  if (hasRunningWebRetrievalProcess(entries)) {
    return true;
  }

  const hasTool = entries.some((entry) => entry.kind === "tool");
  if (hasTool) {
    return false;
  }

  const hasPendingAction = entries.some(
    (entry) =>
      entry.kind === "action" && entry.actionRequired.status !== "submitted",
  );
  if (hasPendingAction) {
    return true;
  }

  return entries.every((entry) => entry.kind === "thinking");
}

function hasRunningWebRetrievalProcess(
  entries: StreamingProcessEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "tool" &&
      entry.toolCall.status === "running" &&
      (isUnifiedWebSearchToolName(entry.toolCall.name) ||
        isUnifiedWebFetchToolName(entry.toolCall.name)),
  );
}
