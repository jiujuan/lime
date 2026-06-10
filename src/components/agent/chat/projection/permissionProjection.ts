import type { AgentEventRuntimeStatus } from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { buildAgentUiRuntimePermissionChangedEvent } from "@limecloud/agent-runtime-projection";

export function buildPermissionChangedEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  return buildAgentUiRuntimePermissionChangedEvent(
    {
      sourceType: event.type,
      phase: event.status.phase,
      metadata: event.status.metadata,
    },
    context,
  );
}
