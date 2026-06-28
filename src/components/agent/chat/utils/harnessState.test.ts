import { describe, expect, it } from "vitest";
import type { ActionRequired, AgentThreadItem, Message } from "../types";
import {
  deriveHarnessSessionShellState,
  deriveHarnessSessionState,
} from "./harnessState";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    role: "assistant",
    content: "hello",
    timestamp: new Date("2026-03-13T12:00:00.000Z"),
    ...overrides,
  };
}

describe("deriveHarnessSessionState", () => {
  it("轻量 shell state 不构建工具输出和文件活动详情", () => {
    const messages = [
      createMessage({
        runtimeStatus: {
          phase: "routing",
          title: "正在处理",
          detail: "工具调用进行中",
          checkpoints: ["已进入运行时"],
        },
        contextTrace: [{ stage: "routing", detail: "命中 coding slot" }],
      }),
    ];
    const pendingApprovals: ActionRequired[] = [
      {
        requestId: "approval-shell",
        actionType: "tool_confirmation",
        prompt: "确认执行",
        status: "pending",
      },
    ];

    const shellState = deriveHarnessSessionShellState(
      messages,
      pendingApprovals,
      [{ id: "todo-1", content: "保留计划摘要", status: "in_progress" }],
    );

    expect(shellState.runtimeStatus?.title).toBe("正在处理");
    expect(shellState.pendingApprovals).toBe(pendingApprovals);
    expect(shellState.latestContextTrace).toHaveLength(1);
    expect(shellState.plan.items).toEqual([
      {
        id: "todo-1",
        content: "保留计划摘要",
        status: "in_progress",
      },
    ]);
    expect(shellState.hasSignals).toBe(true);
    expect("outputSignals" in shellState).toBe(false);
    expect("recentFileEvents" in shellState).toBe(false);
    expect("activity" in shellState).toBe(false);
  });

  it("轻量 shell state 不从普通 assistant 正文推断 Harness 信号", () => {
    const shellState = deriveHarnessSessionShellState(
      [
        createMessage({
          content: "这是一段普通回答，不应让 Harness 面板进入活动态。",
        }),
      ],
      [],
    );

    expect(shellState.plan).toEqual({
      phase: "idle",
      items: [],
    });
    expect(shellState.hasSignals).toBe(false);
  });

  it("无 revision 的历史 plan 不应再驱动运行时计划", () => {
    const messages = [
      createMessage({
        runtimeStatus: {
          phase: "preparing",
          title: "正在准备处理",
          detail: "正在理解请求并准备当前阶段。",
          checkpoints: ["对话优先执行"],
        },
        contextTrace: [{ stage: "memory", detail: "已注入上下文" }],
      }),
    ];
    const items: AgentThreadItem[] = [
      {
        id: "plan-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "in_progress",
        started_at: "2026-03-13T12:00:00.000Z",
        updated_at: "2026-03-13T12:00:01.000Z",
        type: "plan",
        text: "1. 收集资料\n2. 输出方案",
      },
      {
        id: "approval-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 2,
        status: "in_progress",
        started_at: "2026-03-13T12:00:02.000Z",
        updated_at: "2026-03-13T12:00:02.000Z",
        type: "approval_request",
        request_id: "approval-1",
        action_type: "tool_confirmation",
        prompt: "确认写入文件",
        tool_name: "write_file",
      },
      {
        id: "artifact-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 3,
        status: "completed",
        started_at: "2026-03-13T12:00:03.000Z",
        completed_at: "2026-03-13T12:00:04.000Z",
        updated_at: "2026-03-13T12:00:04.000Z",
        type: "file_artifact",
        path: "workspace/plan.md",
        source: "tool_result",
        content: "# 计划\n正文",
      },
    ];

    const state = deriveHarnessSessionState(messages, [], items);

    expect(state.plan.phase).toBe("idle");
    expect(state.runtimeStatus?.title).toBe("正在准备处理");
    expect(state.plan.items).toHaveLength(0);
    expect(state.plan.sourceToolCallId).toBeUndefined();
    expect(state.plan.revisionId).toBeUndefined();
    expect(state.pendingApprovals).toHaveLength(1);
    expect(state.pendingApprovals[0]?.requestId).toBe("approval-1");
    expect(state.recentFileEvents[0]?.path).toBe("workspace/plan.md");
    expect(state.outputSignals[0]?.artifactPath).toBe("workspace/plan.md");
    expect(state.latestContextTrace).toHaveLength(1);
  });

  it("应通过标准 PlanState 从带 revision 的 plan item 恢复运行时计划", () => {
    const messages = [createMessage()];
    const items: AgentThreadItem[] = [
      {
        id: "legacy-plan-step",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-03-13T12:00:00.000Z",
        completed_at: "2026-03-13T12:00:01.000Z",
        updated_at: "2026-03-13T12:00:01.000Z",
        type: "plan",
        text: "旧单步计划",
      },
      {
        id: "standard-plan",
        thread_id: "thread-1",
        turn_id: "turn-2",
        sequence: 2,
        status: "completed",
        started_at: "2026-03-13T12:00:02.000Z",
        completed_at: "2026-03-13T12:00:03.000Z",
        updated_at: "2026-03-13T12:00:03.000Z",
        type: "plan",
        text: "- [x] 建立标准状态\n- [ ] 接入运行时条",
        metadata: {
          revisionId: "proposed_plan:2",
          plan: [
            { step: "建立标准状态", status: "completed" },
            { step: "接入运行时条", status: "pending" },
          ],
        },
      },
    ];

    const state = deriveHarnessSessionState(messages, [], items);

    expect(state.plan).toEqual({
      phase: "ready",
      items: [
        {
          id: "standard-plan:1",
          content: "建立标准状态",
          status: "completed",
        },
        {
          id: "standard-plan:2",
          content: "接入运行时条",
          status: "pending",
        },
      ],
      sourceToolCallId: "standard-plan",
      summaryText: undefined,
      revisionId: "proposed_plan:2",
      turnId: "turn-2",
      source: "thread_item",
    });
  });

  it("应通过标准 ReasoningState 从 reasoning item 恢复运行时思考状态", () => {
    const messages = [createMessage()];
    const items: AgentThreadItem[] = [
      {
        id: "reasoning-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "in_progress",
        started_at: "2026-03-13T12:00:00.000Z",
        updated_at: "2026-03-13T12:00:01.000Z",
        type: "reasoning",
        text: "先拆解用户意图，再确认计划状态。",
      },
    ];

    const state = deriveHarnessSessionState(messages, [], items);

    expect(state.reasoning).toEqual({
      reasoning: {
        supported: true,
        status: "running",
        reasoningId: "reasoning-1",
        text: "先拆解用户意图，再确认计划状态。",
      },
    });
    expect(state.hasSignals).toBe(true);
  });

  it("应从消息 artifacts 提取当前文件写入状态", () => {
    const messages = [
      createMessage({
        artifacts: [
          {
            id: "artifact-live-1",
            type: "document",
            title: "live.md",
            content: "# 实时草稿\n\n正在写入第二段",
            status: "streaming",
            meta: {
              filePath: "workspace/live.md",
              writePhase: "streaming",
              previewText: "# 实时草稿\n\n正在写入第二段",
              latestChunk: "正在写入第二段",
              lastUpdateSource: "artifact_snapshot",
            },
            position: { start: 0, end: 12 },
            createdAt: Date.now() - 1000,
            updatedAt: Date.now(),
          },
        ],
      }),
    ];

    const state = deriveHarnessSessionState(messages, []);

    expect(state.activeFileWrites).toHaveLength(1);
    expect(state.activeFileWrites[0]).toMatchObject({
      path: "workspace/live.md",
      displayName: "live.md",
      phase: "streaming",
      source: "artifact_snapshot",
    });
    expect(state.activeFileWrites[0]?.preview).toContain("实时草稿");
  });

  it("运行时回合应形成工具输出、审批、文件写入和文件活动信号", () => {
    const messages = [
      createMessage({
        runtimeStatus: {
          phase: "routing",
          title: "正在执行任务",
          detail: "已进入运行时执行链路。",
          checkpoints: ["准备工具", "等待确认", "写入测试"],
        },
        artifacts: [
          {
            id: "artifact-code-live",
            type: "code",
            title: "ImageCard.test.tsx",
            content: "it('keeps image cards after history switch', () => {})",
            status: "streaming",
            meta: {
              filePath: "src/components/ImageCard.test.tsx",
              writePhase: "streaming",
              previewText:
                "it('keeps image cards after history switch', () => {})",
              latestChunk: "keeps image cards after history switch",
              lastUpdateSource: "artifact_snapshot",
            },
            position: { start: 0, end: 12 },
            createdAt: Date.parse("2026-05-26T10:00:00.000Z"),
            updatedAt: Date.parse("2026-05-26T10:01:00.000Z"),
          },
        ],
      }),
    ];
    const pendingApprovals = [
      {
        requestId: "approval-code-write",
        actionType: "tool_confirmation" as const,
        toolName: "write_file",
        prompt: "确认写入图片卡片历史切换回归测试",
        arguments: {
          filePath: "src/components/ImageCard.test.tsx",
        },
      },
    ];
    const items: AgentThreadItem[] = [
      {
        id: "command-code-test",
        thread_id: "thread-code",
        turn_id: "turn-code",
        sequence: 1,
        status: "completed",
        started_at: "2026-05-26T10:02:00.000Z",
        completed_at: "2026-05-26T10:03:00.000Z",
        updated_at: "2026-05-26T10:03:00.000Z",
        type: "command_execution",
        command:
          "npm exec vitest run src/components/agent/chat/ImageCard.test.tsx",
        cwd: "/tmp/workspace",
        aggregated_output: "PASS ImageCard.test.tsx\n1 test passed",
        exit_code: 0,
      },
      {
        id: "artifact-code-test",
        thread_id: "thread-code",
        turn_id: "turn-code",
        sequence: 2,
        status: "completed",
        started_at: "2026-05-26T10:04:00.000Z",
        completed_at: "2026-05-26T10:05:00.000Z",
        updated_at: "2026-05-26T10:05:00.000Z",
        type: "file_artifact",
        path: "src/components/ImageCard.test.tsx",
        source: "tool_result",
        content: "新增图片卡片历史切换回归测试",
      },
    ];

    const state = deriveHarnessSessionState(messages, pendingApprovals, items);

    expect(state.runtimeStatus?.title).toBe("正在执行任务");
    expect(state.pendingApprovals).toHaveLength(1);
    expect(state.pendingApprovals[0]).toMatchObject({
      requestId: "approval-code-write",
      toolName: "write_file",
    });
    expect(state.activeFileWrites[0]).toMatchObject({
      path: "src/components/ImageCard.test.tsx",
      displayName: "ImageCard.test.tsx",
      phase: "streaming",
    });
    expect(state.outputSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: "artifact",
          artifactPath: "src/components/ImageCard.test.tsx",
          title: "产物已写入",
        }),
        expect.objectContaining({
          toolName: "command_execution",
          title: "命令执行摘要",
          summary:
            "npm exec vitest run src/components/agent/chat/ImageCard.test.tsx",
          exitCode: 0,
        }),
      ]),
    );
    expect(state.recentFileEvents[0]).toMatchObject({
      path: "src/components/ImageCard.test.tsx",
      action: "persist",
      kind: "artifact",
    });
  });

  it("应为搜索工具调用生成可消费的搜索输出信号", () => {
    const messages = [
      createMessage({
        toolCalls: [
          {
            id: "tool-search-1",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "3月13日国际新闻" }),
            status: "completed",
            result: {
              success: true,
              output: [
                "Xinhua world news summary at 0030 GMT, March 13",
                "https://example.com/xinhua",
                "全球要闻摘要，覆盖国际局势与市场动态。",
              ].join("\n"),
            },
            startTime: new Date("2026-03-13T12:00:00.000Z"),
            endTime: new Date("2026-03-13T12:00:03.000Z"),
          },
        ],
      }),
    ];

    const state = deriveHarnessSessionState(messages, []);

    expect(state.outputSignals).toHaveLength(1);
    expect(state.outputSignals[0]).toMatchObject({
      title: "联网检索摘要",
      summary: "3月13日国际新闻",
    });
    expect(state.outputSignals[0]?.preview).toContain(
      "Xinhua world news summary",
    );
    expect(state.outputSignals[0]?.content).toContain(
      "https://example.com/xinhua",
    );
  });

  it("应通过 artifact protocol 提取工具输出中的嵌套产物路径", () => {
    const messages = [
      createMessage({
        toolCalls: [
          {
            id: "tool-artifact-1",
            name: "write_file",
            arguments: JSON.stringify({
              payload: {
                filePath: "workspace/draft.md",
              },
            }),
            status: "completed",
            result: {
              success: true,
              metadata: {
                payload: {
                  artifactPath: "workspace\\cover.png",
                },
              },
              output: JSON.stringify({
                result: {
                  absolute_path: "/tmp/workspace/final.md",
                },
              }),
            },
            startTime: new Date("2026-03-13T12:00:00.000Z"),
            endTime: new Date("2026-03-13T12:00:03.000Z"),
          },
        ],
      }),
    ];

    const state = deriveHarnessSessionState(messages, []);

    expect(state.outputSignals[0]).toMatchObject({
      title: "产物已写入",
      artifactPath: "workspace/cover.png",
    });
    expect(state.recentFileEvents[0]).toMatchObject({
      path: "workspace/draft.md",
      action: "write",
    });
  });

  it("runtime status turn_summary 不应伪装成已就绪计划", () => {
    const messages = [createMessage()];
    const items: AgentThreadItem[] = [
      {
        id: "summary-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-03-13T12:00:00.000Z",
        completed_at: "2026-03-13T12:00:01.000Z",
        updated_at: "2026-03-13T12:00:01.000Z",
        type: "turn_summary",
        text: "runtime status should not become a ready plan",
        metadata: {
          sourceType: "runtime_status",
          surface: "runtime_status",
          visibility: "diagnostics",
        },
      },
    ];

    const state = deriveHarnessSessionState(messages, [], items);

    expect(state.plan.phase).toBe("idle");
    expect(state.plan.items).toHaveLength(0);
    expect(state.plan.summaryText).toBeUndefined();
    expect(state.outputSignals).toHaveLength(0);
  });

  it("有真实进展的 turn_summary 仍应作为计划摘要兜底", () => {
    const messages = [createMessage()];
    const items: AgentThreadItem[] = [
      {
        id: "summary-2",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-03-13T12:00:00.000Z",
        completed_at: "2026-03-13T12:00:01.000Z",
        updated_at: "2026-03-13T12:00:01.000Z",
        type: "turn_summary",
        text: "已打开公众号后台\n后续可以继续执行发布。",
      },
    ];

    const state = deriveHarnessSessionState(messages, [], items);

    expect(state.plan.phase).toBe("ready");
    expect(state.plan.items).toHaveLength(0);
    expect(state.plan.summaryText).toContain("已打开公众号后台");
  });

  it("应保留最近 8 条输出信号以承载多组 WebSearch 扩搜", () => {
    const toolCalls = Array.from({ length: 9 }, (_, index) => ({
      id: `tool-search-${index + 1}`,
      name: "WebSearch",
      arguments: JSON.stringify({ query: `query-${index + 1}` }),
      status: "completed" as const,
      result: {
        success: true,
        output: `结果 ${index + 1}\nhttps://example.com/${index + 1}`,
      },
      startTime: new Date(`2026-03-13T12:00:0${Math.min(index, 8)}.000Z`),
      endTime: new Date(`2026-03-13T12:00:1${Math.min(index, 8)}.000Z`),
    }));
    const messages = [createMessage({ toolCalls })];

    const state = deriveHarnessSessionState(messages, []);

    expect(state.outputSignals).toHaveLength(8);
    expect(state.outputSignals[0]?.summary).toBe("query-9");
    expect(state.outputSignals[7]?.summary).toBe("query-2");
  });

  it("没有历史任务板轨迹时应回退到持久化任务快照", () => {
    const messages = [createMessage({ content: "已恢复会话" })];

    const state = deriveHarnessSessionState(messages, [], undefined, [
      {
        content: "整理运行时边界",
        status: "in_progress",
      },
      {
        content: "补治理验证",
        status: "pending",
      },
    ]);

    expect(state.plan.phase).toBe("planning");
    expect(state.plan.items).toEqual([
      {
        id: "todo-1",
        content: "整理运行时边界",
        status: "in_progress",
      },
      {
        id: "todo-2",
        content: "补治理验证",
        status: "pending",
      },
    ]);
    expect(state.plan.summaryText).toBeUndefined();
  });
});
