import { act } from "react";
import { describe, expect, it } from "vitest";
import { mockToast, renderPanel } from "./AgentThreadReliabilityPanel.testFixtures";

describe("AgentThreadReliabilityPanel", () => {
  it("不再展示旧运行时记忆预取入口", async () => {
    const container = renderPanel({
      turns: [
        {
          id: "turn-memory-1",
          thread_id: "thread-memory-1",
          prompt_text: "继续输出研究简报的风险点",
          status: "running",
          started_at: "2026-03-23T10:00:00Z",
          created_at: "2026-03-23T10:00:00Z",
          updated_at: "2026-03-23T10:01:00Z",
        },
      ],
      diagnosticRuntimeContext: {
        sessionId: "session-memory-1",
        workspaceId: "workspace-memory-1",
        workingDir: "/workspace/project-a",
      },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-memory-prefetch"]',
      ),
    ).toBeNull();
    expect(container.textContent).not.toContain("本回合记忆预取");
    expect(container.textContent).not.toContain("记忆命中预演");
    expect(container.textContent).not.toContain("查看记忆预演");
  });

  it("应展示最近压缩边界，帮助判断压缩后的工作记忆续接", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-compaction-1",
        status: "completed",
        pending_requests: [],
        incidents: [],
        latest_compaction_boundary: {
          session_id: "session-compaction-1",
          summary_preview:
            "保留研究目标、已确认来源和待输出风险点，后续回答应沿这条摘要继续。",
          turn_count: 8,
          created_at: "2026-03-23T10:05:00Z",
          trigger: "token_budget",
          detail: "压缩后保留研究目标与来源摘要",
        },
      },
    });

    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-compaction-boundary"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("最近压缩边界");
    expect(container.textContent).toContain("token_budget");
    expect(container.textContent).toContain("覆盖 8 回合");
    expect(container.textContent).toContain(
      "保留研究目标、已确认来源和待输出风险点",
    );
    expect(container.textContent).toContain(
      "压缩备注 压缩后保留研究目标与来源摘要",
    );
  });

  it("应支持复制给 AI 的可靠性诊断包", async () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "aborted",
        active_turn_id: "turn-1",
        latest_compaction_boundary: {
          session_id: "session-diag-1",
          summary_preview:
            "保留研究目标、最近来源摘要和待输出风险点，后续回答应基于这段摘要继续。",
          turn_count: 6,
          created_at: "2026-03-23T10:01:05Z",
          trigger: "token_budget",
          detail: "压缩后保留研究目标与最近来源摘要",
        },
        diagnostics: {
          latest_turn_status: "aborted",
          latest_turn_started_at: "2026-03-23T10:00:00Z",
          latest_turn_completed_at: "2026-03-23T10:02:00Z",
          latest_turn_updated_at: "2026-03-23T10:03:00Z",
          latest_turn_elapsed_seconds: 120,
          latest_turn_error_message: "浏览器页面已关闭",
          interrupt_reason: "浏览器页面已关闭",
          runtime_interrupt_source: "user",
          runtime_interrupt_requested_at: "2026-03-23T10:01:58Z",
          runtime_interrupt_wait_seconds: 2,
          warning_count: 1,
          context_compaction_count: 1,
          failed_tool_call_count: 1,
          failed_command_count: 1,
          pending_request_count: 0,
          primary_blocking_kind: "tool_failed",
          primary_blocking_summary: "页面上下文已销毁",
          latest_warning: {
            item_id: "warning-1",
            code: "context_compaction_accuracy",
            message: "长对话和多次上下文压缩会降低模型准确性",
            updated_at: "2026-03-23T10:01:30Z",
          },
          latest_context_compaction: {
            item_id: "compaction-1",
            stage: "runtime",
            trigger: "token_budget",
            detail: "保留研究目标与最近来源摘要",
            updated_at: "2026-03-23T10:01:00Z",
          },
          latest_failed_tool: {
            item_id: "tool-1",
            tool_name: "browser_click",
            error: "页面上下文已销毁",
            updated_at: "2026-03-23T10:02:00Z",
          },
          latest_failed_command: {
            item_id: "cmd-1",
            command: "npm run build",
            exit_code: 1,
            error: "Command failed with exit code 1",
            updated_at: "2026-03-23T10:01:50Z",
          },
        },
        pending_requests: [],
        last_outcome: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          outcome_type: "failed_tool",
          summary: "工具执行中断",
          primary_cause: "浏览器页面已关闭",
          retryable: true,
          ended_at: "2026-03-23T10:02:00Z",
        },
        incidents: [
          {
            id: "incident-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            incident_type: "tool_failed",
            severity: "high",
            status: "active",
            title: "浏览器工具执行失败",
            details: "页面上下文已销毁",
          },
        ],
        updated_at: "2026-03-23T10:03:00Z",
      },
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "继续发布公众号文章",
          status: "aborted",
          started_at: "2026-03-23T10:00:00Z",
          created_at: "2026-03-23T10:00:00Z",
          updated_at: "2026-03-23T10:03:00Z",
        },
      ],
      currentTurnId: "turn-1",
      harnessState: {
        runtimeStatus: {
          phase: "context",
          title: "正在整理研究上下文",
          detail: "最近一次压缩后继续生成研究简报。",
          checkpoints: ["已整理来源", "正在回填摘要"],
        },
        pendingApprovals: [],
        latestContextTrace: [
          {
            stage: "context_compaction",
            detail: "保留研究目标与最近来源摘要",
          },
        ],
        plan: {
          phase: "ready",
          items: [
            { id: "todo-1", content: "归纳研究目标", status: "completed" },
            { id: "todo-2", content: "输出风险点", status: "in_progress" },
          ],
          summaryText: "先回填研究简报，再补风险追踪建议。",
        },
        activity: {
          planning: 1,
          filesystem: 0,
          execution: 0,
          web: 2,
          skills: 0,
          delegation: 0,
        },
        delegatedTasks: [],
        outputSignals: [
          {
            id: "signal-1",
            toolCallId: "tool-1",
            toolName: "web_search",
            title: "联网检索摘要",
            summary: "已检索 3 个来源",
            preview: "来源覆盖官网、新闻和公告",
          },
        ],
        activeFileWrites: [],
        recentFileEvents: [],
        hasSignals: true,
      },
      messages: [
        {
          id: "msg-user-1",
          role: "user",
          content: "请围绕这个主题先给我做一版网页研究简报",
          timestamp: new Date("2026-03-23T09:59:00Z"),
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: "我先整理研究目标、来源、核心发现和风险点。",
          timestamp: new Date("2026-03-23T10:00:00Z"),
          runtimeStatus: {
            phase: "context",
            title: "正在整理研究上下文",
            detail: "压缩后继续生成简报",
            checkpoints: ["研究目标", "来源摘要"],
          },
        },
      ],
      diagnosticRuntimeContext: {
        sessionId: "session-diag-1",
        workspaceId: "workspace-diag-1",
        workingDir: "/workspace/research",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "general",
        selectedTeamLabel: "研究协作队",
      },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const copyButton = container.querySelector(
      '[data-testid="agent-thread-reliability-copy"]',
    );
    expect(copyButton).not.toBeNull();

    await act(async () => {
      (copyButton as HTMLButtonElement | null)?.click();
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Lime 线程可靠性诊断任务"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("请按以下结构输出："),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### 运行环境"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("gpt-5.4"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### Harness 过程信号"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### 最近压缩边界"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.not.stringContaining("### 当前回合记忆预取"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.not.stringContaining("运行时记忆片段"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("覆盖回合数：6"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "边界摘要：保留研究目标、最近来源摘要和待输出风险点",
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### 后端诊断聚合"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("主阻塞类型：tool_failed"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("中断来源：user"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("最近失败命令：npm run build"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### 最近消息片段"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("### Incident"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("浏览器工具执行失败"),
    );
    expect(mockToast.success).toHaveBeenCalledWith("AI 诊断内容已复制");
    expect(container.textContent).toContain("线程级快速诊断");
    expect(container.textContent).toContain("快速复制给 AI");
    expect(container.textContent).toContain("复制原始 JSON（debug）");
    expect(container.textContent).toContain("外部分析交接");
    expect(container.textContent).toContain(
      "analysis-brief.md / analysis-context.json",
    );
  });

  it("应支持复制原始 JSON 诊断数据", async () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-json-1",
        status: "waiting_request",
        active_turn_id: "turn-json-1",
        latest_compaction_boundary: {
          session_id: "session-json-1",
          summary_preview: "保留用户确认点与待继续执行动作。",
          turn_count: 3,
          created_at: "2026-03-23T10:00:20Z",
          trigger: "manual_compact",
          detail: "压缩后等待用户输入",
        },
        diagnostics: {
          latest_turn_status: "running",
          warning_count: 0,
          context_compaction_count: 0,
          failed_tool_call_count: 0,
          failed_command_count: 0,
          pending_request_count: 1,
          primary_blocking_kind: "waiting_user_input",
        },
        pending_requests: [
          {
            id: "req-json-1",
            thread_id: "thread-json-1",
            turn_id: "turn-json-1",
            request_type: "ask_user",
            status: "pending",
            title: "请确认是否继续执行",
            created_at: "2026-03-23T10:00:00Z",
          },
        ],
        incidents: [],
      },
      turns: [
        {
          id: "turn-json-1",
          thread_id: "thread-json-1",
          prompt_text: "继续执行 JSON 校验任务",
          status: "running",
          started_at: "2026-03-23T10:00:00Z",
          created_at: "2026-03-23T10:00:00Z",
          updated_at: "2026-03-23T10:01:00Z",
        },
      ],
      currentTurnId: "turn-json-1",
      pendingActions: [
        {
          requestId: "req-json-1",
          actionType: "ask_user",
          prompt: "请确认是否继续执行",
          status: "pending",
        },
      ],
      harnessState: {
        runtimeStatus: null,
        pendingApprovals: [],
        latestContextTrace: [],
        plan: {
          phase: "idle",
          items: [],
        },
        activity: {
          planning: 0,
          filesystem: 0,
          execution: 0,
          web: 0,
          skills: 0,
          delegation: 0,
        },
        delegatedTasks: [],
        outputSignals: [],
        activeFileWrites: [],
        recentFileEvents: [],
        hasSignals: true,
      },
      messages: [
        {
          id: "msg-json-1",
          role: "assistant",
          content: "正在等待你确认是否继续执行",
          timestamp: new Date("2026-03-23T10:00:30Z"),
        },
      ],
      diagnosticRuntimeContext: {
        sessionId: "session-json-1",
        workspaceId: "workspace-json-1",
        workingDir: "/workspace/json",
        providerType: "openai",
        model: "gpt-5.4-mini",
        executionStrategy: "react",
        activeTheme: "general",
        selectedTeamLabel: "默认协作",
      },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const jsonButton = container.querySelector(
      '[data-testid="agent-thread-reliability-copy-json"]',
    );
    expect(jsonButton).not.toBeNull();

    await act(async () => {
      (jsonButton as HTMLButtonElement | null)?.click();
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"runtime_context"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"backend_diagnostics"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"latest_compaction_boundary"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.not.stringContaining('"memory_prefetch_preview"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"harness_state"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"recent_messages"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"thread_read"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"reliability_view"'),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"pending_actions"'),
    );
    expect(mockToast.success).toHaveBeenCalledWith("原始 JSON 已复制");
  });
});
