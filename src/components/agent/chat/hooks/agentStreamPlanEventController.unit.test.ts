import { describe, expect, it } from "vitest";
import type {
  AgentEventEnvelope,
  AgentEventPlanFinal,
} from "@/lib/api/agentProtocol";

import { buildAgentStreamPlanThreadItem } from "./agentStreamPlanEventController";

describe("agentStreamPlanEventController", () => {
  it("应把 plan.final live event 转成可恢复的 plan thread item", () => {
    const item = buildAgentStreamPlanThreadItem({
      activeSessionId: "session-1",
      fallbackTurnId: "turn-fallback",
      now: "2026-06-23T10:00:00.000Z",
      pendingItemKey: "pending-item",
      sequence: 7,
      event: {
        type: "plan_final",
        text: "- [x] 读现状\n- [ ] 打通主链",
        revisionId: "update_plan:tool-plan",
        toolCallId: "tool-plan",
        source: "update_plan",
        thread_id: "thread-1",
        turn_id: "turn-1",
        timestamp: "2026-06-23T09:59:59.000Z",
        plan: [{ step: "打通主链", status: "in_progress" }],
      } satisfies AgentEventPlanFinal & AgentEventEnvelope,
    });

    expect(item).toEqual({
      id: "plan:update_plan:tool-plan",
      thread_id: "thread-1",
      turn_id: "turn-1",
      sequence: 7,
      status: "completed",
      started_at: "2026-06-23T09:59:59.000Z",
      completed_at: "2026-06-23T10:00:00.000Z",
      updated_at: "2026-06-23T10:00:00.000Z",
      type: "plan",
      text: "- [x] 读现状\n- [ ] 打通主链",
      metadata: {
        revisionId: "update_plan:tool-plan",
        source: "update_plan",
        plan: [{ step: "打通主链", status: "in_progress" }],
        tool_call_id: "tool-plan",
        pending_item_key: "pending-item",
      },
    });
  });
});
