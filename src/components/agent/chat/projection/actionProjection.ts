import type {
  AgentEvent,
  AgentEventActionRequired,
  AgentEventActionResolved,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiActionRequiredEvent,
  buildAgentUiActionResolvedEvent,
} from "@limecloud/agent-runtime-projection";

type ActionProjectionEvent = Extract<
  AgentEvent,
  { type: "action_required" | "action_resolved" }
>;

export function buildActionProjectionEvents(
  event: ActionProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  switch (event.type) {
    case "action_required":
      return [buildActionRequiredEvent(event, context)];
    case "action_resolved":
      return [buildActionResolvedEvent(event, context)];
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function buildActionRequiredEvent(
  event: AgentEventActionRequired,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiActionRequiredEvent(
    {
      sourceType: event.type,
      requestId: event.request_id,
      actionType: event.action_type,
      scope: {
        sessionId: event.scope?.session_id,
        threadId: event.scope?.thread_id,
        turnId: event.scope?.turn_id,
      },
      toolName: event.tool_name,
      prompt: event.prompt,
      questions: event.questions,
      requestedSchema: event.requested_schema,
    },
    context,
  );
}

export function buildActionResolvedEvent(
  event: AgentEventActionResolved,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiActionResolvedEvent(
    {
      sourceType: event.type,
      requestId: event.request_id,
      actionType: event.action_type,
      scope: {
        sessionId: event.scope?.session_id,
        threadId: event.scope?.thread_id,
        turnId: event.scope?.turn_id,
      },
      approved: event.approved,
      feedback: event.feedback,
      permissionMode: event.permission_mode,
      data: event.data,
    },
    context,
  );
}
