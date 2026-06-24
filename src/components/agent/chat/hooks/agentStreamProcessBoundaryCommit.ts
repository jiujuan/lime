import type { ContentPart } from "../types";
import { appendTextToParts } from "./agentChatHistory";
import { reconcileAgentStreamFinalContentParts } from "./agentStreamCompletionController";

function contentPartText(parts: ContentPart[] | undefined): string {
  return (parts || [])
    .filter((part): part is Extract<ContentPart, { type: "text" }> => {
      return part.type === "text";
    })
    .map((part) => part.text)
    .join("");
}

function retainVisibleProcessBoundaryParts(params: {
  parts: ContentPart[] | undefined;
  shouldRetainThinkingPart: (part: ContentPart) => boolean;
  surfaceThinkingDeltas: boolean;
}): ContentPart[] {
  if (params.surfaceThinkingDeltas) {
    return params.parts || [];
  }
  return (params.parts || []).filter(
    (part) => part.type !== "thinking" || params.shouldRetainThinkingPart(part),
  );
}

export function buildAgentStreamProcessBoundaryTextCommitPatch(params: {
  accumulatedContent?: string | null;
  parts: ContentPart[] | undefined;
  renderedContent?: string | null;
  shouldRetainThinkingPart: (part: ContentPart) => boolean;
  surfaceThinkingDeltas: boolean;
  textPartMetadata?: Record<string, unknown>;
}): { content?: string; contentParts?: ContentPart[] } {
  const candidateContent = params.accumulatedContent?.trim()
    ? params.accumulatedContent
    : params.renderedContent || "";
  if (!candidateContent.trim()) {
    return {};
  }

  const currentText = contentPartText(params.parts);
  if (currentText === candidateContent) {
    return {};
  }

  const retainedParts = retainVisibleProcessBoundaryParts({
    parts: params.parts,
    shouldRetainThinkingPart: params.shouldRetainThinkingPart,
    surfaceThinkingDeltas: params.surfaceThinkingDeltas,
  });
  if (!currentText) {
    return {
      content: candidateContent,
      contentParts: appendTextToParts(retainedParts, candidateContent, {
        metadata: params.textPartMetadata,
        preserveEventBoundary: Boolean(params.textPartMetadata),
      }),
    };
  }

  if (currentText && candidateContent.startsWith(currentText)) {
    const pendingText = candidateContent.slice(currentText.length);
    if (!pendingText.trim()) {
      return {};
    }
    return {
      content: candidateContent,
      contentParts: appendTextToParts(retainedParts, pendingText, {
        metadata: params.textPartMetadata,
        preserveEventBoundary: Boolean(params.textPartMetadata),
      }),
    };
  }

  return {
    content: candidateContent,
    contentParts: reconcileAgentStreamFinalContentParts({
      parts: params.parts,
      finalContent: candidateContent,
      rawContent: params.accumulatedContent || candidateContent,
      surfaceThinkingDeltas: params.surfaceThinkingDeltas,
    }),
  };
}
