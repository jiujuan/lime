import type { Message } from "../types";
import {
  isImageTaskCreationToolName,
  isImageTaskToolResultLike,
} from "../utils/imageTaskToolResult";
import { shouldSuppressImageWorkbenchStatusText } from "../utils/imageWorkbenchStatusText";
import { isImageGenerationProtocolFailureResidue } from "../utils/limeTaskProtocolNoise";

export interface ImageWorkbenchMessageDisplayState {
  hasLeadContent: boolean;
  isImageWorkbenchMessage: boolean;
  shouldFoldSuppressedProcessFlow: boolean;
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

function hasImageTaskCreationProcess(message: Message): boolean {
  return Boolean(
    message.toolCalls?.some((toolCall) => {
      if (isImageTaskCreationToolName(toolCall.name)) {
        return true;
      }

      return isImageTaskToolResultLike({
        toolName: toolCall.name,
        output: toolCall.result?.output,
        metadata: toolCall.result?.metadata,
        result: toolCall.result,
        toolResult: toolCall.result,
      });
    }),
  );
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
  const hasImageTaskProcess =
    isAssistantMessage &&
    !isImageWorkbenchMessage &&
    hasImageTaskCreationProcess(params.message);
  const shouldSuppressStandaloneText =
    isAssistantMessage &&
    !isImageWorkbenchMessage &&
    (shouldSuppressImageWorkbenchStatusText(params.rawDisplayContent) ||
      hasImageFailureProtocolResidue);
  const shouldSuppressStandaloneProcess =
    shouldSuppressStandaloneText || hasImageTaskProcess;
  const shouldSuppressAssistantText =
    isAssistantMessage &&
    isImageWorkbenchMessage &&
    (shouldSuppressImageWorkbenchStatusText(params.rawDisplayContent) ||
      hasImageFailureProtocolResidue);
  const visibleRawDisplayContent =
    isAssistantMessage &&
    (shouldSuppressAssistantText || shouldSuppressStandaloneText)
      ? ""
      : params.rawDisplayContent;
  const thinkingContent =
    isAssistantMessage && isImageWorkbenchMessage
      ? params.thinkingContent
      : undefined;

  return {
    hasLeadContent: Boolean(visibleRawDisplayContent.trim() || thinkingContent),
    isImageWorkbenchMessage,
    shouldFoldSuppressedProcessFlow:
      isImageWorkbenchMessage || !hasImageTaskProcess,
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

function filterImageWorkbenchLeadContentParts(
  parts: Message["contentParts"] | undefined,
): Message["contentParts"] | undefined {
  const filtered = (parts || []).filter(
    (part) => part.type === "text" || part.type === "thinking",
  );
  return filtered.length > 0 ? filtered : undefined;
}

export function resolveImageWorkbenchProcessDisplayState(params: {
  message: Message;
  sanitizedContentParts?: Message["contentParts"];
  shouldDeferMessageDetails: boolean;
  shouldFoldSuppressedProcessFlow: boolean;
  shouldSuppressImageProcessFlow: boolean;
}): ImageWorkbenchProcessDisplayState {
  if (params.message.imageWorkbenchPreview) {
    return {
      displayContentParts: filterImageWorkbenchLeadContentParts(
        params.sanitizedContentParts,
      ),
      shouldFoldSuppressedProcessFlow: false,
      shouldSuppressRendererProcessFlow: false,
    };
  }

  const shouldFoldSuppressedProcessFlow =
    params.shouldFoldSuppressedProcessFlow &&
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

  const leadContentParts = filterImageWorkbenchLeadContentParts(
    params.rendererContentParts,
  );
  const hasActionContent = Boolean(params.actionContent.trim());
  const hasLeadTextPart = Boolean(
    leadContentParts?.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    ),
  );
  const contentParts =
    hasLeadTextPart || !hasActionContent ? leadContentParts : undefined;
  const thinkingContent =
    params.imageWorkbenchThinkingContent ||
    params.rendererThinkingContent;
  const shouldRenderInlineProcess = Boolean(
    hasActionContent ||
      (contentParts?.length || 0) > 0 ||
      thinkingContent?.trim(),
  );

  return {
    contentParts,
    shouldRenderInlineProcess,
    thinkingContent,
    toolCalls: undefined,
  };
}
