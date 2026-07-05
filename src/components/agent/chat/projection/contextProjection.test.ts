import { describe, expect, it } from "vitest";
import { buildTurnContextEvents } from "./contextProjection";

const baseContext = {
  sequence: 20,
  timestamp: "2026-05-09T00:00:00.000Z",
  sessionId: "session-context",
  runId: "agent_turn_stream:session-context",
};

describe("contextProjection", () => {
  it("应把 turn_context 映射为 context 与 policy projection", () => {
    const events = buildTurnContextEvents(
      {
        type: "turn_context",
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        output_schema_runtime: {
          source: "turn",
          strategy: "native",
          providerName: "openai",
          modelName: "gpt-5.4",
        },
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        context_summary: {
          memory_budget: {
            used_tokens: 640,
            max_tokens: 1200,
            status: "ready",
            source: "knowledge_context_resolver",
          },
          missing_context: [
            {
              id: "knowledge_warning:0",
              kind: "knowledge_warning",
              label: "sources/missing.md",
              status: "unknown",
              reason: "缺少来源",
              source: "knowledge_context_resolver",
            },
          ],
          retrieval_refs: [
            {
              source_id: "knowledge_pack:brand:compiled/splits/brief.md",
              kind: "knowledge_pack",
              title: "brand:brief",
              path: "compiled/splits/brief.md",
              scope: "workspace",
              status: "ready",
              source: "knowledge_context_resolver",
            },
          ],
          team_memory_refs: [
            {
              key: "team.selection",
              repo_scope: "/repo/lime",
              updated_at: 1710000000,
              source: "team_memory_shadow",
            },
          ],
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "context.changed",
      sourceType: "turn_context",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      owner: "context",
      scope: "turn",
      phase: "preparing",
      surface: "runtime_status",
      payload: {
        outputSchemaAvailable: true,
        outputSchemaSource: "turn",
        outputSchemaStrategy: "native",
        providerName: "openai",
        modelName: "gpt-5.4",
        contextSummaryAvailable: true,
        memoryBudget: {
          used_tokens: 640,
          max_tokens: 1200,
          status: "ready",
          source: "knowledge_context_resolver",
        },
        retrievalRefs: [
          expect.objectContaining({
            source_id: "knowledge_pack:brand:compiled/splits/brief.md",
          }),
        ],
        teamMemoryRefs: [
          expect.objectContaining({
            key: "team.selection",
          }),
        ],
      },
      refs: {
        contextSourceIds: ["knowledge_pack:brand:compiled/splits/brief.md"],
        teamMemoryKeys: ["team.selection"],
      },
    });
    expect(events[1]).toMatchObject({
      type: "permission.changed",
      sourceType: "turn_context",
      owner: "policy",
      scope: "turn",
      phase: "preparing",
      payload: {
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        sourceEvent: "turn_context",
      },
    });
  });
});
