import type { AgentEvent } from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiProjectionBase as buildStandardAgentUiProjectionBase,
  sequenceAgentUiProjectionEvents,
} from "@limecloud/agent-runtime-projection";

export type { AgentUiProjectionBase } from "@limecloud/agent-runtime-projection";

type AgentProjectionSource = Pick<AgentEvent, "type"> & {
  item?: {
    type?: unknown;
  };
};

export function buildAgentUiProjectionBase(
  event: AgentProjectionSource,
  context: AgentUiProjectionContext,
): ReturnType<typeof buildStandardAgentUiProjectionBase> {
  const itemType =
    typeof event.item?.type === "string" ? event.item.type : undefined;
  return buildStandardAgentUiProjectionBase(
    {
      sourceType: event.type,
      itemType,
    },
    context,
  );
}

export function sequenceProjectionEvents(
  events: AgentUiProjectionEvent[],
  startSequence: number | undefined,
): AgentUiProjectionEvent[] {
  return sequenceAgentUiProjectionEvents(events, startSequence);
}
