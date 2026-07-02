import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { ActionRequired } from "../types";
import { isUnifiedWebSearchToolName } from "../utils/searchResultPreview";
import { isUnifiedWebFetchToolName } from "../utils/toolNameFamily";
import { isImportedSourceMetadata } from "../utils/importedSourceMetadata";
import { mergeIncrementalText } from "./streamingContentPartSegments";

export type StreamingProcessEntry =
  | {
      kind: "thinking";
      id: string;
      text: string;
      defaultExpanded?: boolean;
      isActive?: boolean;
      autoCollapseEligible?: boolean;
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

function mergeThinkingEntries(
  base: Extract<StreamingProcessEntry, { kind: "thinking" }>,
  chunk: Extract<StreamingProcessEntry, { kind: "thinking" }>,
): Extract<StreamingProcessEntry, { kind: "thinking" }> {
  return {
    ...base,
    text: mergeIncrementalText(base.text, chunk.text),
    defaultExpanded: base.defaultExpanded || chunk.defaultExpanded,
    isActive: base.isActive || chunk.isActive,
    autoCollapseEligible:
      base.autoCollapseEligible || chunk.autoCollapseEligible,
    preserveSourceText: base.preserveSourceText || chunk.preserveSourceText,
    metadata: base.metadata ?? chunk.metadata,
  };
}

export function coalesceAdjacentThinkingProcessEntries(
  entries: StreamingProcessEntry[],
): StreamingProcessEntry[] {
  if (entries.length < 2) {
    return entries;
  }

  const coalescedEntries: StreamingProcessEntry[] = [];
  let pendingThinking: Extract<
    StreamingProcessEntry,
    { kind: "thinking" }
  > | null = null;
  let didCoalesce = false;

  const flushPendingThinking = () => {
    if (!pendingThinking) {
      return;
    }
    coalescedEntries.push(pendingThinking);
    pendingThinking = null;
  };

  for (const entry of entries) {
    if (entry.kind !== "thinking") {
      flushPendingThinking();
      coalescedEntries.push(entry);
      continue;
    }

    if (!pendingThinking) {
      pendingThinking = entry;
      continue;
    }

    didCoalesce = true;
    pendingThinking = mergeThinkingEntries(pendingThinking, entry);
  }

  flushPendingThinking();
  return didCoalesce ? coalescedEntries : entries;
}

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

function isWebSearchToolCall(toolCall: ToolCallState): boolean {
  return isUnifiedWebSearchToolName(toolCall.name);
}

function isFailedWebSearchToolCall(toolCall: ToolCallState): boolean {
  return isWebSearchToolCall(toolCall) && toolCall.status === "failed";
}

function hasOnlyFailedWebSearchTools(
  entries: StreamingProcessEntry[],
): boolean {
  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.kind === "tool" && isFailedWebSearchToolCall(entry.toolCall),
    )
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

function hasOnlyWebRetrievalTools(entries: StreamingProcessEntry[]): boolean {
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

function hasSuccessfulOrRunningSkillProcess(
  entries: StreamingProcessEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "tool" &&
      (entry.toolCall.status === "running" ||
        entry.toolCall.status === "completed") &&
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
  const nextIsWebSearch =
    nextEntry.kind === "tool" && isWebSearchToolCall(nextEntry.toolCall);
  const currentHasWebRetrieval = currentEntries.some(
    (entry) => entry.kind === "tool" && isWebRetrievalToolCall(entry.toolCall),
  );
  const currentHasNonWebRetrieval = currentEntries.some(
    (entry) => entry.kind !== "tool" || !isWebRetrievalToolCall(entry.toolCall),
  );
  const currentHasOnlyThinking = currentEntries.every(
    (entry) => entry.kind === "thinking",
  );

  if (currentHasOnlyThinking && nextIsWebRetrieval) {
    return nextIsWebSearch;
  }

  if (currentHasWebRetrieval && nextIsWebSearch) {
    if (
      hasOnlyFailedWebSearchTools(currentEntries) &&
      nextEntry.kind === "tool" &&
      isFailedWebSearchToolCall(nextEntry.toolCall)
    ) {
      return false;
    }
    return true;
  }

  if (currentHasWebRetrieval && !nextIsWebRetrieval) {
    return nextEntry.kind !== "thinking";
  }

  if (
    !currentHasOnlyThinking &&
    currentHasNonWebRetrieval &&
    nextIsWebRetrieval
  ) {
    return !currentHasWebRetrieval;
  }

  return false;
}

export function shouldAutoExpandProcessEntries(
  entries: StreamingProcessEntry[],
  isMessageStreaming: boolean,
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

  const hasActiveThinking = entries.some(
    (entry) => entry.kind === "thinking" && entry.isActive,
  );
  if (!hasImportedProcess && hasActiveThinking) {
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

  if (!hasImportedProcess && hasSuccessfulOrRunningSkillProcess(entries)) {
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

  return false;
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
