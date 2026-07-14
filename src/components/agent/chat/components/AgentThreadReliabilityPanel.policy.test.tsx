import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import { renderPanel } from "./AgentThreadReliabilityPanel.testFixtures";

describe("AgentThreadReliabilityPanel policy/network diagnostics", () => {
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
    for (const text of [
      "策略与网络事实",
      "策略决策",
      "workspace_tool_execution",
      "read-only",
      "策略来源",
      "warning=user",
      "restriction=runtime",
      "sandbox=request",
      "沙箱后端",
      "backend=restricted_token",
      "status=ready",
      "enforced=true",
      "platform=windows",
      "Windows restricted token backend 可用于当前 shell 工具执行",
      "网络规则",
      "download-block",
      "request_download_url",
      "网络判定",
      "deny",
      "read-only sandbox blocked curl download",
      "打开执行策略设置",
    ]) {
      expect(container.textContent).toContain(text);
    }

    const settingsButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("打开执行策略设置"));
    expect(settingsButton).not.toBeNull();
    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
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
    for (const copiedText of [
      "策略决策: workspace_tool_execution",
      "策略来源: warning=user · restriction=runtime · sandbox=request",
      "沙箱后端: backend=restricted_token · status=ready · enforced=true · required=true · platform=windows · source=request · reason=sandbox_backend_ready · Windows restricted token backend 可用于当前 shell 工具执行",
      "网络规则: download-block · url · request · high · request_download_url",
      "网络判定: deny · request_download_url · read-only sandbox blocked curl download",
    ]) {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(copiedText),
      );
    }
  });
});
