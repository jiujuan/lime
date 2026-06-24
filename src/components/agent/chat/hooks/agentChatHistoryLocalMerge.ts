import type {
  ContentPart,
  Message,
  MessageImageWorkbenchPreview,
  MessageTaskPreview,
} from "../types";
import { projectConversationMessagesByRuntimeTurn } from "../utils/conversationTimelineOrdering";
import { readContentPartSequence } from "../utils/contentPartTimeline";
import { mergeArtifacts } from "../utils/messageArtifacts";
import {
  extractThinkingContentFromParts,
  mergeByKey,
  normalizeSignatureText,
} from "./agentChatHistoryPrimitives";
import {
  contentPartContainsProcess,
  hasRenderableAssistantTextContent,
  mergeHydratedContentParts,
  mergeHydratedToolStateContentParts,
  mergeImageWorkbenchPreview,
  mergeTaskPreview,
  mergeToolCallStates,
  settleRunningProcessPartsOnRemoteFailure,
  settleRunningToolCallOnRemoteFailure,
} from "./agentChatHistoryProcess";
import type { HistoryToolCall } from "./agentChatHistoryTypes";
import {
  buildAssistantHydrationSignature,
  buildHistoryMessageSignature,
  hasMessageImages,
  messageImageSignature,
  resolveMessageTimestampMs,
} from "./agentChatHistorySignatures";

const OMITTED_HISTORY_CONTENT_TEXT =
  "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。";

function isOmittedHistoryContentProjection(message: Message): boolean {
  return normalizeSignatureText(message.content).includes(
    OMITTED_HISTORY_CONTENT_TEXT,
  );
}

const findMatchingLocalUserMessageIndex = (
  localUserMessages: Message[],
  targetMessage: Message,
  startIndex: number,
): number => {
  const targetContent = normalizeSignatureText(targetMessage.content || "");
  const hasLooseContentMatch = (candidateContent: string): boolean => {
    const minLength = Math.min(candidateContent.length, targetContent.length);
    return (
      minLength >= 24 &&
      (candidateContent.includes(targetContent) ||
        targetContent.includes(candidateContent))
    );
  };

  for (let index = startIndex; index < localUserMessages.length; index += 1) {
    const candidate = localUserMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateContent = normalizeSignatureText(candidate.content || "");
    if (
      candidateContent === targetContent ||
      hasLooseContentMatch(candidateContent)
    ) {
      return index;
    }
  }

  return -1;
};

const findMatchingLocalAssistantMessageIndex = (
  localAssistantMessages: Message[],
  targetMessage: Message,
  startIndex: number,
): number => {
  const targetSignature = buildHistoryMessageSignature({
    ...targetMessage,
    usage: undefined,
  });

  for (
    let index = startIndex;
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateSignature = buildHistoryMessageSignature({
      ...candidate,
      usage: undefined,
    });
    if (candidateSignature === targetSignature) {
      return index;
    }
  }

  const fallbackSignature = buildAssistantHydrationSignature(targetMessage);
  if (!fallbackSignature) {
    return -1;
  }

  for (
    let index = startIndex;
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateSignature = buildAssistantHydrationSignature(candidate);
    if (candidateSignature === fallbackSignature) {
      return index;
    }
  }

  return -1;
};

function findNextLocalAssistantAfterUser(
  localMessages: Message[],
  localAssistantIndexById: Map<string, number>,
  matchedLocalMessageIds: Set<string>,
  userMessageIndex: number | null,
): number {
  if (userMessageIndex === null || userMessageIndex < 0) {
    return -1;
  }

  for (
    let index = userMessageIndex + 1;
    index < localMessages.length;
    index += 1
  ) {
    const candidate = localMessages[index];
    if (!candidate) {
      continue;
    }
    if (candidate.role === "user") {
      return -1;
    }
    if (candidate.role !== "assistant") {
      continue;
    }
    if (candidate.id && matchedLocalMessageIds.has(candidate.id)) {
      continue;
    }

    return candidate.id
      ? (localAssistantIndexById.get(candidate.id) ?? -1)
      : -1;
  }

  return -1;
}

