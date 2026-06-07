import type { InputbarRuntimeStatusLineModel } from "../utils/inputbarRuntimeStatusLine";
import type { AgentRuntimeStatus, Message } from "../types";

export function shouldRenderAssistantRuntimeStatusPill(
  status?: AgentRuntimeStatus | null,
): boolean {
  return status?.phase === "failed" || status?.phase === "cancelled";
}

function hasTerminalAssistantRuntimeStatus(message: Message): boolean {
  return shouldRenderAssistantRuntimeStatusPill(message.runtimeStatus);
}

export interface MessageAssistantMetaFooterState {
  shouldRenderTailRuntimeStatusLine: boolean;
  shouldRenderActiveRuntimeFooterIndicator: boolean;
  shouldRenderStatusPill: boolean;
  shouldRenderUsageFooter: boolean;
  shouldSuppressAssistantMetaFooter: boolean;
  hasAssistantMetaFooter: boolean;
}

export interface ResolveMessageAssistantMetaFooterStateOptions {
  activeConversationRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
  hasAssistantBodyContent: boolean;
  isConversationTailAssistant: boolean;
  lastAssistantMessageId: string | null;
  message: Message;
  shouldDeferHistoricalMarkdownRender: boolean;
  shouldPreviewHistoricalAssistantMessage: boolean;
  shouldSuppressStandaloneImageWorkbenchProcess: boolean;
  tailRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
}

export function resolveMessageAssistantMetaFooterState({
  activeConversationRuntimeStatusLine,
  hasAssistantBodyContent,
  isConversationTailAssistant,
  lastAssistantMessageId,
  message,
  shouldDeferHistoricalMarkdownRender,
  shouldPreviewHistoricalAssistantMessage,
  shouldSuppressStandaloneImageWorkbenchProcess,
  tailRuntimeStatusLine,
}: ResolveMessageAssistantMetaFooterStateOptions): MessageAssistantMetaFooterState {
  const hasTerminalRuntimeStatus = hasTerminalAssistantRuntimeStatus(message);
  const shouldSuppressActiveRuntimeLine =
    tailRuntimeStatusLine?.status === "running" ||
    tailRuntimeStatusLine?.status === "queued";
  const shouldRenderTailRuntimeStatusLine =
    message.role === "assistant" &&
    !message.imageWorkbenchPreview &&
    message.id === lastAssistantMessageId &&
    isConversationTailAssistant &&
    !hasTerminalRuntimeStatus &&
    Boolean(tailRuntimeStatusLine) &&
    !shouldSuppressActiveRuntimeLine;
  const shouldRenderActiveRuntimeFooterIndicator =
    message.role === "assistant" &&
    !message.imageWorkbenchPreview &&
    message.id === lastAssistantMessageId &&
    isConversationTailAssistant &&
    hasAssistantBodyContent &&
    !hasTerminalRuntimeStatus &&
    Boolean(activeConversationRuntimeStatusLine) &&
    (activeConversationRuntimeStatusLine?.status === "running" ||
      activeConversationRuntimeStatusLine?.status === "queued") &&
    !shouldPreviewHistoricalAssistantMessage &&
    !shouldDeferHistoricalMarkdownRender;
  const shouldRenderImageWorkbenchUsageFooter =
    message.role === "assistant" &&
    Boolean(message.imageWorkbenchPreview) &&
    message.imageWorkbenchPreview?.status === "complete" &&
    isConversationTailAssistant &&
    !message.isThinking &&
    Boolean(message.usage);
  const shouldSuppressAssistantMetaFooter =
    shouldSuppressStandaloneImageWorkbenchProcess ||
    Boolean(
      message.imageWorkbenchPreview && !shouldRenderImageWorkbenchUsageFooter,
    );
  const shouldRenderUsageFooter =
    shouldRenderImageWorkbenchUsageFooter ||
    (!message.imageWorkbenchPreview &&
      isConversationTailAssistant &&
      !shouldSuppressAssistantMetaFooter &&
      !shouldRenderTailRuntimeStatusLine &&
      !shouldRenderActiveRuntimeFooterIndicator &&
      !message.isThinking &&
      Boolean(message.usage));
  const shouldRenderStatusPill =
    !message.imageWorkbenchPreview &&
    !shouldSuppressAssistantMetaFooter &&
    !shouldRenderTailRuntimeStatusLine &&
    hasTerminalRuntimeStatus;
  const hasAssistantMetaFooter =
    message.role === "assistant" &&
    !shouldSuppressAssistantMetaFooter &&
    (shouldRenderTailRuntimeStatusLine ||
      shouldRenderActiveRuntimeFooterIndicator ||
      shouldRenderStatusPill ||
      shouldRenderUsageFooter);

  return {
    hasAssistantMetaFooter,
    shouldRenderActiveRuntimeFooterIndicator,
    shouldRenderStatusPill,
    shouldRenderTailRuntimeStatusLine,
    shouldRenderUsageFooter,
    shouldSuppressAssistantMetaFooter,
  };
}
