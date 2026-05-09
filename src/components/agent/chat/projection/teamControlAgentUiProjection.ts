import {
  buildAgentUiTeamControlProjectionEvents,
  type AgentUiProjectionContext,
  type AgentUiProjectionEvent,
  type AgentUiTeamControlProjectionInput,
} from "./agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "./conversationProjectionStore";

export function recordTeamControlAgentUiProjection(
  input: AgentUiTeamControlProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return recordAgentUiProjectionEvents(
    buildAgentUiTeamControlProjectionEvents(input, context),
  );
}
