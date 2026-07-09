import {
  isAgentMessageCommentaryPhase,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
import { isProcessBoundaryContentPart } from "../utils/contentPartTimeline";
import {
  areComparableContentTextsEqual,
  areComparableContentTextsRelated,
  isComparableContentTextPrefix,
  normalizeComparableContentText,
} from "./messageListComparableText";
import type { AgentThreadItem, Message } from "../types";
import type {
  MessageContentPart,
  TextMessageContentPart,
  ThinkingMessageContentPart,
} from "./messageListTimelineContentPartTypes";

export function appendTextContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
  metadata?: Record<string, unknown>,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text" && !metadata && !lastPart.metadata) {
    lastPart.text = `${lastPart.text}\n${normalized}`;
    return;
  }

  parts.push({
    type: "text",
    text: normalized,
    ...(metadata ? { metadata } : {}),
  });
}

export function appendThinkingContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
  metadata?: Record<string, unknown>,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "thinking") {
    if (areComparableContentTextsEqual(lastPart.text, normalized)) {
      return;
    }
    if (isComparableContentTextPrefix(lastPart.text, normalized)) {
      lastPart.text = normalized;
      if (!lastPart.metadata && metadata) {
        lastPart.metadata = metadata;
      }
      return;
    }
    if (isComparableContentTextPrefix(normalized, lastPart.text)) {
      if (!lastPart.metadata && metadata) {
        lastPart.metadata = metadata;
      }
      return;
    }

    lastPart.text = `${lastPart.text}\n\n${normalized}`;
    if (!lastPart.metadata && metadata) {
      lastPart.metadata = metadata;
    }
    return;
  }

  parts.push({
    type: "thinking",
    text: normalized,
    ...(metadata ? { metadata } : {}),
  });
}

export function appendPlanContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }
  appendTextContentPart(
    parts,
    `<proposed_plan>\n${normalized}\n</proposed_plan>`,
  );
}

export function isTextContentPart(
  part: MessageContentPart,
): part is TextMessageContentPart {
  return part.type === "text";
}

function readTextContentPartPhase(part: TextMessageContentPart): string | null {
  const phase = part.metadata?.phase;
  return typeof phase === "string" ? phase : null;
}

function isCommentaryTextContentPart(part: MessageContentPart): boolean {
  return (
    isTextContentPart(part) &&
    isAgentMessageCommentaryPhase(readTextContentPartPhase(part))
  );
}

export function isFinalTextContentPart(
  part: MessageContentPart,
): part is TextMessageContentPart {
  return isTextContentPart(part) && !isCommentaryTextContentPart(part);
}

export function isThinkingContentPart(
  part: MessageContentPart,
): part is ThinkingMessageContentPart {
  return part.type === "thinking";
}

function collectExistingProcessLeadParts(
  parts?: Message["contentParts"],
): MessageContentPart[] {
  const leadParts: MessageContentPart[] = [];
  for (const part of parts || []) {
    if (isThinkingContentPart(part) && part.text.trim().length > 0) {
      leadParts.push(part);
      continue;
    }

    if (
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch"
    ) {
      break;
    }

    if (isTextContentPart(part)) {
      break;
    }
  }
  return leadParts;
}

function resolveExistingFinalTextPart(
  parts?: Message["contentParts"],
): Extract<MessageContentPart, { type: "text" }> | null {
  const textParts = (parts || []).filter(isTextContentPart);
  return textParts[textParts.length - 1] || null;
}

function hasSameFinalTextContentPart(params: {
  finalText: string;
  parts: MessageContentPart[];
}): boolean {
  const firstProcessIndex = params.parts.findIndex(
    isProcessBoundaryContentPart,
  );
  const normalizedFinalText = params.finalText.trim();
  return params.parts.some((part, index) => {
    if (!isFinalTextContentPart(part)) {
      return false;
    }
    if (firstProcessIndex >= 0 && index <= firstProcessIndex) {
      return false;
    }
    return areComparableContentTextsEqual(part.text, normalizedFinalText);
  });
}

function collectExistingThinkingTexts(
  parts?: Message["contentParts"],
): Set<string> {
  const texts = new Set<string>();
  for (const part of parts || []) {
    if (isThinkingContentPart(part)) {
      const text = normalizeComparableContentText(part.text);
      if (text) {
        texts.add(text);
      }
    }
  }
  return texts;
}

