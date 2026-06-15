import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
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

  it("应展示 thread_read.model_routing 中的模型注册诊断事实", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-model-registry",
        status: "completed",
        model_routing: {
          serviceModelSlot: "coding",
          decisionSource: "coding_profile_slot",
          selectedProvider: "custom-coder",
          selectedModel: "coder-large",
          modelRegistry: {
            source: "provider_declared_model",
            status: "matched",
            reasonCode: "matched_provider_custom_models",
            matchedModelId: "coder-large",
            modelCapabilities: {
              capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
              },
              taskFamilies: ["chat", "reasoning"],
              runtimeFeatures: ["streaming", "tool_calling", "reasoning"],
            },
            modelAlias: {
              canonicalModelId: "coder-large",
              providerModelId: "provider/coder-large",
              aliasSource: "local",
            },
            reasoning: {
              supported: true,
              reasoningEffort: {
                supported: true,
                levels: ["low", "medium", "high"],
                default: "medium",
              },
            },
          },
        },
      },
    });

    expect(container.textContent).toContain("模型注册事实");
    expect(container.textContent).toContain("provider_declared_model");
    expect(container.textContent).toContain("matched_provider_custom_models");
    expect(container.textContent).toContain("模型能力");
    expect(container.textContent).toContain("tools");
    expect(container.textContent).toContain("tool_calling");
    expect(container.textContent).toContain("模型别名");
    expect(container.textContent).toContain(
      "canonical=coder-large · provider=provider/coder-large · source=local",
    );
    expect(container.textContent).toContain("推理能力");
    expect(container.textContent).toContain(
      "supported=true · effort=true · levels=low/medium/high · default=medium",
    );
  });

  it("应展示 thread_read.model_routing 中的 provider readiness 阻断诊断", () => {
    const onManageProviders = vi.fn();
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-provider-readiness",
        status: "failed",
        model_routing: {
          serviceModelSlot: "coding",
          decisionSource: "coding_profile_slot",
          selectedProvider: "custom-coder",
          selectedModel: "coder-large",
          providerReadiness: {
            ready: false,
            status: "needs_setup",
            source: "provider_store",
            reasonCode: "missing_enabled_api_key",
            providerType: "openai-compatible",
            enabled: true,
            enabledKeyCount: 0,
            totalKeyCount: 2,
          },
        },
      },
      onManageProviders,
    });

    expect(container.textContent).toContain("服务商就绪状态");
    expect(container.textContent).toContain("needs_setup");
    expect(container.textContent).toContain("provider_store");
    expect(container.textContent).toContain("missing_enabled_api_key");
    expect(container.textContent).toContain("服务商类型");
    expect(container.textContent).toContain("openai-compatible");
    expect(container.textContent).toContain("可用密钥");
    expect(container.textContent).toContain("0/2");
    expect(container.textContent).toContain("恢复动作");
    expect(container.textContent).toContain("add_enabled_api_key");
    expect(container.textContent).toContain("打开 AI 服务商设置");

    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("打开 AI 服务商设置"),
    );
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onManageProviders).toHaveBeenCalledTimes(1);
    expect(onManageProviders).toHaveBeenCalledWith({
      providerId: "custom-coder",
      modelId: "coder-large",
      reasonCode: "missing_enabled_api_key",
      recoveryAction: "add_enabled_api_key",
    });
  });

  it("应展示 coding 槽位不可用后的自动回退尝试链", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-routing-attempts",
        status: "completed",
        model_routing: {
          serviceModelSlot: "base",
          decisionSource: "profile_model_slot",
          selectedProvider: "openai",
          selectedModel: "gpt-4.1-mini",
          fallbackApplied: true,
          requestedSelection: {
            provider: "custom-coding",
            model: "coder-large",
            source: "profile_model_slot",
          },
          routingAttempts: [
            {
              slot: "coding",
              provider: "custom-coding",
              model: "coder-large",
              source: "profile_model_slot",
              providerReadiness: {
                status: "needs_setup",
                reasonCode: "missing_enabled_api_key",
              },
            },
            {
              slot: "base",
              provider: "openai",
              model: "gpt-4.1-mini",
              source: "profile_model_slot",
              providerReadiness: {
                status: "ready",
              },
            },
          ],
        },
      },
    });

    expect(container.textContent).toContain("自动回退");
    expect(container.textContent).toContain("路由尝试");
    expect(container.textContent).toContain("请求模型");
    expect(container.textContent).toContain("custom-coding/coder-large");
    expect(container.textContent).toContain("coding");
    expect(container.textContent).toContain("needs_setup");
    expect(container.textContent).toContain("missing_enabled_api_key");
    expect(container.textContent).toContain("base");
    expect(container.textContent).toContain("openai/gpt-4.1-mini");
  });

  it("应展示、复制 policy/network 冲突诊断事实，并可打开执行策略设置", async () => {
    const onOpenExecutionPolicySettings = vi.fn();
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-policy-network",
        status: "failed",
        decision_reason: "当前策略拒绝网络下载命令。",
        fallback_chain: ["workspace-write", "read-only"],
        diagnostics: {
          warning_count: 1,
          context_compaction_count: 0,
          failed_tool_call_count: 1,
          failed_command_count: 1,
          pending_request_count: 0,
          primary_blocking_kind: "sandbox_blocked",
          primary_blocking_summary: "read-only sandbox blocked curl download",
          latest_warning: {
            item_id: "warning-1",
            code: "network_download",
            message: "curl 命中网络下载策略",
            updated_at: "2026-06-14T00:00:00Z",
          },
          latest_failed_command: {
            item_id: "command-1",
            command: "curl https://example.com/install.sh",
            exit_code: 1,
            error: "blocked by workspace policy",
            updated_at: "2026-06-14T00:00:00Z",
            policyName: "workspace_tool_execution",
            policyProfile: "read-only",
            warningPolicy: "shell_command_risk",
            warningPolicySource: "user",
            restrictionProfile: "workspace_path_required",
            restrictionProfileSource: "runtime",
            sandboxPolicy: "read-only",
            sandboxPolicySource: "request",
            sandboxBackend: "restricted_token",
            sandboxBackendStatus: "ready",
            sandboxBackendEnforced: true,
            sandboxBackendRequired: true,
            sandboxBackendReasonCode: "sandbox_backend_ready",
            sandboxBackendReason:
              "Windows restricted token backend 可用于当前 shell 工具执行",
            sandboxBackendPlatform: "windows",
            workspaceSandboxConfigSource: "request",
          },
        } as unknown as AgentRuntimeThreadReadModel["diagnostics"],
        model_routing: {
          networkRuleId: "download-block",
          networkRuleTarget: "url",
          networkRuleSource: "request",
          networkRiskLevel: "high",
          networkRiskReasonCode: "request_download_url",
        },
      },
      onOpenExecutionPolicySettings,
    });

    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-policy-evidence"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("策略与网络事实");
    expect(container.textContent).toContain("策略决策");
    expect(container.textContent).toContain("workspace_tool_execution");
    expect(container.textContent).toContain("read-only");
    expect(container.textContent).toContain("策略来源");
    expect(container.textContent).toContain("warning=user");
    expect(container.textContent).toContain("restriction=runtime");
    expect(container.textContent).toContain("sandbox=request");
    expect(container.textContent).toContain("沙箱后端");
    expect(container.textContent).toContain("backend=restricted_token");
    expect(container.textContent).toContain("status=ready");
    expect(container.textContent).toContain("enforced=true");
    expect(container.textContent).toContain("platform=windows");
    expect(container.textContent).toContain(
      "Windows restricted token backend 可用于当前 shell 工具执行",
    );
    expect(container.textContent).toContain("网络规则");
    expect(container.textContent).toContain("download-block");
    expect(container.textContent).toContain("request_download_url");
    expect(container.textContent).toContain("网络判定");
    expect(container.textContent).toContain("deny");
    expect(container.textContent).toContain(
      "read-only sandbox blocked curl download",
    );
    expect(container.textContent).toContain("打开执行策略设置");

    const settingsButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("打开执行策略设置"));
    expect(settingsButton).not.toBeNull();
    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onOpenExecutionPolicySettings).toHaveBeenCalledTimes(1);
    expect(onOpenExecutionPolicySettings).toHaveBeenCalledWith({
      section: "network",
      ruleId: "download-block",
      target: "url",
      value: "download-block",
      reasonCode: "request_download_url",
    });

    const copyButton = container.querySelector(
      '[data-testid="agent-thread-reliability-copy"]',
    );
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("策略决策: workspace_tool_execution"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "策略来源: warning=user · restriction=runtime · sandbox=request",
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "沙箱后端: backend=restricted_token · status=ready · enforced=true · required=true · platform=windows · source=request · reason=sandbox_backend_ready · Windows restricted token backend 可用于当前 shell 工具执行",
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "网络规则: download-block · url · request · high · request_download_url",
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "网络判定: deny · request_download_url · read-only sandbox blocked curl download",
      ),
    );
  });

  it("policy 与 network 诊断没有设置回调时不应显示假入口", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-policy-network-no-action",
        status: "failed",
        diagnostics: {
          primary_blocking_kind: "sandbox_blocked",
          primary_blocking_summary: "read-only sandbox blocked curl download",
          latest_failed_command: {
            item_id: "command-1",
            command: "curl https://example.com/install.sh",
            exit_code: 1,
            error: "blocked by workspace policy",
            updated_at: "2026-06-14T00:00:00Z",
            policyName: "workspace_tool_execution",
            policyProfile: "read-only",
            sandboxPolicy: "read-only",
          },
        } as unknown as AgentRuntimeThreadReadModel["diagnostics"],
        model_routing: {
          networkRuleId: "download-block",
          networkRuleTarget: "url",
          networkRuleSource: "request",
        },
      },
    });

    expect(
      container.querySelector(
        '[data-testid="agent-thread-reliability-policy-evidence"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("策略与网络事实");
    expect(container.textContent).not.toContain("打开执行策略设置");
  });

  it("provider readiness 没有管理回调时不应显示假入口", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-provider-readiness-no-action",
        status: "failed",
        model_routing: {
          serviceModelSlot: "coding",
          selectedProvider: "custom-coder",
          selectedModel: "coder-large",
          providerReadiness: {
            ready: false,
            status: "needs_setup",
            source: "provider_store",
            reasonCode: "missing_enabled_api_key",
            providerType: "openai-compatible",
            enabled: true,
            enabledKeyCount: 0,
            totalKeyCount: 2,
          },
        },
      },
    });

    expect(container.textContent).toContain("恢复动作");
    expect(container.textContent).toContain("add_enabled_api_key");
    expect(container.textContent).not.toContain("打开 AI 服务商设置");
    expect(
      Array.from(container.querySelectorAll("button")).some((element) =>
        element.textContent?.includes("打开 AI 服务商设置"),
      ),
    ).toBe(false);
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
