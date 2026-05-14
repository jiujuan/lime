import type { Message } from "../types";
import { shouldSuppressImageWorkbenchStatusText } from "../utils/imageWorkbenchStatusText";
import { isImageGenerationProtocolFailureResidue } from "../utils/limeTaskProtocolNoise";

export interface ImageWorkbenchMessageDisplayState {
  hasLeadContent: boolean;
  isImageWorkbenchMessage: boolean;
  shouldSuppressAssistantText: boolean;
  shouldSuppressProcessFlow: boolean;
  shouldSuppressStandaloneProcess: boolean;
  thinkingContent?: string;
  visibleRawDisplayContent: string;
}

export interface ImageWorkbenchProcessDisplayState {
  displayContentParts?: Message["contentParts"];
  shouldFoldSuppressedProcessFlow: boolean;
  shouldSuppressRendererProcessFlow: boolean;
}

export interface ImageWorkbenchRendererProcessState {
  contentParts?: Message["contentParts"];
  shouldRenderInlineProcess: boolean;
  thinkingContent?: string;
  toolCalls?: Message["toolCalls"];
}

export function resolveImageWorkbenchMessageDisplayState(params: {
  message: Message;
  rawDisplayContent: string;
  thinkingContent?: string;
}): ImageWorkbenchMessageDisplayState {
  const isAssistantMessage = params.message.role === "assistant";
  const isImageWorkbenchMessage = Boolean(params.message.imageWorkbenchPreview);
  const hasImageFailureProtocolResidue =
    isAssistantMessage &&
    isImageGenerationProtocolFailureResidue(params.rawDisplayContent);
  const shouldSuppressStandaloneProcess =
    isAssistantMessage &&
    !isImageWorkbenchMessage &&
    (shouldSuppressImageWorkbenchStatusText(params.rawDisplayContent) ||
      hasImageFailureProtocolResidue);
  const shouldSuppressAssistantText =
    isAssistantMessage &&
    isImageWorkbenchMessage &&
    (shouldSuppressImageWorkbenchStatusText(params.rawDisplayContent) ||
      hasImageFailureProtocolResidue);
  const visibleRawDisplayContent =
    isAssistantMessage &&
    (shouldSuppressAssistantText || shouldSuppressStandaloneProcess)
      ? ""
      : params.rawDisplayContent;
  const thinkingContent =
    isAssistantMessage && isImageWorkbenchMessage
      ? params.thinkingContent
      : undefined;

  return {
    hasLeadContent: Boolean(visibleRawDisplayContent.trim() || thinkingContent),
    isImageWorkbenchMessage,
    shouldSuppressAssistantText,
    shouldSuppressProcessFlow: Boolean(
      isImageWorkbenchMessage || shouldSuppressStandaloneProcess,
    ),
    shouldSuppressStandaloneProcess,
    thinkingContent,
    visibleRawDisplayContent,
  };
}

function hasRenderableInlineProcessParts(
  parts: Message["contentParts"] | undefined,
): boolean {
  return Boolean(parts?.some((part) => part.type !== "text"));
}

function collectToolCallsFromContentParts(
  parts: Message["contentParts"] | undefined,
): Message["toolCalls"] | undefined {
  if (!parts?.length) {
    return undefined;
  }

  const toolCalls = parts
    .filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "tool_use" }
      > => part.type === "tool_use",
    )
    .map((part) => part.toolCall);

  return toolCalls.length > 0 ? toolCalls : undefined;
}

export function resolveImageWorkbenchProcessDisplayState(params: {
  message: Message;
  sanitizedContentParts?: Message["contentParts"];
  shouldDeferMessageDetails: boolean;
  shouldSuppressImageProcessFlow: boolean;
}): ImageWorkbenchProcessDisplayState {
  const shouldFoldSuppressedProcessFlow =
    !params.shouldDeferMessageDetails &&
    params.shouldSuppressImageProcessFlow &&
    params.message.role === "assistant" &&
    (hasRenderableInlineProcessParts(params.sanitizedContentParts) ||
      (params.message.toolCalls?.length || 0) > 0 ||
      (params.message.actionRequests?.length || 0) > 0);
  const shouldSuppressRendererProcessFlow =
    params.shouldSuppressImageProcessFlow && !shouldFoldSuppressedProcessFlow;
  const displayContentParts = shouldSuppressRendererProcessFlow
    ? undefined
    : shouldFoldSuppressedProcessFlow
      ? params.sanitizedContentParts?.filter((part) => part.type !== "text")
      : params.sanitizedContentParts;

  return {
    displayContentParts,
    shouldFoldSuppressedProcessFlow,
    shouldSuppressRendererProcessFlow,
  };
}

export function resolveImageWorkbenchRendererProcessState(params: {
  actionContent: string;
  imageWorkbenchThinkingContent?: string;
  message: Message;
  rendererActionRequests?: Message["actionRequests"];
  rendererContentParts?: Message["contentParts"];
  rendererThinkingContent?: string;
  rendererToolCalls?: Message["toolCalls"];
  shouldSuppressRendererProcessFlow: boolean;
}): ImageWorkbenchRendererProcessState {
  if (!params.message.imageWorkbenchPreview) {
    return {
      contentParts: params.rendererContentParts,
      shouldRenderInlineProcess: false,
      thinkingContent: params.rendererThinkingContent,
      toolCalls: params.rendererToolCalls,
    };
  }

  const toolCalls = !params.shouldSuppressRendererProcessFlow
    ? params.rendererToolCalls && params.rendererToolCalls.length > 0
      ? params.rendererToolCalls
      : collectToolCallsFromContentParts(params.rendererContentParts)
    : undefined;
  const shouldUseFallbackProcess = Boolean(
    params.actionContent || (toolCalls?.length || 0) > 0,
  );
  const contentParts = shouldUseFallbackProcess
    ? undefined
    : params.rendererContentParts;
  const thinkingContent =
    params.imageWorkbenchThinkingContent ||
    (shouldUseFallbackProcess ? params.rendererThinkingContent : undefined);
  const shouldRenderInlineProcess = Boolean(
    !params.shouldSuppressRendererProcessFlow &&
    ((contentParts?.length || 0) > 0 ||
      (toolCalls?.length || 0) > 0 ||
      (params.rendererActionRequests || []).length > 0 ||
      thinkingContent?.trim()),
  );

  return {
    contentParts,
    shouldRenderInlineProcess,
    thinkingContent,
    toolCalls,
  };
}