function findNextLocalProcessAssistantIndex(
  localAssistantMessages: Message[],
  startIndex: number,
  matchedLocalMessageIds: Set<string>,
): number {
  for (
    let index = Math.max(0, startIndex);
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }
    if (candidate.id && matchedLocalMessageIds.has(candidate.id)) {
      continue;
    }
    if (hasRetainableLocalAssistantProcessState(candidate)) {
      return index;
    }
  }

  return -1;
}

function shouldPreserveLocalAssistantVisibleOutput(
  localMessage: Message | undefined,
  remoteMessage: Message,
): boolean {
  if (!localMessage) {
    return false;
  }

  const localContent = normalizeSignatureText(localMessage.content);
  if (!localContent) {
    return false;
  }

  const remoteContent = normalizeSignatureText(remoteMessage.content);
  if (remoteContent === localContent) {
    return false;
  }
  if (!remoteContent || isOmittedHistoryContentProjection(remoteMessage)) {
    return true;
  }

  if (
    remoteContent.length < localContent.length &&
    localContent.includes(remoteContent)
  ) {
    return true;
  }

  const localHasActiveRuntimeIdentity = Boolean(
    localMessage.runtimeTurnId?.trim() ||
      localMessage.inlineProcessRetention ||
      localMessage.isThinking ||
      hasRetainableLocalAssistantProcessState(localMessage),
  );
  if (
    localHasActiveRuntimeIdentity &&
    remoteContent.length < localContent.length &&
    localContent.startsWith(remoteContent)
  ) {
    return true;
  }

  const localTimestampMs = resolveMessageTimestampMs(localMessage);
  const remoteTimestampMs = resolveMessageTimestampMs(remoteMessage);
  if (
    localTimestampMs !== null &&
    remoteTimestampMs !== null &&
    remoteTimestampMs > localTimestampMs
  ) {
    return false;
  }

  return true;
}

function mergeAssistantVisibleOutput(params: {
  localContent: string;
  remoteContent: string;
}): string {
  const { localContent, remoteContent } = params;
  const local = localContent.trim();
  const remote = remoteContent.trim();
  if (!local) {
    return remoteContent;
  }
  if (!remote) {
    return localContent;
  }

  const normalizedLocal = normalizeSignatureText(local);
  const normalizedRemote = normalizeSignatureText(remote);
  if (
    normalizedLocal === normalizedRemote ||
    normalizedLocal.includes(normalizedRemote)
  ) {
    return localContent;
  }
  if (normalizedRemote.includes(normalizedLocal)) {
    return remoteContent;
  }

  return localContent;
}

function hasRetainableLocalMessageState(message: Message): boolean {
  if (message.role === "user") {
    return message.content.trim().length > 0 || hasMessageImages(message);
  }

  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(contentPartContainsProcess) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.actionRequests?.length || 0) > 0 ||
    (message.contextTrace?.length || 0) > 0 ||
    (message.artifacts?.length || 0) > 0 ||
    Boolean(message.imageWorkbenchPreview) ||
    Boolean(message.taskPreview) ||
    Boolean(message.runtimeStatus) ||
    message.content.trim().length > 0
  );
}

function hasRetainableLocalAssistantProcessState(
  message: Message | undefined,
): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(contentPartContainsProcess) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.actionRequests?.length || 0) > 0 ||
    (message.contextTrace?.length || 0) > 0 ||
    (message.artifacts?.length || 0) > 0 ||
    Boolean(message.imageWorkbenchPreview) ||
    Boolean(message.taskPreview) ||
    Boolean(message.runtimeStatus)
  );
}

function readContentPartMetadataIdentity(part: ContentPart): string | null {
  const metadata = part.metadata;
  const itemId = metadata?.itemId ?? metadata?.threadItemId;
  if (typeof itemId === "string" && itemId.trim()) {
    return itemId.trim();
  }

  const turnId = typeof metadata?.turnId === "string" ? metadata.turnId : "";
  const phase = typeof metadata?.phase === "string" ? metadata.phase : "";
  const sequence = readContentPartSequence(part);
  if (turnId && phase && sequence !== null) {
    return `${turnId}:${phase}:${sequence}`;
  }

  if (turnId && sequence !== null) {
    return `${turnId}:${sequence}`;
  }

  return null;
}

