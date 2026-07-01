import type { ContentPart, Message } from "../types";
import { readContentPartSequence } from "../utils/contentPartTimeline";
import { normalizeSignatureText } from "./agentChatHistoryPrimitives";
import { contentPartContainsProcess } from "./agentChatHistoryProcess";
import {
  hasMessageImages,
  resolveMessageTimestampMs,
} from "./agentChatHistorySignatures";

const OMITTED_HISTORY_CONTENT_TEXT =
  "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。";
const COMPLETION_SENTINEL_TEXTS = new Set(["CLAW_NEWS_FIXTURE_DONE"]);

function isOmittedHistoryContentProjection(message: Message): boolean {
  return normalizeSignatureText(message.content).includes(
    OMITTED_HISTORY_CONTENT_TEXT,
  );
}

function isCompletionSentinelContent(content: string): boolean {
  return COMPLETION_SENTINEL_TEXTS.has(normalizeSignatureText(content));
}

export function hasRetainableLocalMessageState(message: Message): boolean {
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

export function hasRetainableLocalAssistantProcessState(
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

export function shouldMergeLocalAssistantProcessState(
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

export function shouldPreserveLocalAssistantVisibleOutput(
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
    isCompletionSentinelContent(remoteMessage.content) &&
    localMessage.runtimeTurnId?.trim() &&
    remoteMessage.runtimeTurnId?.trim() &&
    localMessage.runtimeTurnId === remoteMessage.runtimeTurnId
  ) {
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

export function mergeAssistantVisibleOutput(params: {
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
