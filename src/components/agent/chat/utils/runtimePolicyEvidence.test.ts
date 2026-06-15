import { describe, expect, it } from "vitest";

import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import {
  buildRuntimePolicyEvidenceLines,
  resolveRuntimePolicyEvidence,
  type RuntimePolicyEvidenceLineText,
} from "./runtimePolicyEvidence";

const EN_LINE_TEXT: RuntimePolicyEvidenceLineText = {
  decisionReason: "Decision reason",
  fallbackChain: "Fallback chain",
  network: "Network rule",
  networkDecision: "Network decision",
  policy: "Policy decision",
  policyFailure: "Policy failure",
  policyProfile: "Policy profile",
  policySources: "Policy sources",
  sandbox: "Sandbox policy",
  sandboxBackend: "Sandbox backend",
  unknown: "Unknown",
};

function threadRead(
  value: Partial<AgentRuntimeThreadReadModel>,
): AgentRuntimeThreadReadModel {
  return value as AgentRuntimeThreadReadModel;
}

describe("runtimePolicyEvidence", () => {
  it("应从 thread_read diagnostics 与 model_routing 解析 policy/network 诊断事实", () => {
    const evidence = resolveRuntimePolicyEvidence({
      threadRead: threadRead({
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
      }),
      decisionReason: "当前策略拒绝网络下载命令。",
      fallbackChain: ["workspace-write", "read-only"],
    });

    expect(evidence).toMatchObject({
      shouldRender: true,
      decisionReason: "当前策略拒绝网络下载命令。",
      fallbackChain: ["workspace-write", "read-only"],
      primaryBlockingKind: "sandbox_blocked",
      primaryBlockingSummary: "read-only sandbox blocked curl download",
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
      sandboxBackendEnforced: "true",
      sandboxBackendRequired: "true",
      sandboxBackendReasonCode: "sandbox_backend_ready",
      sandboxBackendReason:
        "Windows restricted token backend 可用于当前 shell 工具执行",
      sandboxBackendPlatform: "windows",
      workspaceSandboxConfigSource: "request",
      networkRuleId: "download-block",
      networkRuleTarget: "url",
      networkRuleSource: "request",
      networkRiskLevel: "high",
      networkRiskReason: "request_download_url",
      networkDecision: {
        status: "deny",
        reasonCode: "request_download_url",
        summary: "read-only sandbox blocked curl download",
        canRequestPolicyChange: true,
      },
      latestWarning: "curl 命中网络下载策略",
    });

    const text = buildRuntimePolicyEvidenceLines(evidence, EN_LINE_TEXT).join(
      "\n",
    );
    expect(text).toContain("Decision reason: 当前策略拒绝网络下载命令。");
    expect(text).toContain("Fallback chain: workspace-write -> read-only");
    expect(text).toContain(
      "Policy decision: workspace_tool_execution · shell_command_risk · workspace_path_required · sandbox_blocked · read-only sandbox blocked curl download",
    );
    expect(text).toContain("Policy profile: read-only");
    expect(text).toContain(
      "Policy sources: warning=user · restriction=runtime · sandbox=request",
    );
    expect(text).toContain("Sandbox policy: read-only");
    expect(text).toContain(
      "Sandbox backend: backend=restricted_token · status=ready · enforced=true · required=true · platform=windows · source=request · reason=sandbox_backend_ready · Windows restricted token backend 可用于当前 shell 工具执行",
    );
    expect(text).toContain(
      "Network rule: download-block · url · request · high · request_download_url",
    );
    expect(text).toContain(
      "Network decision: deny · request_download_url · read-only sandbox blocked curl download",
    );
  });

  it("应把非 Windows 宿主上的 Windows runner fallback 标记为宿主不可用诊断", () => {
    const evidence = resolveRuntimePolicyEvidence({
      threadRead: threadRead({
        diagnostics: {
          latest_failed_command: {
            item_id: "command-windows-fallback",
            command: "pwsh -Command Get-Location",
            exit_code: 1,
            updated_at: "2026-06-15T00:00:00Z",
            sandboxPolicy: "workspace-write",
            sandboxBackend: "restricted_token",
            sandboxBackendStatus: "unavailable",
            sandboxBackendEnforced: false,
            sandboxBackendRequired: true,
            sandboxBackendReasonCode:
              "sandbox_backend_windows_runner_unavailable_on_host",
            sandboxBackendReason:
              "当前宿主构建不可执行 Windows restricted token runner",
            sandboxBackendPlatform: "windows",
            workspaceSandboxConfigSource: "request",
          },
        } as unknown as AgentRuntimeThreadReadModel["diagnostics"],
      }),
    });

    expect(evidence).toMatchObject({
      shouldRender: true,
      sandboxBackend: "restricted_token",
      sandboxBackendStatus: "unavailable",
      sandboxBackendEnforced: "false",
      sandboxBackendRequired: "true",
      sandboxBackendReasonCode:
        "sandbox_backend_windows_runner_unavailable_on_host",
      sandboxBackendReason:
        "当前宿主构建不可执行 Windows restricted token runner",
      sandboxBackendPlatform: "windows",
      workspaceSandboxConfigSource: "request",
    });
    expect(buildRuntimePolicyEvidenceLines(evidence, EN_LINE_TEXT)).toContain(
      "- Sandbox backend: backend=restricted_token · status=unavailable · enforced=false · required=true · platform=windows · source=request · reason=sandbox_backend_windows_runner_unavailable_on_host · 当前宿主构建不可执行 Windows restricted token runner",
    );
  });

  it("应从最近失败命令 metadata 解析 network rule facts", () => {
    const evidence = resolveRuntimePolicyEvidence({
      threadRead: threadRead({
        diagnostics: {
          latest_failed_command: {
            item_id: "command-2",
            command: "curl https://example.com/install.sh",
            exit_code: 1,
            error: "blocked by network rule",
            updated_at: "2026-06-14T00:00:00Z",
            policyName: "workspace_tool_execution",
            policyProfile: "workspace-write",
            sandboxPolicy: "workspace-write",
            networkRuleId: "request-download-block",
            networkRuleTarget: "host",
            networkRuleSource: "runtime",
            networkRiskLevel: "high",
            networkRiskReason: "runtime_download_host",
            networkHost: "example.com",
            networkUrl: "https://example.com/install.sh",
          },
        } as unknown as AgentRuntimeThreadReadModel["diagnostics"],
      }),
    });

    expect(evidence).toMatchObject({
      shouldRender: true,
      policyName: "workspace_tool_execution",
      policyProfile: "workspace-write",
      sandboxPolicy: "workspace-write",
      networkRuleId: "request-download-block",
      networkRuleTarget: "host",
      networkRuleSource: "runtime",
      networkRiskLevel: "high",
      networkRiskReason: "runtime_download_host",
      networkHost: "example.com",
      networkUrl: "https://example.com/install.sh",
      networkDecision: {
        status: "deny",
        reasonCode: "runtime_download_host",
        summary: "Network access to example.com was blocked by policy.",
        canRequestPolicyChange: true,
      },
    });

    expect(buildRuntimePolicyEvidenceLines(evidence, EN_LINE_TEXT)).toContain(
      "- Network rule: request-download-block · host · runtime · high · runtime_download_host · example.com · https://example.com/install.sh",
    );
    expect(buildRuntimePolicyEvidenceLines(evidence, EN_LINE_TEXT)).toContain(
      "- Network decision: deny · runtime_download_host · Network access to example.com was blocked by policy.",
    );
  });

  it("网络规则存在但未阻断时应标记为需要策略复核", () => {
    const evidence = resolveRuntimePolicyEvidence({
      threadRead: threadRead({
        diagnostics: {
          latest_failed_command: {
            item_id: "command-3",
            command: "curl https://api.example.com/status",
            exit_code: 1,
            updated_at: "2026-06-14T00:00:00Z",
            networkRuleId: "review-api-host",
            networkRuleTarget: "host",
            networkRuleSource: "organization",
            networkRiskLevel: "medium",
            networkRiskReason: "organization_review_host",
            networkHost: "api.example.com",
          },
        } as unknown as AgentRuntimeThreadReadModel["diagnostics"],
      }),
    });

    expect(evidence.networkDecision).toEqual({
      status: "ask",
      reasonCode: "organization_review_host",
      summary: "Network access to api.example.com requires policy review.",
      canRequestPolicyChange: true,
    });
  });
});