function readProcessContentPartIdentity(part: ContentPart): string | null {
  if (!contentPartContainsProcess(part)) {
    return null;
  }

  if (part.type === "tool_use") {
    return part.toolCall.id ? `tool:${part.toolCall.id}` : null;
  }

  if (part.type === "action_required") {
    return part.actionRequired.requestId
      ? `action:${part.actionRequired.requestId}`
      : null;
  }

  const metadataIdentity = readContentPartMetadataIdentity(part);
  return metadataIdentity ? `${part.type}:${metadataIdentity}` : null;
}

function hasLocalProcessPartMissingFromRemote(
  localMessage: Message,
  remoteMessage: Message,
): boolean {
  const remoteProcessIdentities = new Set(
    (remoteMessage.contentParts || [])
      .map(readProcessContentPartIdentity)
      .filter((identity): identity is string => Boolean(identity)),
  );

  return (localMessage.contentParts || []).some((part) => {
    const identity = readProcessContentPartIdentity(part);
    return Boolean(identity && !remoteProcessIdentities.has(identity));
  });
}

function shouldMergeLocalAssistantProcessState(
  localMessage: Message | undefined,
  remoteMessage: Message,
): boolean {
  const hasVisibleProcessState =
    Boolean(localMessage?.contentParts?.some(contentPartContainsProcess)) ||
    (localMessage?.toolCalls?.length || 0) > 0 ||
    (localMessage?.actionRequests?.length || 0) > 0 ||
    (localMessage?.contextTrace?.length || 0) > 0 ||
    (localMessage?.artifacts?.length || 0) > 0 ||
    Boolean(localMessage?.imageWorkbenchPreview) ||
    Boolean(localMessage?.taskPreview) ||
    Boolean(localMessage?.runtimeStatus);

  if (
    !localMessage ||
    remoteMessage.role !== "assistant" ||
    !hasVisibleProcessState
  ) {
    return false;
  }

  const localContent = normalizeSignatureText(localMessage.content);
  const remoteContent = normalizeSignatureText(remoteMessage.content);
  const hasCompatibleContent = Boolean(
    localContent &&
      remoteContent &&
      localContent === remoteContent &&
      !isOmittedHistoryContentProjection(remoteMessage),
  );
  const hasCompatibleTurn = Boolean(
    localMessage.runtimeTurnId &&
      remoteMessage.runtimeTurnId &&
      localMessage.runtimeTurnId === remoteMessage.runtimeTurnId,
  );
  if (hasRetainableLocalAssistantProcessState(remoteMessage)) {
    return (
      hasLocalProcessPartMissingFromRemote(localMessage, remoteMessage) &&
      (hasCompatibleTurn || hasCompatibleContent)
    );
  }

  return hasCompatibleContent;
}

function isLocalAssistantInMatchedUserTurn(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  lastMatchedLocalUserMessageIndex: number | null;
}): boolean {
  const { localAssistantMessage, lastMatchedLocalUserMessageIndex } = params;
  if (!localAssistantMessage?.id || lastMatchedLocalUserMessageIndex === null) {
    return false;
  }

  const assistantIndex = params.localMessageIndexById.get(
    localAssistantMessage.id,
  );
  if (
    assistantIndex === undefined ||
    assistantIndex <= lastMatchedLocalUserMessageIndex
  ) {
    return false;
  }

  return !params.localMessages
    .slice(lastMatchedLocalUserMessageIndex + 1, assistantIndex)
    .some((message) => message.role === "user");
}

function findPreviousLocalUserInSameTurn(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
}): Message | null {
  const { localAssistantMessage } = params;
  if (!localAssistantMessage?.id) {
    return null;
  }

  const assistantIndex = params.localMessageIndexById.get(
    localAssistantMessage.id,
  );
  if (assistantIndex === undefined || assistantIndex <= 0) {
    return null;
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = params.localMessages[index];
    if (!candidate) {
      continue;
    }

    if (candidate.role === "user") {
      return candidate;
    }
  }

  return null;
}

function hasRecoverableLocalUserBeforeAssistant(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  matchedLocalMessageIds: Set<string>;
}): boolean {
  const userMessage = findPreviousLocalUserInSameTurn(params);
  return Boolean(
    userMessage &&
    (!userMessage.id || !params.matchedLocalMessageIds.has(userMessage.id)) &&
    hasRetainableLocalMessageState(userMessage),
  );
}

