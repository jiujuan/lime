import type {
  AgentEventTurnContext,
  AgentTurnContextSummary,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiTurnContextEvents,
  type AgentUiTurnContextSummaryInput,
} from "@limecloud/agent-runtime-projection";

function buildTurnContextSummaryInput(
  summary: AgentTurnContextSummary | null | undefined,
): AgentUiTurnContextSummaryInput | null | undefined {
  if (!summary) {
    return summary;
  }

  return {
    memory_budget: summary.memory_budget,
    missing_context: summary.missing_context,
    retrieval_refs: summary.retrieval_refs?.map((ref) => ({ ...ref })),
    team_memory_refs: summary.team_memory_refs?.map((ref) => ({ ...ref })),
  };
}

export function buildTurnContextEvents(
  event: AgentEventTurnContext,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiTurnContextEvents(
    {
      sessionId: event.session_id,
      threadId: event.thread_id,
      turnId: event.turn_id,
      sourceType: event.type,
      outputSchemaRuntime: event.output_schema_runtime,
      contextSummary: buildTurnContextSummaryInput(event.context_summary),
      approvalPolicy: event.approval_policy,
      sandboxPolicy: event.sandbox_policy,
    },
    context,
  );
}
