import type {
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