export function hasOnlyDuplicateReasoningItems(params: {
  items: AgentThreadItem[];
  existingContentParts?: Message["contentParts"];
}): boolean {
  const reasoningItems = params.items.filter(
    (item): item is Extract<AgentThreadItem, { type: "reasoning" }> =>
      item.type === "reasoning" && item.text.trim().length > 0,
  );
  if (reasoningItems.length === 0) {
    return false;
  }

  if (
    !params.items.every(
      (item) =>
        item.type === "turn_summary" ||
        (item.type === "reasoning" && item.text.trim().length > 0),
    )
  ) {
    return false;
  }

  const existingThinkingTexts = collectExistingThinkingTexts(
    params.existingContentParts,
  );
  if (existingThinkingTexts.size === 0) {
    return false;
  }

  return reasoningItems.every((item) =>
    Array.from(existingThinkingTexts).some((existingThinking) =>
      areComparableContentTextsRelated(existingThinking, item.text),
    ),
  );
}

function removeTimelineLeadThinkingCoveredByExistingLead(params: {
  timelineParts: MessageContentPart[];
  existingLeadParts: MessageContentPart[];
}): MessageContentPart[] {
  const existingLeadThinkingTexts = collectExistingThinkingTexts(
    params.existingLeadParts,
  );
  if (existingLeadThinkingTexts.size === 0) {
    return params.timelineParts;
  }

  let changed = false;
  const nextParts: MessageContentPart[] = [];
  for (const part of params.timelineParts) {
    if (
      isThinkingContentPart(part) &&
      Array.from(existingLeadThinkingTexts).some(
        (existingThinking) =>
          areComparableContentTextsRelated(part.text, existingThinking),
      )
    ) {
      changed = true;
      continue;
    }
    nextParts.push(part);
  }

  return changed ? nextParts : params.timelineParts;
}

export function mergeExistingLeadAndFinalParts(params: {
  parts: MessageContentPart[];
  existingContentParts?: Message["contentParts"];
  displayContent: string;
}): MessageContentPart[] {
  const existingLeadParts = collectExistingProcessLeadParts(
    params.existingContentParts,
  );
  const existingFinalTextPart = resolveExistingFinalTextPart(
    params.existingContentParts,
  );
  if (!existingLeadParts.length && !existingFinalTextPart) {
    return params.parts;
  }

  const timelineParts = removeTimelineLeadThinkingCoveredByExistingLead({
    timelineParts: params.parts,
    existingLeadParts,
  });
  const merged = [...existingLeadParts, ...timelineParts];
  const finalText = existingFinalTextPart?.text.trim();
  if (!finalText) {
    return merged;
  }

  const hasSameFinalText = hasSameFinalTextContentPart({
    finalText,
    parts: merged,
  });
  const planOnlyTextPart =
    merged.filter(isTextContentPart).length === 1 &&
    merged.some(
      (part) =>
        isTextContentPart(part) &&
        part.text.trim().startsWith("<proposed_plan>"),
    );
  if (
    existingFinalTextPart &&
    (!hasSameFinalText ||
      (planOnlyTextPart && finalText === params.displayContent.trim()))
  ) {
    merged.push(existingFinalTextPart);
  }

  return merged;
}

export function shouldRenderTimelineAgentMessageAsCommentaryText(
  item: AgentThreadItem,
): item is Extract<AgentThreadItem, { type: "agent_message" }> {
  return (
    item.type === "agent_message" && isAgentMessageCommentaryPhase(item.phase)
  );
}

export function shouldRenderTimelineAgentMessageAsVisibleText(
  item: AgentThreadItem,
): item is Extract<AgentThreadItem, { type: "agent_message" }> {
  return (
    item.type === "agent_message" &&
    (shouldUseAgentMessageAsFinalText(item.phase) ||
      isAgentMessageCommentaryPhase(item.phase))
  );
}

export function hasFinalTextContentPart(parts: MessageContentPart[]): boolean {
  return parts.some(
    (part) => isFinalTextContentPart(part) && part.text.trim().length > 0,
  );
}
