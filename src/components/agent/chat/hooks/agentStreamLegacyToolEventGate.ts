import type { AgentEvent, AgentThreadItem } from "@/lib/api/agentProtocol";

export type AgentStreamLegacyToolEvent = Extract<
  AgentEvent,
  {
    type:
      | "tool_start"
      | "tool_input_delta"
      | "tool_progress"
      | "tool_output_delta"
      | "tool_end";
  }
>;

function resolveToolLegacyEventTurnId(
  event: AgentStreamLegacyToolEvent,
  fallbackTurnId: string | null | undefined,
): string {
  return event.turn_id?.trim() || fallbackTurnId?.trim() || "";
}

function findThreadItemForLegacyToolEvent(params: {
  event: AgentStreamLegacyToolEvent;
  fallbackTurnId: string | null | undefined;
  items: readonly AgentThreadItem[];
}): AgentThreadItem | undefined {
  const turnId = resolveToolLegacyEventTurnId(
    params.event,
    params.fallbackTurnId,
  );
  return params.items.find((item) => {
    if (item.type !== "tool_call" || item.id !== params.event.tool_id) {
      return false;
    }
    if (!turnId) {
      return true;
    }
    return item.turn_id === turnId;
  });
}

function isItemLifecycleToolItem(item: AgentThreadItem | undefined): boolean {
  if (!item || item.type !== "tool_call") {
    return false;
  }
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : null;
  if (metadata?.source === "item_lifecycle") {
    return true;
  }
  return (
    metadata?.source !== "legacy_tool_event" &&
    metadata?.runtime_event_source !== "legacy_tool_event"
  );
}

export function shouldLetLegacyToolEventUpdateMessageLayer(params: {
  event: AgentStreamLegacyToolEvent;
  fallbackTurnId: string | null | undefined;
  items: readonly AgentThreadItem[];
}): boolean {
  const item = findThreadItemForLegacyToolEvent({
    event: params.event,
    fallbackTurnId: params.fallbackTurnId,
    items: params.items,
  });
  return !isItemLifecycleToolItem(item);
}
