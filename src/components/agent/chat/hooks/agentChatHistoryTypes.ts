import type { AgentSessionDetail } from "@/lib/api/agentRuntime";
import type { ContentPart, Message } from "../types";

export type HistoryToolCall = NonNullable<Message["toolCalls"]>[number];
export type HistoryToolUseContentPart = Extract<ContentPart, { type: "tool_use" }>;
export type HistoryThreadToolCall = NonNullable<
  NonNullable<AgentSessionDetail["thread_read"]>["tool_calls"]
>[number];

export interface HydrateSessionDetailMessagesOptions {
  compactCompletedHistory?: boolean;
  includeTimelineFallback?: boolean;
  includeTimelineFallbackUsers?: boolean;
}
