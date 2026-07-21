import { describe, expect, it } from "vitest";
import type { AgentThreadItem, Message } from "../types";
import {
  buildPlanImplementationHarnessMetadata,
  buildPlanImplementationRequestId,
  buildPlanImplementationSubmitPlan,
  hasProposedPlanImplementationSignals,
  readPlanImplementationConfirmationKeys,
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
  it("普通 Claw 完成态没有计划信号时应跳过本地计划实施扫描", () => {
    expect(
      hasProposedPlanImplementationSignals({
        messages: [
          createAssistantMessage(
            "assistant-news",
            "今天国际新闻主线包括中东局势、欧洲热浪和世界杯动态。",
          ),
        ],
        planState: {
          phase: "idle",
          items: [],
        },
        threadItems: [
          {
            id: "tool-item-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            started_at: "2026-06-18T08:00:00.000Z",
            updated_at: "2026-06-18T08:00:01.000Z",
            type: "tool_call",
            tool_name: "WebSearch",
            arguments: { query: "world news" },
          },
        ],
      }),
    ).toBe(false);
  });

  it("存在任一计划来源时应允许进入本地计划实施扫描", () => {
    expect(
      hasProposedPlanImplementationSignals({
        messages: [
          createAssistantMessage(
            "assistant-plan",
            "<proposed_plan>\n- 修复默认路径\n</proposed_plan>",
          ),
        ],
      }),
    ).toBe(true);
    expect(
      hasProposedPlanImplementationSignals({
        threadItems: [
          createPlanThreadItem({
            metadata: {
              revisionId: "proposed_plan:thread-1",
              source: "proposed_plan",
            },
          }),
        ],
      }),
    ).toBe(true);
    expect(
      hasProposedPlanImplementationSignals({
        planState: {
          phase: "ready",
          items: [{ content: "补计划实施确认", status: "completed" }],
          revisionId: "proposed_plan:state-1",
        },
      }),
    ).toBe(true);
  });

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

  it("较新消息与 current thread item 计划相同时应保留 canonical revision identity", () => {
    const planText = "- 核对历史恢复\n- 复测计划确认";
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-plan",
          `<proposed_plan>\n${planText}\n</proposed_plan>`,
          "2026-06-18T09:00:00.000Z",
        ),
      ],
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-canonical",
          turn_id: "turn-canonical",
          completed_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-18T08:00:00.000Z",
          text: planText,
          metadata: {
            revisionId: "proposed_plan:canonical",
            source: "thread_item",
          },
        }),
      ],
    });

    expect(decision).toMatchObject({
      planText,
      action: {
        arguments: {
          source: "thread_item",
          plan_revision_id: "proposed_plan:canonical",
          source_item_id: "plan-item-canonical",
          turn_id: "turn-canonical",
          plan_source: "thread_item",
        },
      },
    });
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:thread:turn-canonical:plan-item-canonical",
    );
  });

  it("较新消息与 current thread item 计划不同时应保留较新消息", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-new-plan",
          "<proposed_plan>\n- 执行新计划\n</proposed_plan>",
          "2026-06-18T09:00:00.000Z",
        ),
      ],
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-stale",
          completed_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-18T08:00:00.000Z",
          text: "- 执行旧计划",
          metadata: {
            revisionId: "proposed_plan:stale",
            source: "thread_item",
          },
        }),
      ],
    });

    expect(decision).toMatchObject({
      planText: "- 执行新计划",
      action: {
        arguments: {
          source: "message",
          source_item_id: "assistant-new-plan",
        },
      },
    });
    expect(decision?.action.arguments).not.toHaveProperty("plan_revision_id");
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:message:assistant-new-plan",
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

  it("缺少消息 plan tag 时应从 current thread plan item 兜底生成确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [createAssistantMessage("assistant-1", "计划已经整理完。")],
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-2",
          turn_id: "turn-2",
          sequence: 3,
          text: "- 读取 Codex 参考\n- 复刻确认抽屉",
          metadata: {
            revisionId: "proposed_plan:thread-2",
            source: "proposed_plan",
          },
        }),
      ],
    });

    expect(decision).toMatchObject({
      planText: "- 读取 Codex 参考\n- 复刻确认抽屉",
      action: {
        arguments: {
          source: "thread_item",
          plan_revision_id: "proposed_plan:thread-2",
          source_item_id: "plan-item-2",
          turn_id: "turn-2",
          plan_source: "proposed_plan",
        },
      },
    });
    expect(decision?.action.requestId).toContain(
      "local-plan-implementation:thread:turn-2:plan-item-2",
    );
  });

  it("legacy update_plan revision 不应生成本地计划实施确认", () => {
    expect(
      hasProposedPlanImplementationSignals({
        threadItems: [
          createPlanThreadItem({
            metadata: {
              revisionId: "update_plan:tool-2",
              source: "update_plan",
            },
          }),
        ],
      }),
    ).toBe(false);

    const decision = selectProposedPlanImplementationDecision({
      messages: [createAssistantMessage("assistant-1", "计划已经整理完。")],
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-legacy-update-plan",
          turn_id: "turn-legacy",
          sequence: 3,
          text: "- 读取 Codex 参考\n- 复刻确认抽屉",
          metadata: {
            revisionId: "update_plan:tool-2",
            source: "update_plan",
            tool_call_id: "tool-2",
          },
        }),
      ],
      planState: {
        phase: "ready",
        items: [{ content: "旧 update_plan 状态", status: "completed" }],
        sourceToolCallId: "plan:update_plan:tool-2",
        revisionId: "update_plan:tool-2",
        turnId: "turn-legacy",
        source: "update_plan",
      },
    });

    expect(decision).toBeNull();
  });

  it("无 revision 的历史 plan item 不应生成本地计划实施确认", () => {
    expect(
      hasProposedPlanImplementationSignals({
        threadItems: [createPlanThreadItem()],
      }),
    ).toBe(false);
    expect(
      selectProposedPlanImplementationDecision({
        messages: [createAssistantMessage("assistant-1", "计划已经整理完。")],
        threadItems: [createPlanThreadItem()],
      }),
    ).toBeNull();
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
    ).toMatchObject({
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
        plan_confirmation_key: expect.stringContaining(
          "plan-revision:proposed_plan:3:",
        ),
      },
    });
  });

  it("接受本地计划时应构造普通发送计划而不是 approval response", () => {
    const plan = buildPlanImplementationSubmitPlan({
      acceptedLabel: "是，实施此计划",
      effectiveChatToolPreferences: { task: true, subagent: false },
      requestArguments: {
        proposed_plan: "- 核对计划\n- 复测 E2E",
        plan_revision_id: "proposed_plan:3",
        source_item_id: "plan:proposed_plan:3",
        turn_id: "turn-3",
        plan_source: "tool",
      },
      response: {
        requestId: "local-plan-implementation:1",
        confirmed: true,
        response: JSON.stringify({ answer: "是，实施此计划" }),
        actionType: "ask_user",
        userData: { answer: "是，实施此计划" },
      },
    });

    expect(plan).toMatchObject({
      kind: "send",
      decision: "accepted",
      requestId: "local-plan-implementation:1",
      confirmationKeys: expect.arrayContaining([
        expect.stringContaining("plan-revision:proposed_plan:3:"),
        expect.stringContaining("plan-text:"),
      ]),
      textOverride: "Implement the plan.",
      sendOptions: {
        skipSceneCommandRouting: true,
        toolPreferencesOverride: {
          task: false,
          subagent: false,
        },
        requestMetadata: {
          harness: {
            plan_implementation_decision: {
              decision: "accepted",
              request_id: "local-plan-implementation:1",
              plan_revision_id: "proposed_plan:3",
            },
          },
        },
      },
    });
    expect(JSON.stringify(plan)).not.toContain("agentSession/action/respond");
    expect(JSON.stringify(plan)).not.toContain('"decision":"allow_once"');
    expect(JSON.stringify(plan)).not.toContain('"decision":"decline"');
  });

  it("调整本地计划时应保持 Plan mode 继续 steer 而不是 approval response", () => {
    const plan = buildPlanImplementationSubmitPlan({
      acceptedLabel: "是，实施此计划",
      effectiveChatToolPreferences: { task: false, subagent: false },
      requestArguments: {
        proposed_plan: "- 先改 UI\n- 再跑测试",
        source: "message",
      },
      response: {
        requestId: "local-plan-implementation:adjust",
        confirmed: true,
        response: JSON.stringify({ answer: "先补 Electron CDP Gate B" }),
        actionType: "ask_user",
        userData: { answer: "先补 Electron CDP Gate B" },
      },
    });

    expect(plan).toMatchObject({
      kind: "send",
      decision: "adjustment",
      requestId: "local-plan-implementation:adjust",
      textOverride: "先补 Electron CDP Gate B",
      sendOptions: {
        collaborationMode: "plan",
        skipSceneCommandRouting: true,
        toolPreferencesOverride: {
          task: true,
          subagent: false,
        },
        requestMetadata: {
          harness: {
            plan_implementation_decision: {
              decision: "adjustment",
              request_id: "local-plan-implementation:adjust",
            },
          },
        },
      },
    });
    expect(JSON.stringify(plan)).not.toContain("agentSession/action/respond");
    expect(JSON.stringify(plan)).not.toContain('"decision":"allow_once"');
    expect(JSON.stringify(plan)).not.toContain('"decision":"cancel"');
  });

  it("只有计划摘要文本时不应生成实施确认", () => {
    const decision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-1",
          "失败turn/start failed: App Server runtime backend requires provider/model selection.",
        ),
      ],
      planState: {
        phase: "ready",
        items: [],
        summaryText:
          "失败turn/start failed: App Server runtime backend requires provider/model selection.",
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

  it("已确认的相同计划从消息同步为 thread item 后不应再次打断", () => {
    const planText = "- 修复抽屉\n- 跑 GUI fixture";
    const firstDecision = selectProposedPlanImplementationDecision({
      messages: [
        createAssistantMessage(
          "assistant-1",
          `<proposed_plan>\n${planText}\n</proposed_plan>`,
        ),
      ],
    });
    const submittedConfirmationKeys = readPlanImplementationConfirmationKeys(
      firstDecision?.action.arguments,
    );

    expect(submittedConfirmationKeys).toEqual(
      expect.arrayContaining([expect.stringContaining("plan-text:")]),
    );
    expect(
      selectProposedPlanImplementationDecision({
        messages: [createAssistantMessage("assistant-sync", "计划已同步。")],
        submittedConfirmationKeys: new Set(submittedConfirmationKeys),
        threadItems: [
          createPlanThreadItem({
            id: "plan-item-synced",
            text: planText,
            metadata: {
              revisionId: "proposed_plan:synced",
              source: "proposed_plan",
            },
          }),
        ],
      }),
    ).toBeNull();
  });

  it("同一 revision 内容变化时仍应重新进入 Plan 确认", () => {
    const oldPlanText = "- 修复抽屉\n- 跑 GUI fixture";
    const oldConfirmationKeys = readPlanImplementationConfirmationKeys({
      proposed_plan: oldPlanText,
      plan_revision_id: "proposed_plan:shared",
    });

    const decision = selectProposedPlanImplementationDecision({
      submittedConfirmationKeys: new Set(oldConfirmationKeys),
      threadItems: [
        createPlanThreadItem({
          id: "plan-item-revised",
          text: "- 修复抽屉\n- 增加 Electron CDP Gate B",
          metadata: {
            revisionId: "proposed_plan:shared",
            source: "proposed_plan",
          },
        }),
      ],
    });

    expect(decision).not.toBeNull();
    expect(decision?.planText).toContain("Electron CDP Gate B");
  });
});
