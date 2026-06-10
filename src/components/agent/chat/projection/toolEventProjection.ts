import type {
  AgentEventToolEnd,
  AgentEventToolInputDelta,
  AgentEventToolOutputDelta,
  AgentEventToolProgress,
  AgentEventToolStart,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiToolEndEvents,
  buildAgentUiToolInputDeltaEvent,
  buildAgentUiToolOutputDeltaEvent,
  buildAgentUiToolProgressEvent,
  buildAgentUiToolStartEvents,
} from "@limecloud/agent-runtime-projection";

export function buildToolStartEvents(
  event: AgentEventToolStart,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiToolStartEvents(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      toolName: event.tool_name,
      input: event.arguments,
    },
    context,
  );
}

export function buildToolEndEvents(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiToolEndEvents(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      result: event.result,
    },
    context,
  );
}

export function buildToolProgressEvent(
  event: AgentEventToolProgress,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolProgressEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      progress: event.progress,
    },
    context,
  );
}

export function buildToolOutputDeltaEvent(
  event: AgentEventToolOutputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolOutputDeltaEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      delta: event.delta,
      outputKind: event.output_kind,
      metadata: event.metadata,
    },
    context,
  );
}

export function buildToolInputDeltaEvent(
  event: AgentEventToolInputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolInputDeltaEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      toolName: event.tool_name,
      delta: event.delta,
      accumulatedInput: event.accumulated_arguments,
      provider: event.provider,
    },
    context,
  );
}
