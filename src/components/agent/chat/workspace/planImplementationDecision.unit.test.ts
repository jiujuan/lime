import { describe, expect, it } from "vitest";
import type { AgentThreadItem, Message } from "../types";
import {
  buildPlanImplementationHarnessMetadata,
  buildPlanImplementationRequestId,
  selectProposedPlanImplementationDecision,
} from "./planImplementationDecision";

function createAssistantMessage(
  id: string,
  content: string,
  timestamp = "2026-06-18T08:00:00.000Z",
): Message {
  return {
    id,
    role: "assistant",
    content,
    timestamp: new Date(timestamp),
  };
}

function createPlanThreadItem(
  overrides: Partial<Extract<AgentThreadItem, { type: "plan" }>> = {},
): Extract<AgentThreadItem, { type: "plan" }> {
  return {
    id: "plan-item-1",
    thread_id: "session-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-06-18T08:00:00.000Z",
    completed_at: "2026-06-18T08:00:01.000Z",
    updated_at: "2026-06-18T08:00:01.000Z",
    type: "plan",
    text: "- 核对计划\n- 复测 E2E",
    ...overrides,
  };
}

describe("planImplementationDecision", () => {
  it("应从最新完整 proposed_plan 消息生成本地计划实施确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-old",
          "<proposed_plan>\n- 旧计划\n</proposed_plan>",
          "2026-06-18T07:00:00.000Z",
        ),
        createAssistantMessage(
          "assistant-new",
          "说明\n<proposed_plan>\n- 修复抽屉\n- 跑 GUI fixture\n</proposed_plan>",
          "2026-06-18T08:00:00.000Z",
        ),
      ],
    });

    expect(decision).toMatchObject({
      planText: "- 修复抽屉\n- 跑 GUI fixture",
      action: {
        actionType: "ask_user",
        status: "pending",
        arguments: {
          proposed_plan: "- 修复抽屉\n- 跑 GUI fixture",
          plan_approval_request: true,
          source: "message",
        },
      },
    });
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:message:assistant-new",
    );
  });

  it("未闭合的流式计划不应触发实施确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-streaming",
          "<proposed_plan>\n- 还在输出",
        ),
      ],
    });

    expect(decision).toBeNull();
  });

  it("缺少消息 plan tag 时应从已完成 thread plan item 兜底生成确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [createAssistantMessage("assistant-1", "计划已经整理完。")],
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-2",
          turn_id: "turn-2",
          sequence: 3,
          text: "- 读取 Codex 参考\n- 复刻确认抽屉",
          metadata: {
            revisionId: "update_plan:tool-2",
          },
        }),
      ],
    });

    expect(decision).toMatchObject({
      planText: "- 读取 Codex 参考\n- 复刻确认抽屉",
      action: {
        arguments: {
          source: "thread_item",
          plan_revision_id: "update_plan:tool-2",
          source_item_id: "plan-item-2",
          turn_id: "turn-2",
          plan_source: "thread_item",
        },
      },
    });
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:thread:turn-2:plan-item-2",
    );
  });

  it("计划轨已就绪但消息不含 proposed_plan 时也应生成确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [createAssistantMessage("assistant-1", "计划已经写入。")],
      planState: {
        phase: "ready",
        items: [
          {
            id: "plan-step-1",
            content: "复刻底部确认抽屉",
            status: "completed",
          },
          {
            id: "plan-step-2",
            content: "补真实 fixture smoke",
            status: "in_progress",
          },
        ],
        sourceToolCallId: "plan-tool-1",
        revisionId: "proposed_plan:2",
        turnId: "turn-plan-2",
        source: "tool",
      },
    });

    expect(decision).toMatchObject({
      planText: "- 复刻底部确认抽屉\n- 补真实 fixture smoke",
      action: {
        arguments: {
          source: "plan_state",
          proposed_plan: "- 复刻底部确认抽屉\n- 补真实 fixture smoke",
          plan_approval_request: true,
          plan_revision_id: "proposed_plan:2",
          source_item_id: "plan-tool-1",
          turn_id: "turn-plan-2",
          plan_source: "tool",
        },
      },
    });
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:plan-state:proposed_plan:2:2:",
    );
  });

  it("应把实施确认绑定到 latest plan revision metadata", () => {
    expect(
      buildPlanImplementationHarnessMetadata({
        requestId: "local-plan-implementation:1",
        decision: "accepted",
        requestArguments: {
          proposed_plan: "- 核对计划\n- 复测 E2E",
          source: "plan_state",
          plan_revision_id: "proposed_plan:3",
          source_item_id: "plan:proposed_plan:3",
          turn_id: "turn-3",
          plan_source: "tool",
        },
      }),
    ).toEqual({
      latest_plan_revision: {
        revision_id: "proposed_plan:3",
        source_item_id: "plan:proposed_plan:3",
        turn_id: "turn-3",
        source: "tool",
      },
      plan_implementation_decision: {
        request_id: "local-plan-implementation:1",
        decision: "accepted",
        plan_revision_id: "proposed_plan:3",
        source_item_id: "plan:proposed_plan:3",
        turn_id: "turn-3",
        source: "tool",
        proposed_plan: "- 核对计划\n- 复测 E2E",
      },
    });
  });

  it("只有计划摘要文本时不应生成实施确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-1",
          "失败agentSession/turn/start failed: App Server runtime backend requires provider/model selection.",
        ),
      ],
      planState: {
        phase: "ready",
        items: [],
        summaryText:
          "失败agentSession/turn/start failed: App Server runtime backend requires provider/model selection.",
      },
    });

    expect(decision).toBeNull();
  });

  it("已忽略或已提交的本地计划确认不应再次出现", () => {
    const planText = "- 修复抽屉\n- 跑 GUI fixture";
    const requestId = buildPlanImplementationRequestId(
      "message:assistant-1:0:0:placeholder",
      planText,
    );
    const firstDecision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-1",
          `<proposed_plan>\n${planText}\n</proposed_plan>`,
        ),
      ],
    });

    expect(firstDecision?.action.requestId).not.toBe(requestId);
    expect(
      selectProposedPlanImplementationDecision({
        messages: [
          createAssistantMessage(
            "assistant-1",
            `<proposed_plan>\n${planText}\n</proposed_plan>`,
          ),
        ],
        dismissedRequestIds: new Set(
          firstDecision ? [firstDecision.action.requestId] : [],
        ),
      }),
    ).toBeNull();
    expect(
      selectProposedPlanImplementationDecision({
        messages: [
          createAssistantMessage(
            "assistant-1",
            `<proposed_plan>\n${planText}\n</proposed_plan>`,
          ),
        ],
        submittedRequestIds: new Set(
          firstDecision ? [firstDecision.action.requestId] : [],
        ),
      }),
    ).toBeNull();
  });
});
