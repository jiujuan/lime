import type {
  AgentEvent,
  AgentThreadItem,
} from "@/lib/api/agentProtocol";

export function buildAgentStreamPlanThreadItem(params: {
  activeSessionId: string;
  event: Extract<AgentEvent, { type: "plan_delta" | "plan_final" }>;
  fallbackTurnId?: string | null;
  now?: string;
  pendingItemKey?: string;
  sequence?: number | null;
}): AgentThreadItem | null {
  const text = params.event.text.trim() || params.event.delta?.trim() || "";
  if (!text) {
    return null;
  }
  const now = params.now ?? new Date().toISOString();
  const turnId =
    params.event.turn_id ||
    params.fallbackTurnId?.trim() ||
    params.activeSessionId;
  const revisionId =
    params.event.revisionId ||
    `${params.event.type}:${turnId}:${params.event.sequence ?? "live"}`;
  const itemId = `plan:${revisionId}`;
  return {
    id: itemId,
    thread_id: params.event.thread_id || params.activeSessionId,
    turn_id: turnId,
    sequence: params.sequence ?? params.event.sequence ?? 0,
    status: params.event.type === "plan_final" ? "completed" : "in_progress",
    started_at: params.event.timestamp || now,
    completed_at: params.event.type === "plan_final" ? now : undefined,
    updated_at: now,
    type: "plan",
    text,
    metadata: {
      revisionId,
      source:
        params.event.source ||
        (params.event.toolCallId ? "update_plan" : "live_event"),
      ...(params.event.plan !== undefined ? { plan: params.event.plan } : {}),
      ...(params.event.explanation
        ? { explanation: params.event.explanation }
        : {}),
      ...(params.event.sourceItemId
        ? { source_item_id: params.event.sourceItemId }
        : {}),
      ...(params.event.toolCallId
        ? { tool_call_id: params.event.toolCallId }
        : {}),
      ...(params.pendingItemKey ? { pending_item_key: params.pendingItemKey } : {}),
    },
  };
}
