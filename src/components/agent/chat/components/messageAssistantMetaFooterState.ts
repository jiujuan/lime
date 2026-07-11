import type { InputbarRuntimeStatusLineModel } from "../utils/inputbarRuntimeStatusLine";
import type { AgentRuntimeStatus, Message } from "../types";
import { hasMeaningfulAssistantVisibleText } from "../utils/assistantVisibleText";

function isTerminalThreadReadStatus(status?: string | null): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "aborted" ||
    status === "cancelled" ||
    status === "canceled"
  );
}

export function shouldRenderAssistantRuntimeStatusPill(
  status?: AgentRuntimeStatus | null,
): boolean {
  return status?.phase === "failed" || status?.phase === "cancelled";
}

function hasTerminalAssistantRuntimeStatus(message: Message): boolean {
  return shouldRenderAssistantRuntimeStatusPill(message.runtimeStatus);
}

function hasFailureDiagnosticMarker(value?: string | null): boolean {
  const text = (value || "").trim().replace(/\s+/g, " ");
  return /(?:执行失败\s*[:：]|execution failed\s*:|当前处理失败(?:\s|$))/i.test(
    text,
  );
}

function hasEmbeddedFailureDiagnosticText(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (hasFailureDiagnosticMarker(message.content)) {
    return true;
  }

  return Boolean(
    message.contentParts?.some(
      (part) => part.type === "text" && hasFailureDiagnosticMarker(part.text),
    ),
  );
}

function hasRenderedImageWorkbenchPreview(message: Message): boolean {
  const preview = message.imageWorkbenchPreview;
  if (!preview) {
    return false;
  }
  if (preview.imageUrl?.trim()) {
    return true;
  }
  return Boolean(preview.previewImages?.some((url) => url.trim()));
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
  hasActiveInteractiveRuntime: boolean;
  hasAssistantBodyContent: boolean;
  isConversationTailAssistant: boolean;
  lastAssistantMessageId: string | null;
  message: Message;
  shouldDeferHistoricalMarkdownRender: boolean;
  shouldPreviewHistoricalAssistantMessage: boolean;
  shouldSuppressStandaloneImageWorkbenchProcess: boolean;
  tailRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
  threadReadStatus?: string | null;
}

export function resolveMessageAssistantMetaFooterState({
  activeConversationRuntimeStatusLine,
  hasActiveInteractiveRuntime,
  hasAssistantBodyContent,
  isConversationTailAssistant,
  lastAssistantMessageId,
  message,
  shouldDeferHistoricalMarkdownRender,
  shouldPreviewHistoricalAssistantMessage,
  shouldSuppressStandaloneImageWorkbenchProcess,
  tailRuntimeStatusLine,
  threadReadStatus,
}: ResolveMessageAssistantMetaFooterStateOptions): MessageAssistantMetaFooterState {
  const hasTerminalRuntimeStatus = hasTerminalAssistantRuntimeStatus(message);
  const hasFinalAssistantContent = hasMeaningfulAssistantVisibleText(message);
  const hasFailureDiagnosticText =
    message.runtimeStatus?.phase === "failed" &&
    hasEmbeddedFailureDiagnosticText(message);
  const shouldSuppressTerminalStatusPillForVisibleAnswer =
    message.runtimeStatus?.phase === "failed" &&
    hasFinalAssistantContent &&
    !hasFailureDiagnosticText;
  const shouldSuppressStaleActiveRuntimeLine =
    hasFinalAssistantContent &&
    (isTerminalThreadReadStatus(threadReadStatus) ||
      !hasActiveInteractiveRuntime);
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
    !shouldSuppressStaleActiveRuntimeLine &&
    !shouldPreviewHistoricalAssistantMessage &&
    !shouldDeferHistoricalMarkdownRender;
  const shouldRenderImageWorkbenchUsageFooter =
    message.role === "assistant" &&
    Boolean(message.imageWorkbenchPreview) &&
    (message.imageWorkbenchPreview?.status === "complete" ||
      hasRenderedImageWorkbenchPreview(message)) &&
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
    hasTerminalRuntimeStatus &&
    !shouldSuppressTerminalStatusPillForVisibleAnswer;
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
