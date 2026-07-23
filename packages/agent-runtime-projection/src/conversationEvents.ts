import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { truncateText } from "./normalization.js";

export interface AgentUiMessageSnapshotProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  role: string;
  partCount: number;
}

export interface AgentUiTextDeltaProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  text: string;
  chunkCount?: number;
  boundary?: string;
}

export interface AgentUiReasoningDeltaProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  text: string;
  itemId?: string;
  streamKind?: "summary" | "content";
  summaryIndex?: number;
}

export function buildAgentUiMessageSnapshotEvent(
  input: AgentUiMessageSnapshotProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "message" },
      context,
    ),
    type: "messages.snapshot",
    owner: "session",
    scope: "message",
    phase: "hydrating",
    surface: "conversation",
    persistence: "snapshot",
    payload: {
      role: input.role,
      partCount: input.partCount,
    },
  };
}

export function buildAgentUiTextDeltaEvent(
  input: AgentUiTextDeltaProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "text_delta" },
      context,
    ),
    type: "text.delta",
    owner: "model",
    scope: "part",
    phase: "producing",
    surface: "conversation",
    persistence: "transcript",
    payload: {
      textLength: input.text.length,
      preview: truncateText(input.text),
      ...(typeof input.chunkCount === "number"
        ? {
            chunkCount: input.chunkCount,
            boundary: input.boundary,
          }
        : {}),
    },
  };
}

export function buildAgentUiReasoningDeltaEvent(
  input: AgentUiReasoningDeltaProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "thinking_delta" },
      context,
    ),
    type: "reasoning.delta",
    ...(input.itemId ? { partId: input.itemId } : {}),
    owner: "model",
    scope: "part",
    phase: "reasoning",
    surface: "inline_process",
    persistence: "ephemeral_live",
    payload: {
      textLength: input.text.length,
      preview: truncateText(input.text),
      ...(input.streamKind ? { streamKind: input.streamKind } : {}),
      ...(typeof input.summaryIndex === "number"
        ? { summaryIndex: input.summaryIndex }
        : {}),
    },
  };
}
