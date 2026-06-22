import type {
  ContentPart,
  Message,
  MessageImageWorkbenchPreview,
  MessageTaskPreview,
} from "../types";
import type { HistoryToolCall, HistoryToolUseContentPart } from "./agentChatHistoryTypes";
import { appendTextToParts, normalizeSignatureText } from "./agentChatHistoryPrimitives";

function settleRunningToolCallOnCompletedAssistant(
  toolCall: HistoryToolCall,
  completedAt: Date,
): HistoryToolCall {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "completed",
    endTime: toolCall.endTime ?? completedAt,
    result: toolCall.result ?? {
      success: true,
      output: "",
    },
  };
}

export function settleCompletedAssistantRunningToolState(message: Message): Message {
  if (
    message.role !== "assistant" ||
    message.isThinking ||
    !hasRenderableAssistantTextContent(message)
  ) {
    return message;
  }

  const hasRunningToolCall =
    message.toolCalls?.some((toolCall) => toolCall.status === "running") ??
    false;
  const hasRunningToolPart =
    message.contentParts?.some(
      (part) => part.type === "tool_use" && part.toolCall.status === "running",
    ) ?? false;

  if (!hasRunningToolCall && !hasRunningToolPart) {
    return message;
  }

  const completedAt = message.timestamp;
  return {
    ...message,
    toolCalls: message.toolCalls?.map((toolCall) =>
      settleRunningToolCallOnCompletedAssistant(toolCall, completedAt),
    ),
    contentParts: message.contentParts?.map((part) =>
      part.type === "tool_use"
        ? {
            ...part,
            toolCall: settleRunningToolCallOnCompletedAssistant(
              part.toolCall,
              completedAt,
            ),
          }
        : part,
    ),
  };
}

export function mergeImageWorkbenchPreview(
  previous?: MessageImageWorkbenchPreview,
  next?: MessageImageWorkbenchPreview,
): MessageImageWorkbenchPreview | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  if (previous.taskId !== next.taskId) {
    return next;
  }
  return {
    ...previous,
    ...next,
  };
}

export function mergeTaskPreview(
  previous?: MessageTaskPreview,
  next?: MessageTaskPreview,
): MessageTaskPreview | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  if (previous.taskId !== next.taskId) {
    return next;
  }
  return {
    ...previous,
    ...next,
  };
}

export function contentPartContainsProcess(part: ContentPart): boolean {
  return part.type !== "text";
}

export function mergeToolCallStates(
  previous: HistoryToolCall,
  next: HistoryToolCall,
): HistoryToolCall {
  if (previous.status === "running" && next.status !== "running") {
    return next;
  }
  if (previous.status !== "running" && next.status === "running") {
    return previous;
  }
  return next;
}

export function mergeToolUseContentPart(
  previous: HistoryToolUseContentPart,
  next: HistoryToolUseContentPart,
): HistoryToolUseContentPart {
  const mergedToolCall = mergeToolCallStates(previous.toolCall, next.toolCall);
  const metadata = mergeContentPartMetadata(previous.metadata, next.metadata);
  return mergedToolCall === previous.toolCall
    ? metadata && previous.metadata !== metadata
      ? { ...previous, metadata }
      : previous
    : {
        ...previous,
        ...next,
        ...(metadata ? { metadata } : {}),
        toolCall: mergedToolCall,
      };
}

