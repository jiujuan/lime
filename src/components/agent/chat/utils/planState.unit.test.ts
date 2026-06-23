import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentThreadItem } from "@/lib/api/agentProtocol";

import {
  buildPlanStateFromLivePayload,
  buildPlanStateFromThreadItems,
  hydrateAgentPlanState,
} from "./planState";

describe("planState", () => {
  it("应从最新 plan thread item 建立 ready 状态", () => {
    const items: AgentThreadItem[] = [
      {
        id: "plan-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_at: "2026-06-23T00:00:01.000Z",
        updated_at: "2026-06-23T00:00:01.000Z",
        type: "plan",
        text: "- 调研现状\n- 搭骨架",
        metadata: { revisionId: "rev-1" },
      },
    ];

    expect(buildPlanStateFromThreadItems(items)).toEqual({
      phase: "ready",
      text: "- 调研现状\n- 搭骨架",
      steps: [
        { text: "调研现状", status: "in_progress" },
        { text: "搭骨架", status: "pending" },
      ],
      source: "thread_item",
      itemId: "plan-1",
      revisionId: "rev-1",
      turnId: "turn-1",
    });
  });

  it("应从 plan.delta payload 建立 planning 状态", () => {
    expect(
      buildPlanStateFromLivePayload(
        {
          text: "- 先整理骨架",
          revision_id: "rev-live",
          turn_id: "turn-live",
        },
        "plan.delta",
      ),
    ).toMatchObject({
      phase: "planning",
      revisionId: "rev-live",
      turnId: "turn-live",
      steps: [{ text: "先整理骨架", status: "in_progress" }],
    });
  });

  it("无 revision 的历史 plan thread item 不应进入标准 PlanState", () => {
    const items: AgentThreadItem[] = [
      {
        id: "plan-history",
        thread_id: "thread-1",
        turn_id: "turn-history",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_at: "2026-06-23T00:00:01.000Z",
        updated_at: "2026-06-23T00:00:01.000Z",
        type: "plan",
        text: "- 旧计划",
      },
    ];

    expect(buildPlanStateFromThreadItems(items)).toEqual({
      phase: "idle",
      text: "",
      steps: [],
    });
  });

  it("应优先使用 update_plan 的结构化 plan 状态", () => {
    expect(
      buildPlanStateFromLivePayload(
        {
          text: "- [x] 读现状\n- [ ] 打通主链",
          source: "update_plan",
          toolCallId: "tool-plan",
          plan: [
            { step: "读现状", status: "completed" },
            { step: "打通主链", status: "in_progress" },
          ],
        },
        "plan.final",
      ),
    ).toMatchObject({
      phase: "ready",
      source: "tool",
      steps: [
        { text: "读现状", status: "completed" },
        { text: "打通主链", status: "in_progress" },
      ],
    });
  });

  it("应让 live plan event 覆盖无 revision 的历史 plan", () => {
    const threadItems: AgentThreadItem[] = [
      {
        id: "plan-history",
        thread_id: "thread-1",
        turn_id: "turn-history",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_at: "2026-06-23T00:00:01.000Z",
        updated_at: "2026-06-23T00:00:01.000Z",
        type: "plan",
        text: "- 旧计划",
      },
    ];

    expect(
      hydrateAgentPlanState({
        threadItems,
        events: [
          {
            type: "plan_delta",
            text: "- 新计划第一步",
            revisionId: "proposed_plan:2",
            turn_id: "turn-live",
          },
        ],
      }),
    ).toMatchObject({
      phase: "planning",
      text: "- 新计划第一步",
      source: "live_event",
      revisionId: "proposed_plan:2",
      turnId: "turn-live",
    });
  });

  it("PlanState 只消费 plan facts，不从 model/reasoning 事件恢复计划", () => {
    const events: AgentEvent[] = [
      {
        type: "model_effective",
        provider: "anthropic",
        modelName: "claude-sonnet-4-5",
        reasoning: {
          supported: true,
          requestedLevel: "high",
          effectiveLevel: "high",
        },
      },
      {
        type: "reasoning_delta",
        reasoningId: "runtime-thinking",
        text: "- 这不是计划，只是思考过程",
      },
    ];

    expect(hydrateAgentPlanState({ events })).toEqual({
      phase: "idle",
      text: "",
      steps: [],
    });

    expect(
      hydrateAgentPlanState({
        events: [
          ...events,
          {
            type: "plan_final",
            text: "- [ ] 读取多模型 fixture\n- [ ] 验证降级",
            plan: [
              { step: "读取多模型 fixture", status: "pending" },
              { step: "验证降级", status: "pending" },
            ],
            revisionId: "plan:p4",
            source: "proposed_plan",
          },
        ],
      }),
    ).toMatchObject({
      phase: "ready",
      text: "- [ ] 读取多模型 fixture\n- [ ] 验证降级",
      steps: [
        { text: "读取多模型 fixture", status: "pending" },
        { text: "验证降级", status: "pending" },
      ],
      source: "live_event",
      revisionId: "plan:p4",
    });
  });

  it("历史 reasoning provider metadata 不应污染 PlanState", () => {
    const reasoningItem: AgentThreadItem = {
      id: "reasoning-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      sequence: 1,
      status: "completed",
      started_at: "2026-06-23T00:00:00.000Z",
      completed_at: "2026-06-23T00:00:01.000Z",
      updated_at: "2026-06-23T00:00:01.000Z",
      type: "reasoning",
      text: "- 这不是计划，只是模型思考过程",
      metadata: {
        provider_metadata: {
          backend: "codex",
          signature: "thinking-signature",
        },
      },
    };

    expect(hydrateAgentPlanState({ threadItems: [reasoningItem] })).toEqual({
      phase: "idle",
      text: "",
      steps: [],
    });

    expect(
      hydrateAgentPlanState({
        threadItems: [
          reasoningItem,
          {
            id: "plan-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 2,
            status: "completed",
            started_at: "2026-06-23T00:00:02.000Z",
            completed_at: "2026-06-23T00:00:03.000Z",
            updated_at: "2026-06-23T00:00:03.000Z",
            type: "plan",
            text: "- [ ] 读取 current fixture\n- [ ] 验证 PlanRail 隔离",
            metadata: {
              revisionId: "plan:fixture",
              plan: [
                { step: "读取 current fixture", status: "pending" },
                { step: "验证 PlanRail 隔离", status: "pending" },
              ],
            },
          },
        ],
      }),
    ).toMatchObject({
      phase: "ready",
      source: "thread_item",
      revisionId: "plan:fixture",
      steps: [
        { text: "读取 current fixture", status: "pending" },
        { text: "验证 PlanRail 隔离", status: "pending" },
      ],
    });
  });
});
