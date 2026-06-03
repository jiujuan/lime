import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { conversationProjectionStore } from "../projection/conversationProjectionStore";
import { renderPanel } from "./AgentThreadReliabilityPanel.testFixtures";

describe("AgentThreadReliabilityPanel", () => {
  it("应优先展示 thread_read 中的 outcome 与 incident", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "running",
        active_turn_id: "turn-1",
        pending_requests: [
          {
            id: "req-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "tool_confirmation",
            status: "pending",
            title: "确认是否执行 browser_click",
            created_at: "2026-03-23T09:00:00Z",
          },
        ],
        last_outcome: {
          thread_id: "thread-1",
          turn_id: "turn-0",
          outcome_type: "failed_provider",
          summary: "最近一次 provider 请求失败",
          primary_cause: "429 rate limited",
          retryable: true,
          ended_at: "2026-03-23T08:58:00Z",
        },
        incidents: [
          {
            id: "incident-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            incident_type: "approval_timeout",
            severity: "high",
            status: "active",
            title: "审批等待超过阈值",
            details: "当前线程等待工具确认时间过长",
          },
        ],
      },
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "发布文章到公众号",
          status: "running",
          started_at: "2026-03-23T09:00:00Z",
          created_at: "2026-03-23T09:00:00Z",
          updated_at: "2026-03-23T09:00:10Z",
        },
      ],
      currentTurnId: "turn-1",
    });

    expect(
      container.querySelector('[data-testid="agent-thread-reliability-panel"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("线程可靠性");
    expect(container.textContent).toContain("待处理请求");
    expect(container.textContent).toContain("Provider 失败");
    expect(container.textContent).toContain("审批等待超过阈值");
    expect(container.textContent).toContain(
      "审批等待过久，建议尽快处理或停止当前执行",
    );
  });

  it("后端 pending 为 0 且存在 runtime_error 时应显示故障而不是本地旧待补", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "running",
        active_turn_id: "turn-2",
        pending_requests: [],
        incidents: [
          {
            id: "incident-runtime-error",
            thread_id: "thread-1",
            turn_id: "turn-1",
            incident_type: "runtime_error",
            severity: "high",
            status: "active",
            title: "时间线记录到异常项",
            details:
              "Agent provider execution failed: Request failed with status 402 Payment Required",
          },
        ],
      },
      turns: [
        {
          id: "turn-2",
          thread_id: "thread-1",
          prompt_text: "继续",
          status: "running",
          started_at: "2026-05-11T00:26:18Z",
          created_at: "2026-05-11T00:26:18Z",
          updated_at: "2026-05-11T00:26:24Z",
        },
      ],
      currentTurnId: "turn-2",
      pendingActions: [
        {
          requestId: "ask-turn-1",
          actionType: "ask_user",
          prompt: "请提供继续执行所需信息",
          status: "pending",
          scope: {
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
          },
        },
      ],
    });

    expect(container.textContent).toContain("时间线记录到异常项");
    expect(container.textContent).toContain("402 Payment Required");
    expect(container.textContent).not.toContain("当前线程正在等待人工处理");
    expect(container.textContent).not.toContain("优先响应当前待处理请求");
  });

  it("缺少 thread_read 时，应从当前 turn 与 pendingActions 推导并支持中断", async () => {
    const onInterruptCurrentTurn = vi.fn().mockResolvedValue(undefined);
    const container = renderPanel({
      turns: [
        {
          id: "turn-2",
          thread_id: "thread-1",
          prompt_text: "继续检查发布结果",
          status: "running",
          started_at: "2026-03-23T09:00:00Z",
          created_at: "2026-03-23T09:00:00Z",
          updated_at: "2026-03-23T09:00:12Z",
        },
      ],
      threadItems: [
        {
          id: "item-1",
          thread_id: "thread-1",
          turn_id: "turn-2",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-23T09:00:01Z",
          updated_at: "2026-03-23T09:00:05Z",
          type: "turn_summary",
          text: "正在等待用户确认是否继续执行",
        },
      ],
      pendingActions: [
        {
          requestId: "req-local-1",
          actionType: "ask_user",
          prompt: "请确认是否继续发布",
          status: "pending",
        },
      ],
      currentTurnId: "turn-2",
      canInterrupt: true,
      onInterruptCurrentTurn,
    });

    expect(container.textContent).toContain("等待人工处理");
    expect(container.textContent).toContain("请确认是否继续发布");

    const button = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("停止当前执行"),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onInterruptCurrentTurn).toHaveBeenCalledTimes(1);
  });

  it("应展示当前 runtime 路由事实与 OEM 约束", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "running",
        decision_reason:
          "当前 provider 候选池共有 3 个兼容候选，已按连续性、能力与成本优选。",
        fallback_chain: ["openai:gpt-5.4", "openai:gpt-5.4-mini"],
        oem_policy: {
          locked: true,
          quotaLow: true,
          defaultModel: "claude-sonnet-4",
        },
        runtime_summary: {
          decisionReason:
            "当前 provider 候选池共有 3 个兼容候选，已按连续性、能力与成本优选。",
        },
        model_routing: {
          serviceModelSlot: "responsive_chat",
          decisionSource: "responsive_chat_auto",
          selectedProvider: "deepseek",
          selectedModel: "deepseek-v4-flash",
          latestModelDeltaTiming: {
            source: "agent_runs.metadata",
            runStatus: "success",
            durationMs: 1386,
            firstVisibleDeltaMs: 986,
            firstThinkingDeltaMs: 986,
            firstTextDeltaMs: 1377,
          },
        },
      },
    });

    expect(container.textContent).toContain("当前路由事实");
    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-routing-evidence"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("responsive_chat");
    expect(container.textContent).toContain("responsive_chat_auto");
    expect(container.textContent).toContain("deepseek/deepseek-v4-flash");
    expect(container.textContent).toContain("首个正文");
    expect(container.textContent).toContain("1.38s");
    expect(container.textContent).toContain("agent_runs.metadata");
    expect(container.textContent).toContain("决策原因");
    expect(container.textContent).toContain("回退链");
    expect(container.textContent).toContain("品牌云端托管锁定");
    expect(container.textContent).toContain("品牌云端额度偏低");
    expect(container.textContent).toContain("claude-sonnet-4");
  });

  it("应从 latestModelDeltaTiming.routing 展示自动回退原因", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-routing-fallback",
        status: "completed",
        model_routing: {
          latestModelDeltaTiming: {
            source: "agent_runs.metadata",
            runStatus: "success",
            durationMs: 1300,
            firstTextDeltaMs: 950,
            routing: {
              decisionSource: "responsive_chat_auto",
              decisionReason:
                "service_models.responsive_chat 历史样本不满足低延迟目标（unsupported_model），已继续进入自动 responsive_chat 候选。",
              fallbackChain: [
                "openrouter:unsupported-chat-model",
                "deepseek:deepseek-v4-flash",
              ],
              serviceModelSlot: "responsive_chat",
              selectedProvider: "deepseek",
              selectedModel: "deepseek-v4-flash",
            },
          },
        },
      },
    });

    expect(container.textContent).toContain("当前路由事实");
    expect(container.textContent).toContain("决策原因");
    expect(container.textContent).toContain("unsupported_model");
    expect(container.textContent).toContain("回退链");
    expect(container.textContent).toContain(
      "openrouter:unsupported-chat-model → deepseek:deepseek-v4-flash",
    );
  });

  it("应使用当前 locale 展示路由证据标签", async () => {
    await changeLimeLocale("en-US");

    const container = renderPanel({
      threadRead: {
        thread_id: "thread-routing-en",
        status: "completed",
        model_routing: {
          latestModelDeltaTiming: {
            source: "agent_runs.metadata",
            runStatus: "success",
            firstTextDeltaMs: 1299,
            routing: {
              decisionSource: "responsive_chat_auto",
              decisionReason: "Fallback to a faster model.",
              fallbackChain: [
                "deepseek:deepseek-v4-pro",
                "deepseek:deepseek-v4-flash",
              ],
              selectedProvider: "deepseek",
              selectedModel: "deepseek-v4-flash",
            },
          },
        },
      },
    });

    expect(container.textContent).toContain("Thread Reliability");
    expect(container.textContent).toContain("Quick copy for AI");
    expect(container.textContent).toContain("Current thread status: Completed");
    expect(container.textContent).toContain("Current Routing Facts");
    expect(container.textContent).toContain("Decision reason");
    expect(container.textContent).toContain("Fallback chain");
    expect(container.textContent).toContain("First text");
  });

  it("应从 AgentUI projection store 展示并导出标准投影诊断", async () => {
    conversationProjectionStore.recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "queue_added",
        sequence: 1,
        timestamp: "2026-03-23T10:00:01Z",
        sessionId: "session-agentui-1",
        threadId: "thread-agentui-1",
        taskId: "task-agentui-1",
        owner: "task",
        scope: "task",
        phase: "submitted",
        surface: "session_tabs",
        persistence: "ui_local",
        control: "steer",
        payload: { taskEvent: "queue_added" },
      },
      {
        type: "artifact.updated",
        sourceType: "artifact_snapshot",
        sequence: 2,
        timestamp: "2026-03-23T10:00:02Z",
        sessionId: "session-agentui-1",
        threadId: "thread-agentui-1",
        artifactId: "artifact-agentui-1",
        owner: "artifact",
        scope: "artifact",
        phase: "completed",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        payload: { status: "ready" },
      },
      {
        type: "diagnostic.changed",
        sourceType: "runtime_status",
        sequence: 3,
        timestamp: "2026-03-23T10:00:03Z",
        sessionId: "session-agentui-1",
        threadId: "thread-agentui-1",
        owner: "diagnostics",
        scope: "session",
        phase: "completed",
        surface: "diagnostics",
        persistence: "diagnostics_log",
        payload: { reason: "runtime_summary_updated" },
      },
      {
        type: "task.changed",
        sourceType: "queue_added",
        sequence: 4,
        timestamp: "2026-03-23T10:00:04Z",
        sessionId: "other-session",
        threadId: "other-thread",
        taskId: "other-task",
        owner: "task",
        scope: "task",
        phase: "submitted",
      },
    ]);

    const container = renderPanel({
      threadRead: {
        thread_id: "thread-agentui-1",
        status: "running",
        active_turn_id: "turn-agentui-1",
        pending_requests: [],
        incidents: [],
      },
      turns: [
        {
          id: "turn-agentui-1",
          thread_id: "thread-agentui-1",
          prompt_text: "继续对齐 AgentUI 标准投影",
          status: "running",
          started_at: "2026-03-23T10:00:00Z",
          created_at: "2026-03-23T10:00:00Z",
          updated_at: "2026-03-23T10:00:03Z",
        },
      ],
      currentTurnId: "turn-agentui-1",
      diagnosticRuntimeContext: {
        sessionId: "session-agentui-1",
        workspaceId: "workspace-agentui-1",
        workingDir: "/workspace/agentui",
      },
    });

    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-agentui-projection"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("AgentUI 标准投影");
    expect(container.textContent).toContain("3 条");
    expect(container.textContent).toContain(
      "来源：conversationProjectionStore.agentUi",
    );
    expect(container.textContent).toContain("任务 / Agent");
    expect(container.textContent).toContain("制品");
    expect(container.textContent).toContain("Diagnostics");

    const copyButton = container.querySelector(
      '[data-testid="agent-thread-reliability-copy"]',
    );
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### AgentUI 标准投影"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("标准事件总数：3"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Task / Agent：1"),
    );

    const jsonButton = container.querySelector(
      '[data-testid="agent-thread-reliability-copy-json"]',
    );
    await act(async () => {
      jsonButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"agent_ui_projection_summary"'),
    );
  });

 });