function mergeContentPartMetadata(
  previous?: Record<string, unknown>,
  next?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!previous && !next) {
    return undefined;
  }

  const metadata = {
    ...(next ?? {}),
    ...(previous ?? {}),
  };
  if (
    typeof previous?.sequence !== "number" &&
    typeof next?.sequence === "number" &&
    Number.isFinite(next.sequence)
  ) {
    metadata.sequence = next.sequence;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function shouldAppendHydratedTextPart(
  baseParts: ContentPart[],
  text: string,
): boolean {
  const normalizedText = normalizeSignatureText(text);
  if (!normalizedText) {
    return false;
  }

  return !baseParts.some((part) => {
    if (part.type !== "text") {
      return false;
    }
    const normalizedExistingText = normalizeSignatureText(part.text);
    return (
      normalizedExistingText === normalizedText ||
      normalizedExistingText.includes(normalizedText)
    );
  });
}

export function mergeHydratedToolStateContentParts(
  baseParts?: ContentPart[],
  overlayParts?: ContentPart[],
): ContentPart[] | undefined {
  const base = Array.isArray(baseParts) ? [...baseParts] : [];
  const overlay = Array.isArray(overlayParts) ? overlayParts : [];

  if (base.length === 0) {
    return overlay.length > 0 ? overlay : undefined;
  }
  if (overlay.length === 0) {
    return base;
  }

  const toolUseIndexById = new Map<string, number>();
  const actionRequiredIndexById = new Map<string, number>();
  const thinkingIndexByKey = new Map<string, number>();
  let lastOverlayAnchorIndex: number | null = null;

  const shiftIndexesAfterInsert = (insertIndex: number) => {
    const shiftMap = (map: Map<string, number>) => {
      for (const [key, index] of map.entries()) {
        if (index >= insertIndex) {
          map.set(key, index + 1);
        }
      }
    };
    shiftMap(toolUseIndexById);
    shiftMap(actionRequiredIndexById);
    shiftMap(thinkingIndexByKey);
  };

  const insertOverlayPart = (part: ContentPart): number => {
    const insertIndex =
      lastOverlayAnchorIndex === null
        ? base.length
        : Math.min(lastOverlayAnchorIndex + 1, base.length);
    shiftIndexesAfterInsert(insertIndex);
    base.splice(insertIndex, 0, part);
    lastOverlayAnchorIndex = insertIndex;
    return insertIndex;
  };

  base.forEach((part, index) => {
    if (part.type === "tool_use") {
      toolUseIndexById.set(part.toolCall.id, index);
      return;
    }
    if (part.type === "action_required") {
      actionRequiredIndexById.set(part.actionRequired.requestId, index);
      return;
    }
    if (part.type === "thinking") {
      const key =
        typeof part.metadata?.threadItemId === "string"
          ? part.metadata.threadItemId
          : normalizeSignatureText(part.text);
      if (key) {
        thinkingIndexByKey.set(key, index);
      }
    }
  });

  for (const part of overlay) {
    if (part.type === "tool_use") {
      const existingIndex = toolUseIndexById.get(part.toolCall.id);
      if (existingIndex !== undefined) {
        const current = base[existingIndex];
        if (current?.type === "tool_use") {
          base[existingIndex] = mergeToolUseContentPart(current, part);
        }
        lastOverlayAnchorIndex = existingIndex;
        continue;
      }
      toolUseIndexById.set(part.toolCall.id, insertOverlayPart(part));
      continue;
    }

    if (part.type === "action_required") {
      const existingIndex = actionRequiredIndexById.get(
        part.actionRequired.requestId,
      );
      if (existingIndex !== undefined) {
        base[existingIndex] = part;
        lastOverlayAnchorIndex = existingIndex;
        continue;
      }
      actionRequiredIndexById.set(
        part.actionRequired.requestId,
        insertOverlayPart(part),
      );
      continue;
    }

    if (part.type === "thinking") {
      const key =
        typeof part.metadata?.threadItemId === "string"
          ? part.metadata.threadItemId
          : normalizeSignatureText(part.text);
      const existingIndex = key ? thinkingIndexByKey.get(key) : undefined;
      if (existingIndex !== undefined) {
        base[existingIndex] = part;
        lastOverlayAnchorIndex = existingIndex;
        continue;
      }
      if (key) {
        thinkingIndexByKey.set(key, insertOverlayPart(part));
      } else {
        insertOverlayPart(part);
      }
    }
  }

  return base;
}

export function settleRunningToolCallOnRemoteFailure(
  toolCall: HistoryToolCall,
  failedMessage: Message,
): HistoryToolCall {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "failed",
    endTime: failedMessage.timestamp,
    result: {
      success: false,
      output: "",
      error: failedMessage.runtimeStatus?.detail || failedMessage.content,
      images: undefined,
    },
  };
}

export function settleRunningProcessPartsOnRemoteFailure(
  parts: ContentPart[] | undefined,
  failedMessage: Message,
): ContentPart[] | undefined {
  if (!parts) {
    return undefined;
  }

  return parts.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }

    return {
      ...part,
      toolCall: settleRunningToolCallOnRemoteFailure(
        part.toolCall,
        failedMessage,
      ),
    };
  });
}

