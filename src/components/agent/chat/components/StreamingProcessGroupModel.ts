import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ActionRequired } from "../types";
import { isUnifiedWebSearchToolName } from "../utils/searchResultPreview";
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

export function isWebRetrievalToolCall(toolCall: ToolCallState): boolean {
  return (
    isUnifiedWebSearchToolName(toolCall.name) ||
    isUnifiedWebFetchToolName(toolCall.name)
  );
}

function isSuccessfulOrRunningWebRetrievalToolCall(
  toolCall: ToolCallState,
): boolean {
  return (
    isWebRetrievalToolCall(toolCall) &&
    (toolCall.status === "running" || toolCall.status === "completed")
  );
}

function hasSuccessfulOrRunningWebRetrievalProcess(
  entries: StreamingProcessEntry[],
): boolean {
  const webRetrievalEntries = entries.filter(
    (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
      entry.kind === "tool" && isWebRetrievalToolCall(entry.toolCall),
  );
  if (webRetrievalEntries.length === 0) {
    return false;
  }

  return webRetrievalEntries.some((entry) =>
    isSuccessfulOrRunningWebRetrievalToolCall(entry.toolCall),
  );
}

function hasOnlyWebRetrievalTools(
  entries: StreamingProcessEntry[],
): boolean {
  const toolEntries = entries.filter(
    (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
      entry.kind === "tool",
  );
  return (
    toolEntries.length > 0 &&
    toolEntries.every((entry) => isWebRetrievalToolCall(entry.toolCall))
  );
}

function toolMetadata(toolCall: ToolCallState): Record<string, unknown> | null {
  const metadata = (toolCall as { metadata?: unknown }).metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

function isSkillToolCall(toolCall: ToolCallState): boolean {
  const normalizedName = toolCall.name.trim().toLowerCase();
  if (
    normalizedName === "skill" ||
    normalizedName === "skilltool" ||
    normalizedName === "lime_run_service_skill"
  ) {
    return true;
  }

  const metadata = toolMetadata(toolCall);
  return (
    metadata?.tool_family === "skill" ||
    typeof metadata?.skill_name === "string" ||
    typeof metadata?.skillName === "string"
  );
}

function hasRunningSkillProcess(entries: StreamingProcessEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "tool" &&
      entry.toolCall.status === "running" &&
      isSkillToolCall(entry.toolCall),
  );
}

export function shouldSplitProcessBeforeEntry(
  currentEntries: StreamingProcessEntry[],
  nextEntry: StreamingProcessEntry,
): boolean {
  if (currentEntries.length === 0) {
    return false;
  }

  const nextIsWebRetrieval =
    nextEntry.kind === "tool" && isWebRetrievalToolCall(nextEntry.toolCall);
  const currentHasWebRetrieval = currentEntries.some(
    (entry) =>
      entry.kind === "tool" && isWebRetrievalToolCall(entry.toolCall),
  );
  const currentHasNonWebRetrieval = currentEntries.some(
    (entry) =>
      entry.kind !== "tool" || !isWebRetrievalToolCall(entry.toolCall),
  );

  if (
    currentHasWebRetrieval &&
    !nextIsWebRetrieval
  ) {
    return nextEntry.kind !== "thinking";
  }

  if (currentHasNonWebRetrieval && nextIsWebRetrieval) {
    return !currentHasWebRetrieval;
  }

  return false;
}

export function shouldAutoExpandProcessEntries(
  entries: StreamingProcessEntry[],
  isMessageStreaming: boolean,
  options?: {
    isTailProcessRun?: boolean;
  },
): boolean {
  const hasImportedThinking = entries.some(
    (entry) =>
      entry.kind === "thinking" && isImportedProcessMetadata(entry.metadata),
  );
  const hasImportedTool = entries.some(
    (entry) => entry.kind === "tool" && isImportedToolCall(entry.toolCall),
  );
  const hasImportedProcess = hasImportedThinking || hasImportedTool;
  const hasRunningWebRetrieval = hasRunningWebRetrievalProcess(entries);
  const isImportedWebRetrievalOnly =
    hasImportedTool &&
    entries.every(
      (entry) =>
        entry.kind === "tool" &&
        isImportedToolCall(entry.toolCall) &&
        isWebRetrievalToolCall(entry.toolCall),
    );

  if (!isMessageStreaming) {
    if (isImportedWebRetrievalOnly) {
      return hasRunningWebRetrieval;
    }
    return hasImportedThinking || hasImportedTool;
  }

  if (isImportedWebRetrievalOnly && hasRunningWebRetrieval) {
    return true;
  }

  if (!hasImportedProcess && hasRunningWebRetrieval) {
    return true;
  }

  if (
    !hasImportedProcess &&
    hasOnlyWebRetrievalTools(entries) &&
    hasSuccessfulOrRunningWebRetrievalProcess(entries)
  ) {
    return true;
  }

  if (
    options?.isTailProcessRun &&
    !hasImportedProcess &&
    hasRunningSkillProcess(entries)
  ) {
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
      isWebRetrievalToolCall(entry.toolCall),
  );
}
