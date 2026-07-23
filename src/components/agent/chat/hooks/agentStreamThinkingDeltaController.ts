import type { Message } from "../types";
import { appendTextWithOverlapDetection } from "./agentChatHistory";

type MessageParts = NonNullable<Message["contentParts"]>;

export type AgentStreamThinkingPartsAppender = (
  parts: MessageParts,
  textDelta: string,
) => MessageParts;

export interface AgentStreamThinkingDeltaPreApplyPlan {
  shouldActivateStream: boolean;
  shouldApplyThinkingDelta: boolean;
}

export function buildAgentStreamThinkingDeltaPreApplyPlan(params: {
  surfaceThinkingDeltas: boolean;
}): AgentStreamThinkingDeltaPreApplyPlan {
  return {
    shouldActivateStream: true,
    shouldApplyThinkingDelta: params.surfaceThinkingDeltas,
  };
}

export function buildAgentStreamThinkingDeltaMessagePatch(params: {
  appendThinkingToParts: AgentStreamThinkingPartsAppender;
  appendMode?: "overlap" | "verbatim";
  contentParts?: Message["contentParts"];
  forceNewPart?: boolean;
  partMetadata?: Record<string, unknown>;
  textDelta: string;
  thinkingContent?: string;
}): Pick<Message, "contentParts" | "isThinking" | "thinkingContent"> {
  const appendMode = params.appendMode ?? "overlap";
  const contentParts =
    appendMode === "verbatim"
      ? appendVerbatimThinkingPart({
          parts: params.contentParts || [],
          textDelta: params.textDelta,
          forceNewPart: params.forceNewPart === true,
          metadata: params.partMetadata,
        })
      : applyThinkingPartMetadata(
          params.appendThinkingToParts(
            params.contentParts || [],
            params.textDelta,
          ),
          params.partMetadata,
        );
  return {
    isThinking: true,
    thinkingContent:
      appendMode === "verbatim"
        ? appendVerbatimThinkingText(
            params.thinkingContent || "",
            params.textDelta,
            params.forceNewPart === true,
          )
        : appendTextWithOverlapDetection(
            params.thinkingContent || "",
            params.textDelta,
          ),
    contentParts,
  };
}

function appendVerbatimThinkingText(
  current: string,
  delta: string,
  forceNewPart: boolean,
): string {
  if (!current) {
    return delta;
  }
  return forceNewPart
    ? `${current.trimEnd()}\n\n${delta}`
    : `${current}${delta}`;
}

function appendVerbatimThinkingPart(params: {
  parts: MessageParts;
  textDelta: string;
  forceNewPart: boolean;
  metadata?: Record<string, unknown>;
}): MessageParts {
  const nextParts = [...params.parts];
  const lastIndex = nextParts.length - 1;
  const lastPart = nextParts[lastIndex];
  if (!params.forceNewPart && lastPart?.type === "thinking") {
    nextParts[lastIndex] = {
      ...lastPart,
      text: `${lastPart.text}${params.textDelta}`,
      ...(params.metadata
        ? { metadata: { ...(lastPart.metadata ?? {}), ...params.metadata } }
        : {}),
    };
    return nextParts;
  }
  nextParts.push({
    type: "thinking",
    text: params.textDelta,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
  return nextParts;
}

function applyThinkingPartMetadata(
  parts: MessageParts,
  metadata?: Record<string, unknown>,
): MessageParts {
  if (!metadata) {
    return parts;
  }
  const lastIndex = parts.length - 1;
  const lastPart = parts[lastIndex];
  if (lastPart?.type !== "thinking") {
    return parts;
  }
  const nextParts = [...parts];
  nextParts[lastIndex] = {
    ...lastPart,
    metadata: { ...(lastPart.metadata ?? {}), ...metadata },
  };
  return nextParts;
}
