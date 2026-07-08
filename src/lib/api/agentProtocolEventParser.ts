import type { AgentEvent } from "./agentProtocolEventTypes";
import { parseAgentContentEvent } from "./agentProtocolContentParsers";
import { parseAgentRuntimeEvent } from "./agentProtocolRuntimeParsers";
import { parseAgentToolEvent } from "./agentProtocolToolParsers";
import { withAgentEventEnvelope } from "./agentProtocolParserUtils";

export function parseAgentEvent(data: unknown): AgentEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const event = data as Record<string, unknown>;
  const type = event.type as string;
  const parsedEvent =
    parseAgentContentEvent(type, event) ??
    parseAgentToolEvent(type, event) ??
    parseAgentRuntimeEvent(type, event);

  return parsedEvent ? withAgentEventEnvelope(event, parsedEvent) : null;
}