function insertRecoverableLocalUsersForMatchedAssistantTurns(params: {
  mergedMessages: Message[];
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  matchedLocalMessageIds: Set<string>;
}): Message[] {
  const existingUserSignatures = new Set(
    params.mergedMessages
      .filter((message) => message.role === "user")
      .map((message) =>
        [
          normalizeSignatureText(message.content || ""),
          messageImageSignature(message.images),
        ].join("::"),
      ),
  );
  let inserted = false;
  const nextMessages: Message[] = [];

  for (const message of params.mergedMessages) {
    if (message.role !== "assistant") {
      nextMessages.push(message);
      continue;
    }

    const hasMergedUserInCurrentTurn = (() => {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        const candidate = nextMessages[index];
        if (candidate?.role === "user") {
          return true;
        }
        if (candidate?.role === "assistant") {
          return false;
        }
      }
      return false;
    })();
    if (hasMergedUserInCurrentTurn) {
      nextMessages.push(message);
      continue;
    }

    const localAssistantMessage =
      message.id && params.localMessageIndexById.has(message.id)
        ? params.localMessages[params.localMessageIndexById.get(message.id)!]
        : undefined;
    const userMessage = findPreviousLocalUserInSameTurn({
      localAssistantMessage,
      localMessageIndexById: params.localMessageIndexById,
      localMessages: params.localMessages,
    });
    if (userMessage && hasRetainableLocalMessageState(userMessage)) {
      const signature = [
        normalizeSignatureText(userMessage.content || ""),
        messageImageSignature(userMessage.images),
      ].join("::");
      const isAlreadyMatched = Boolean(
        userMessage.id && params.matchedLocalMessageIds.has(userMessage.id),
      );
      if (!isAlreadyMatched && !existingUserSignatures.has(signature)) {
        nextMessages.push(userMessage);
        existingUserSignatures.add(signature);
        if (userMessage.id) {
          params.matchedLocalMessageIds.add(userMessage.id);
        }
        inserted = true;
      }
    }

    nextMessages.push(message);
  }

  return inserted ? nextMessages : params.mergedMessages;
}

