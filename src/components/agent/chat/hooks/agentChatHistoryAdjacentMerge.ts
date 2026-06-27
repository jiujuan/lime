import type { AgentContextTraceStep as ContextTraceStep } from "@/lib/api/agentProtocol";
import type { ContentPart, Message } from "../types";
import { mergeArtifacts } from "../utils/messageArtifacts";
import { extractThinkingContentFromParts } from "./agentChatHistoryPrimitives";
import {
  hasRenderableAssistantTextContent,
  mergeImageWorkbenchPreview,
  mergeTaskPreview,
  mergeToolCallStates,
  mergeToolUseContentPart,
} from "./agentChatHistoryProcess";
import type { HistoryToolCall } from "./agentChatHistoryTypes";
import {
  collectMessageToolIds,
  hasAssistantThinkingContent,
  hasSharedValue,
} from "./agentChatHistorySignatures";

export const mergeAdjacentAssistantMessages = (
  messages: Message[],
): Message[] => {
  const merged: Message[] = [];

  for (const current of messages) {
    if (merged.length === 0) {
      merged.push(current);
      continue;
    }

    const previous = merged[merged.length - 1];
    if (!previous || !shouldMergeAdjacentAssistantMessages(previous, current)) {
      merged.push(current);
      continue;
    }

    const content = [previous.content.trim(), current.content.trim()]
      .filter(Boolean)
      .join("\n\n");
    const contentParts = (() => {
      const nextParts: ContentPart[] = [...(previous.contentParts || [])];
      for (const part of current.contentParts || []) {
        if (part.type === "tool_use") {
          const existingIndex = nextParts.findIndex(
            (item) =>
              item.type === "tool_use" && item.toolCall.id === part.toolCall.id,
          );
          if (existingIndex >= 0) {
            const existingPart = nextParts[existingIndex];
            if (existingPart?.type === "tool_use") {
              nextParts[existingIndex] = mergeToolUseContentPart(
                existingPart,
                part,
              );
            } else {
              nextParts[existingIndex] = part;
            }
            continue;
          }
          nextParts.push(part);
          continue;
        }

        if (part.type === "action_required") {
          const existingIndex = nextParts.findIndex(
            (item) =>
              item.type === "action_required" &&
              item.actionRequired.requestId === part.actionRequired.requestId,
          );
          if (existingIndex >= 0) {
            nextParts[existingIndex] = part;
            continue;
          }
          nextParts.push(part);
          continue;
        }

        nextParts.push(part);
      }
      return nextParts;
    })();
    const toolCalls = (() => {
      const previousToolCalls = previous.toolCalls || [];
      const currentToolCalls = current.toolCalls || [];
      if (previousToolCalls.length === 0) {
        return currentToolCalls.length > 0 ? currentToolCalls : undefined;
      }
      if (currentToolCalls.length === 0) {
        return previousToolCalls;
      }

      const toolCallById = new Map<string, HistoryToolCall>();
      for (const toolCall of previousToolCalls) {
        toolCallById.set(toolCall.id, toolCall);
      }
      for (const toolCall of currentToolCalls) {
        const existing = toolCallById.get(toolCall.id);
        if (existing) {
          toolCallById.set(
            toolCall.id,
            mergeToolCallStates(existing, toolCall),
          );
          continue;
        }
        toolCallById.set(toolCall.id, toolCall);
      }

      if (toolCallById.size === 0) {
        return undefined;
      }

      return Array.from(toolCallById.values());
    })();
    const contextTrace = (() => {
      const seen = new Set<string>();
      const mergedSteps: ContextTraceStep[] = [];
      for (const step of [
        ...(previous.contextTrace || []),
        ...(current.contextTrace || []),
      ]) {
        const key = `${step.stage}::${step.detail}`;
        if (!seen.has(key)) {
          seen.add(key);
          mergedSteps.push(step);
        }
      }
      return mergedSteps;
    })();
    const artifacts = mergeArtifacts([
      ...(previous.artifacts || []),
      ...(current.artifacts || []),
    ]);
    const imageWorkbenchPreview = mergeImageWorkbenchPreview(
      previous.imageWorkbenchPreview,
      current.imageWorkbenchPreview,
    );
    const taskPreview = mergeTaskPreview(
      previous.taskPreview,
      current.taskPreview,
    );

    merged[merged.length - 1] = {
      ...previous,
      content,
      contentParts: contentParts.length > 0 ? contentParts : undefined,
      toolCalls: (toolCalls?.length || 0) > 0 ? toolCalls : undefined,
      contextTrace: contextTrace.length > 0 ? contextTrace : undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      usage: current.usage ?? previous.usage,
      runtimeStatus: current.runtimeStatus ?? previous.runtimeStatus,
      imageWorkbenchPreview,
      taskPreview,
      timestamp: current.timestamp,
      isThinking: false,
      thinkingContent: extractThinkingContentFromParts(contentParts),
    };
  }

  return merged;
};

function hasSharedProcessIdentity(
  previous: Message,
  current: Message,
): boolean {
  if (
    previous.imageWorkbenchPreview?.taskId &&
    previous.imageWorkbenchPreview.taskId ===
      current.imageWorkbenchPreview?.taskId
  ) {
    return true;
  }
  if (
    previous.taskPreview?.taskId &&
    previous.taskPreview.taskId === current.taskPreview?.taskId
  ) {
    return true;
  }

  const previousToolIds = collectMessageToolIds(previous);
  const currentToolIds = collectMessageToolIds(current);
  if (hasSharedValue(previousToolIds, currentToolIds)) {
    return true;
  }

  const previousActionIds = new Set(
    (previous.actionRequests || []).map((request) => request.requestId),
  );
  const currentActionIds = new Set(
    (current.actionRequests || []).map((request) => request.requestId),
  );
  return hasSharedValue(previousActionIds, currentActionIds);
}

function shouldMergeAdjacentAssistantMessages(
  previous: Message,
  current: Message,
): boolean {
  if (previous.role !== "assistant" || current.role !== "assistant") {
    return false;
  }

  const previousRuntimeTurnId = previous.runtimeTurnId?.trim();
  const currentRuntimeTurnId = current.runtimeTurnId?.trim();
  if (
    previousRuntimeTurnId &&
    currentRuntimeTurnId &&
    previousRuntimeTurnId !== currentRuntimeTurnId
  ) {
    return false;
  }

  if (hasSharedProcessIdentity(previous, current)) {
    return true;
  }

  if (
    previous.imageWorkbenchPreview?.taskId &&
    current.imageWorkbenchPreview?.taskId &&
    previous.imageWorkbenchPreview.taskId !==
      current.imageWorkbenchPreview.taskId
  ) {
    return false;
  }

  if (
    previous.taskPreview?.taskId &&
    current.taskPreview?.taskId &&
    previous.taskPreview.taskId !== current.taskPreview.taskId
  ) {
    return false;
  }

  const previousHasThinking = hasAssistantThinkingContent(previous);
  const currentHasThinking = hasAssistantThinkingContent(current);
  if (!previousHasThinking && !currentHasThinking) {
    return true;
  }

  const previousHasText = hasRenderableAssistantTextContent(previous);
  const currentHasText = hasRenderableAssistantTextContent(current);
  return previousHasThinking && !previousHasText && currentHasText;
}