export function mergeHydratedContentParts(
  localParts?: ContentPart[],
  remoteParts?: ContentPart[],
): ContentPart[] | undefined {
  const local = Array.isArray(localParts) ? localParts : [];
  const remote = Array.isArray(remoteParts) ? remoteParts : [];

  if (local.length === 0) {
    return remote.length > 0 ? remote : undefined;
  }
  if (remote.length === 0) {
    return local;
  }

  const localHasProcess = local.some(contentPartContainsProcess);
  const remoteHasProcess = remote.some(contentPartContainsProcess);
  if (localHasProcess && !remoteHasProcess) {
    let merged = [...local];
    for (const part of remote) {
      if (part.type === "text" && part.text.trim()) {
        merged = appendTextToParts(merged, part.text);
      }
    }
    return merged;
  }

  if (localHasProcess && remoteHasProcess) {
    const merged: ContentPart[] = [...local];
    const toolUseIndexById = new Map<string, number>();
    const actionRequiredIndexById = new Map<string, number>();
    let lastOverlayAnchorIndex: number | null = null;
    merged.forEach((part, index) => {
      if (part.type === "tool_use") {
        toolUseIndexById.set(part.toolCall.id, index);
        return;
      }
      if (part.type === "action_required") {
        actionRequiredIndexById.set(part.actionRequired.requestId, index);
      }
    });

    const shiftIndexesAfterInsert = (insertIndex: number) => {
      for (const [key, index] of toolUseIndexById.entries()) {
        if (index >= insertIndex) {
          toolUseIndexById.set(key, index + 1);
        }
      }
      for (const [key, index] of actionRequiredIndexById.entries()) {
        if (index >= insertIndex) {
          actionRequiredIndexById.set(key, index + 1);
        }
      }
      if (
        lastOverlayAnchorIndex !== null &&
        lastOverlayAnchorIndex >= insertIndex
      ) {
        lastOverlayAnchorIndex += 1;
      }
    };
    const insertProcessPart = (part: ContentPart): number => {
      const insertIndex =
        lastOverlayAnchorIndex === null
          ? findInitialProcessInsertionIndex(merged, part)
          : Math.min(lastOverlayAnchorIndex + 1, merged.length);
      shiftIndexesAfterInsert(insertIndex);
      merged.splice(insertIndex, 0, part);
      lastOverlayAnchorIndex = insertIndex;
      return insertIndex;
    };

    for (const part of remote) {
      if (part.type === "tool_use") {
        const existingIndex = toolUseIndexById.get(part.toolCall.id);
        if (existingIndex !== undefined) {
          const current = merged[existingIndex];
          if (current?.type === "tool_use") {
            merged[existingIndex] = mergeToolUseContentPart(current, part);
          }
          lastOverlayAnchorIndex = existingIndex;
          continue;
        }
        toolUseIndexById.set(part.toolCall.id, insertProcessPart(part));
        continue;
      }

      if (part.type === "action_required") {
        const existingIndex = actionRequiredIndexById.get(
          part.actionRequired.requestId,
        );
        if (existingIndex !== undefined) {
          merged[existingIndex] = part;
          lastOverlayAnchorIndex = existingIndex;
          continue;
        }
        actionRequiredIndexById.set(
          part.actionRequired.requestId,
          insertProcessPart(part),
        );
        continue;
      }

      if (part.type === "text" && part.text.trim()) {
        if (shouldAppendHydratedTextPart(merged, part.text)) {
          merged.push(part);
        }
        continue;
      }

      insertProcessPart(part);
    }
    return merged;
  }

  return remote;
}

function findInitialProcessInsertionIndex(
  parts: ContentPart[],
  nextPart: ContentPart,
): number {
  const nextSortKey = contentPartSortTime(nextPart);
  if (nextSortKey === null) {
    const firstProcessIndex = findFirstProcessPartIndex(parts);
    if (firstProcessIndex >= 0) {
      return firstProcessIndex;
    }
  }
  const finalTextIndex = findLastTextPartIndex(parts);
  const searchEndIndex = finalTextIndex >= 0 ? finalTextIndex : parts.length;
  if (nextSortKey !== null) {
    for (let index = 0; index < searchEndIndex; index += 1) {
      const existingSortKey = contentPartSortTime(parts[index]!);
      if (existingSortKey !== null && existingSortKey > nextSortKey) {
        return index;
      }
    }
  }
  return searchEndIndex;
}

function findFirstProcessPartIndex(parts: ContentPart[]): number {
  return parts.findIndex(contentPartContainsProcess);
}

function findLastTextPartIndex(parts: ContentPart[]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === "text" && part.text.trim().length > 0) {
      return index;
    }
  }
  return -1;
}

function contentPartSortTime(part: ContentPart): number | null {
  if (part.type === "tool_use") {
    const value = part.toolCall.startTime ?? part.toolCall.endTime;
    const timestamp = value instanceof Date ? value.getTime() : NaN;
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  if (part.type === "action_required") {
    return null;
  }
  return null;
}

export function sortProcessContentParts(parts: ContentPart[]): ContentPart[] {
  return parts
    .map((part, index) => ({
      part,
      index,
      timestamp: contentPartSortTime(part),
    }))
    .sort((left, right) => {
      const leftIsText = left.part.type === "text";
      const rightIsText = right.part.type === "text";
      if (leftIsText !== rightIsText) {
        return leftIsText ? 1 : -1;
      }

      if (left.timestamp !== null && right.timestamp !== null) {
        if (left.timestamp !== right.timestamp) {
          return left.timestamp - right.timestamp;
        }
      } else if (left.timestamp !== null || right.timestamp !== null) {
        return left.timestamp !== null ? 1 : -1;
      }

      return left.index - right.index;
    })
    .map(({ part }) => part);
}

export function hasRenderableAssistantTextContent(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (message.content.trim().length > 0) {
    return true;
  }

  return (message.contentParts || []).some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}