export const mergeHydratedMessagesWithLocalState = (
  localMessages: Message[],
  hydratedMessages: Message[],
): Message[] => {
  if (hydratedMessages.length === 0) {
    return localMessages;
  }

  const localUserMessages = localMessages.filter(
    (message) => message.role === "user",
  );
  const localAssistantMessages = localMessages.filter(
    (message) => message.role === "assistant",
  );
  const localUserMessageIndexById = new Map<string, number>();
  const localAssistantMessageIndexById = new Map<string, number>();
  const localMessageIndexById = new Map<string, number>();
  const localImagePreviewByTaskId = new Map<
    string,
    MessageImageWorkbenchPreview
  >();
  const localTaskPreviewByTaskId = new Map<string, MessageTaskPreview>();
  const hydratedMessageIds = new Set<string>();

  localUserMessages.forEach((message, index) => {
    if (message.id) {
      localUserMessageIndexById.set(message.id, index);
    }
  });
  localAssistantMessages.forEach((message, index) => {
    if (message.id) {
      localAssistantMessageIndexById.set(message.id, index);
    }
  });
  localMessages.forEach((message, index) => {
    if (message.id) {
      localMessageIndexById.set(message.id, index);
    }
  });
  hydratedMessages.forEach((message) => {
    if (message.id) {
      hydratedMessageIds.add(message.id);
    }
  });

  localMessages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }

    const imageTaskId = message.imageWorkbenchPreview?.taskId;
    if (imageTaskId) {
      localImagePreviewByTaskId.set(
        imageTaskId,
        message.imageWorkbenchPreview as MessageImageWorkbenchPreview,
      );
    }

    const taskPreviewId = message.taskPreview?.taskId;
    if (taskPreviewId) {
      localTaskPreviewByTaskId.set(
        taskPreviewId,
        message.taskPreview as MessageTaskPreview,
      );
    }
  });

  if (
    localUserMessages.length === 0 &&
    localAssistantMessages.length === 0 &&
    localImagePreviewByTaskId.size === 0 &&
    localTaskPreviewByTaskId.size === 0
  ) {
    return hydratedMessages;
  }

  let localUserCursor = 0;
  let localAssistantCursor = 0;
  let lastMatchedLocalUserMessageIndex: number | null = null;
  let hasHydratedUserInCurrentTurn = false;
  const matchedLocalMessageIds = new Set<string>();

  const mergedMessages = hydratedMessages.map((message) => {
    if (message.role === "assistant") {
      const matchedAssistantIndexById = message.id
        ? (localAssistantMessageIndexById.get(message.id) ?? -1)
        : -1;
      const matchedAssistantIndex =
        matchedAssistantIndexById >= 0
          ? matchedAssistantIndexById
          : findMatchingLocalAssistantMessageIndex(
              localAssistantMessages,
              message,
              localAssistantCursor,
            );
      const sequentialAssistantIndex =
        matchedAssistantIndex >= 0
          ? -1
          : findNextLocalAssistantAfterUser(
              localMessages,
              localAssistantMessageIndexById,
              matchedLocalMessageIds,
              lastMatchedLocalUserMessageIndex,
            );
      const processAssistantIndex =
        matchedAssistantIndex >= 0 ||
        sequentialAssistantIndex >= 0 ||
        hasRetainableLocalAssistantProcessState(message)
          ? -1
          : findNextLocalProcessAssistantIndex(
              localAssistantMessages,
              localAssistantCursor,
              matchedLocalMessageIds,
            );
      const resolvedMatchedAssistantIndex =
        matchedAssistantIndex >= 0
          ? matchedAssistantIndex
          : sequentialAssistantIndex >= 0
            ? sequentialAssistantIndex
            : processAssistantIndex;
      const didMatchLocalProcessAssistantOnly =
        processAssistantIndex >= 0 &&
        matchedAssistantIndex < 0 &&
        sequentialAssistantIndex < 0;
      const localAssistantMessage =
        resolvedMatchedAssistantIndex >= 0
          ? localAssistantMessages[resolvedMatchedAssistantIndex]
          : undefined;
      if (resolvedMatchedAssistantIndex >= 0) {
        localAssistantCursor = Math.max(
          localAssistantCursor,
          resolvedMatchedAssistantIndex + 1,
        );
        if (localAssistantMessage?.id) {
          matchedLocalMessageIds.add(localAssistantMessage.id);
        }
      }

      const localImagePreview =
        (message.imageWorkbenchPreview?.taskId
          ? localImagePreviewByTaskId.get(message.imageWorkbenchPreview.taskId)
          : undefined) ?? localAssistantMessage?.imageWorkbenchPreview;
      const localTaskPreview =
        (message.taskPreview?.taskId
          ? localTaskPreviewByTaskId.get(message.taskPreview.taskId)
          : undefined) ?? localAssistantMessage?.taskPreview;

      if (!localImagePreview && !localTaskPreview && !localAssistantMessage) {
        return message;
      }

      const hasMatchedUserTurn = isLocalAssistantInMatchedUserTurn({
        localAssistantMessage,
        localMessageIndexById,
        localMessages,
        lastMatchedLocalUserMessageIndex,
      });
      const hasRecoverableLocalUserTurn =
        !hasHydratedUserInCurrentTurn &&
        hasRecoverableLocalUserBeforeAssistant({
          localAssistantMessage,
          localMessageIndexById,
          localMessages,
          matchedLocalMessageIds,
        });
      const shouldPreserveLocalRuntimeSnapshot =
        (hasMatchedUserTurn || hasRecoverableLocalUserTurn) &&
        hasRetainableLocalAssistantProcessState(localAssistantMessage) &&
        !hasRetainableLocalAssistantProcessState(message);
      const shouldRestoreHistoricalProcessState =
        (hasMatchedUserTurn ||
          hasRecoverableLocalUserTurn ||
          didMatchLocalProcessAssistantOnly) &&
        hasRetainableLocalAssistantProcessState(localAssistantMessage) &&
        !hasRetainableLocalAssistantProcessState(message);
      const shouldMergeMatchingProcessState =
        shouldMergeLocalAssistantProcessState(localAssistantMessage, message);
      const shouldRetainLocalProcessState =
        !hasRenderableAssistantTextContent(message) ||
        shouldPreserveLocalRuntimeSnapshot ||
        shouldRestoreHistoricalProcessState ||
        shouldMergeMatchingProcessState;
      const shouldRetainLocalThinkingState =
        shouldRetainLocalProcessState || Boolean(message.thinkingContent);
      const contentParts = shouldRetainLocalProcessState
        ? mergeHydratedContentParts(
            localAssistantMessage?.contentParts,
            message.contentParts,
          )
        : message.contentParts;
      const toolCalls = (() => {
        const localToolCalls = localAssistantMessage?.toolCalls || [];
        const remoteToolCalls = message.toolCalls || [];
        if (localToolCalls.length === 0) {
          return remoteToolCalls.length > 0 ? remoteToolCalls : undefined;
        }
        if (remoteToolCalls.length === 0) {
          return localToolCalls;
        }

        const mergedToolCalls: HistoryToolCall[] = [...localToolCalls];
        const toolCallIndexById = new Map<string, number>();
        mergedToolCalls.forEach((toolCall, index) => {
          toolCallIndexById.set(toolCall.id, index);
        });

        for (const toolCall of remoteToolCalls) {
          const existingIndex = toolCallIndexById.get(toolCall.id);
          if (existingIndex === undefined) {
            toolCallIndexById.set(toolCall.id, mergedToolCalls.length);
            mergedToolCalls.push(toolCall);
            continue;
          }

          const existingToolCall = mergedToolCalls[existingIndex];
          if (existingToolCall) {
            mergedToolCalls[existingIndex] = mergeToolCallStates(
              existingToolCall,
              toolCall,
            );
          }
        }

        return mergedToolCalls;
      })();
      const actionRequests = mergeByKey(
        localAssistantMessage?.actionRequests,
        message.actionRequests,
        (request) => request.requestId,
      );
      const contextTrace = mergeByKey(
        localAssistantMessage?.contextTrace,
        message.contextTrace,
        (step) => `${step.stage}::${step.detail}`,
      );
      const artifacts = (() => {
        const localArtifacts = localAssistantMessage?.artifacts || [];
        const remoteArtifacts = message.artifacts || [];
        if (localArtifacts.length === 0) {
          return remoteArtifacts.length > 0 ? remoteArtifacts : undefined;
        }
        if (remoteArtifacts.length === 0) {
          return localArtifacts;
        }
        const merged = mergeArtifacts([...localArtifacts, ...remoteArtifacts]);
        return merged.length > 0 ? merged : undefined;
      })();
      const thinkingContent =
        message.thinkingContent ??
        (shouldRetainLocalThinkingState
          ? localAssistantMessage?.thinkingContent
          : undefined) ??
        extractThinkingContentFromParts(contentParts);
      const remoteIsFailedRuntimeStatus =
        message.runtimeStatus?.phase === "failed";
      const shouldPreserveLocalVisibleOutput =
        !remoteIsFailedRuntimeStatus &&
        (localAssistantMessage?.isThinking === true ||
          shouldPreserveLocalRuntimeSnapshot ||
          shouldPreserveLocalAssistantVisibleOutput(
            localAssistantMessage,
            message,
          ));
      const resolvedContentParts = shouldPreserveLocalVisibleOutput
        ? (mergeHydratedToolStateContentParts(
            localAssistantMessage?.contentParts,
            contentParts,
          ) ??
          localAssistantMessage?.contentParts ??
          contentParts)
        : contentParts;
      const resolvedThinkingContent = shouldPreserveLocalVisibleOutput
        ? (localAssistantMessage?.thinkingContent ??
          extractThinkingContentFromParts(resolvedContentParts))
        : thinkingContent;
      const resolvedFailedContentParts = remoteIsFailedRuntimeStatus
        ? settleRunningProcessPartsOnRemoteFailure(
            resolvedContentParts,
            message,
          )
        : resolvedContentParts;
      const resolvedFailedToolCalls =
        remoteIsFailedRuntimeStatus && toolCalls
          ? toolCalls.map((toolCall) =>
              settleRunningToolCallOnRemoteFailure(toolCall, message),
            )
          : toolCalls;

      return {
        ...message,
        id: localAssistantMessage?.id ?? message.id,
        content: shouldPreserveLocalVisibleOutput
          ? mergeAssistantVisibleOutput(
              {
                localContent: localAssistantMessage?.content || "",
                remoteContent: message.content,
              },
            )
          : message.content,
        usage: message.usage ?? localAssistantMessage?.usage,
        contentParts: resolvedFailedContentParts,
        toolCalls: resolvedFailedToolCalls,
        actionRequests,
        contextTrace,
        artifacts,
        thinkingContent: remoteIsFailedRuntimeStatus
          ? extractThinkingContentFromParts(resolvedFailedContentParts)
          : resolvedThinkingContent,
        runtimeTurnId:
          message.runtimeTurnId ?? localAssistantMessage?.runtimeTurnId,
        inlineProcessRetention:
          message.inlineProcessRetention ??
          localAssistantMessage?.inlineProcessRetention,
        imageWorkbenchPreview: mergeImageWorkbenchPreview(
          localImagePreview,
          message.imageWorkbenchPreview,
        ),
        taskPreview: mergeTaskPreview(localTaskPreview, message.taskPreview),
      };
    }

    if (message.role !== "user") {
      return message;
    }

    hasHydratedUserInCurrentTurn = true;
    const matchedIndexById = message.id
      ? (localUserMessageIndexById.get(message.id) ?? -1)
      : -1;
    const matchedIndex =
      matchedIndexById >= 0
        ? matchedIndexById
        : findMatchingLocalUserMessageIndex(
            localUserMessages,
            message,
            localUserCursor,
          );
    if (matchedIndex < 0) {
      lastMatchedLocalUserMessageIndex = null;
      return message;
    }

    localUserCursor = Math.max(localUserCursor, matchedIndex + 1);
    const localMessage = localUserMessages[matchedIndex];
    if (localMessage?.id) {
      matchedLocalMessageIds.add(localMessage.id);
      lastMatchedLocalUserMessageIndex =
        localMessageIndexById.get(localMessage.id) ?? null;
    } else {
      lastMatchedLocalUserMessageIndex = null;
    }
    if (!localMessage) {
      return message;
    }

    if (hasMessageImages(message) || !hasMessageImages(localMessage)) {
      return {
        ...message,
        id: localMessage.id || message.id,
        inputCapabilityRoute:
          message.inputCapabilityRoute ?? localMessage.inputCapabilityRoute,
      };
    }

    return {
      ...message,
      id: localMessage.id || message.id,
      images: localMessage.images,
      inputCapabilityRoute:
        message.inputCapabilityRoute ?? localMessage.inputCapabilityRoute,
    };
  });

  const lastHydratedMessage =
    hydratedMessages.length > 0
      ? (hydratedMessages[hydratedMessages.length - 1] as Message)
      : null;
  const lastHydratedTimestampMs = lastHydratedMessage
    ? resolveMessageTimestampMs(lastHydratedMessage)
    : null;
  const lastMatchedLocalIndex = localMessages.reduce(
    (latest, message, index) => {
      if (!matchedLocalMessageIds.has(message.id)) {
        return latest;
      }
      return index;
    },
    -1,
  );
  const lastMatchedLocalMessage =
    lastMatchedLocalIndex >= 0 ? localMessages[lastMatchedLocalIndex] : null;
  const mergedMessagesWithRecoveredLocalUsers =
    insertRecoverableLocalUsersForMatchedAssistantTurns({
      mergedMessages,
      localMessageIndexById,
      localMessages,
      matchedLocalMessageIds,
    });

  const retainedLocalTail = localMessages.filter((message, index) => {
    if (hydratedMessageIds.has(message.id)) {
      return false;
    }
    if (matchedLocalMessageIds.has(message.id)) {
      return false;
    }
    if (index <= lastMatchedLocalIndex) {
      return false;
    }
    if (!hasRetainableLocalMessageState(message)) {
      return false;
    }

    const shouldRetainAssistantTailAfterHydratedUser =
      message.role === "assistant" &&
      lastHydratedMessage?.role === "user" &&
      lastMatchedLocalMessage?.role === "user";
    if (shouldRetainAssistantTailAfterHydratedUser) {
      return true;
    }

    const localTimestampMs = resolveMessageTimestampMs(message);
    if (lastHydratedTimestampMs === null || localTimestampMs === null) {
      return true;
    }

    return localTimestampMs >= lastHydratedTimestampMs;
  });

  return projectConversationMessagesByRuntimeTurn(
    retainedLocalTail.length > 0
      ? [...mergedMessagesWithRecoveredLocalUsers, ...retainedLocalTail]
      : mergedMessagesWithRecoveredLocalUsers,
  );
};
