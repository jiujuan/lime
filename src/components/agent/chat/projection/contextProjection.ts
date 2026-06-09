import type { AgentEventTurnContext } from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

export function buildTurnContextEvents(
  event: AgentEventTurnContext,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const contextSummary = event.context_summary ?? null;
  const events: AgentUiProjectionEvent[] = [
    {
      ...base,
      type: "context.changed",
      sessionId: event.session_id,
      threadId: event.thread_id,
      turnId: event.turn_id,
      owner: "context",
      scope: "turn",
      phase: "preparing",
      surface: "runtime_status",
      persistence: "snapshot",
      payload: {
        outputSchemaAvailable: Boolean(event.output_schema_runtime),
        outputSchemaSource: event.output_schema_runtime?.source,
        outputSchemaStrategy: event.output_schema_runtime?.strategy,
        providerName: event.output_schema_runtime?.providerName,
        modelName: event.output_schema_runtime?.modelName,
        contextSummaryAvailable: Boolean(contextSummary),
        memoryBudget: contextSummary?.memory_budget ?? null,
        missingContext: contextSummary?.missing_context ?? [],
        retrievalRefs: contextSummary?.retrieval_refs ?? [],
        teamMemoryRefs: contextSummary?.team_memory_refs ?? [],
      },
      refs: {
        contextSourceIds: (contextSummary?.retrieval_refs ?? []).map(
          (ref) => ref.source_id,
        ),
        teamMemoryKeys: (contextSummary?.team_memory_refs ?? []).map(
          (ref) => ref.key,
        ),
      },
    },
  ];

  if (event.approval_policy || event.sandbox_policy) {
    events.push({
      ...base,
      type: "permission.changed",
      sessionId: event.session_id,
      threadId: event.thread_id,
      turnId: event.turn_id,
      owner: "policy",
      scope: "turn",
      phase: "preparing",
      surface: "runtime_status",
      persistence: "snapshot",
      payload: {
        approvalPolicy: event.approval_policy ?? null,
        sandboxPolicy: event.sandbox_policy ?? null,
        sourceEvent: "turn_context",
      },
    });
  }

  return events;
}
