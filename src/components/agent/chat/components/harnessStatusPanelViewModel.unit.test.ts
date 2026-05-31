import { describe, expect, it } from "vitest";
import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";

import {
  formatBrowserActionStatusLabel,
  formatCompletionAuditDecisionLabel,
  formatLimeCorePolicyDecisionLabel,
  formatLimeCorePolicyStatusLabel,
  formatPermissionConfirmationStatusLabel,
  formatReviewDecisionArtifactKindLabel,
  formatReviewDecisionRiskLevelLabel,
  formatReviewDecisionStatusLabel,
  formatReviewLimitStatusLabel,
  resolveFriendlyToolLabel,
  resolveSubagentRuntimeStatusLabel,
  resolveSubagentRuntimeStatusVariant,
  resolveSubagentSessionTypeLabel,
  summarizeChildSubagentSessions,
} from "./harnessStatusPanelViewModel";

function buildSubagentSession(
  runtimeStatus: AsterSubagentSessionInfo["runtime_status"],
): AsterSubagentSessionInfo {
  return {
    id: `session-${runtimeStatus ?? "unknown"}`,
    name: `Session ${runtimeStatus ?? "unknown"}`,
    created_at: 1,
    updated_at: 1,
    session_type: "sub_agent",
    runtime_status: runtimeStatus,
  };
}

describe("harnessStatusPanelViewModel", () => {
  it("应解析子任务运行状态标签和 Badge 变体", () => {
    expect(resolveSubagentRuntimeStatusLabel("queued")).toBe("稍后开始");
    expect(resolveSubagentRuntimeStatusVariant("queued")).toBe("outline");

    expect(resolveSubagentRuntimeStatusLabel("running")).toBe("处理中");
    expect(resolveSubagentRuntimeStatusVariant("running")).toBe("default");

    expect(resolveSubagentRuntimeStatusLabel("completed")).toBe("已完成");
    expect(resolveSubagentRuntimeStatusVariant("completed")).toBe("secondary");

    expect(resolveSubagentRuntimeStatusLabel("failed")).toBe("失败");
    expect(resolveSubagentRuntimeStatusVariant("failed")).toBe("destructive");

    expect(resolveSubagentRuntimeStatusLabel("aborted")).toBe("已暂停");
    expect(resolveSubagentRuntimeStatusVariant("aborted")).toBe("destructive");

    expect(resolveSubagentRuntimeStatusLabel("idle")).toBe("待开始");
    expect(resolveSubagentRuntimeStatusVariant("idle")).toBe("outline");

    expect(resolveSubagentRuntimeStatusLabel()).toBe("待开始");
    expect(resolveSubagentRuntimeStatusVariant()).toBe("outline");
  });

  it("应解析子任务会话类型标签", () => {
    expect(resolveSubagentSessionTypeLabel("sub_agent")).toBe("子任务");
    expect(resolveSubagentSessionTypeLabel("fork")).toBe("分支任务");
    expect(resolveSubagentSessionTypeLabel("user")).toBe("user");
    expect(resolveSubagentSessionTypeLabel(" custom ")).toBe("custom");
    expect(resolveSubagentSessionTypeLabel("   ")).toBe("任务会话");
    expect(resolveSubagentSessionTypeLabel()).toBe("任务会话");
  });

  it("应解析工具友好标签", () => {
    expect(resolveFriendlyToolLabel()).toBeNull();
    expect(resolveFriendlyToolLabel("   ")).toBeNull();
    expect(resolveFriendlyToolLabel("TurnSummary")).toBe("当前任务摘要");
    expect(resolveFriendlyToolLabel("ReadFile")).toBe("文件读取");
  });

  it("应汇总子任务会话状态", () => {
    expect(
      summarizeChildSubagentSessions([
        buildSubagentSession("running"),
        buildSubagentSession("queued"),
        buildSubagentSession("completed"),
        buildSubagentSession("failed"),
        buildSubagentSession("aborted"),
        buildSubagentSession("closed"),
        buildSubagentSession("idle"),
      ]),
    ).toEqual({
      total: 7,
      running: 1,
      queued: 1,
      active: 2,
      settled: 4,
      failed: 2,
    });
  });

  it("应格式化完成审计决策", () => {
    expect(formatCompletionAuditDecisionLabel("completed")).toBe(
      "completed · 证据完成",
    );
    expect(formatCompletionAuditDecisionLabel("blocked")).toBe(
      "blocked · 运行阻断",
    );
    expect(formatCompletionAuditDecisionLabel("needs_input")).toBe(
      "needs_input · 等待输入",
    );
    expect(formatCompletionAuditDecisionLabel("verifying")).toBe(
      "verifying · 等待审计",
    );
    expect(formatCompletionAuditDecisionLabel(" custom ")).toBe("custom");
    expect(formatCompletionAuditDecisionLabel(null)).toBe("unknown");
  });

  it("应格式化浏览器动作状态", () => {
    expect(formatBrowserActionStatusLabel({ success: true })).toBe("成功");
    expect(formatBrowserActionStatusLabel({ success: false })).toBe("失败");

    for (const status of ["completed", "success", "succeeded"]) {
      expect(formatBrowserActionStatusLabel({ status })).toBe("成功");
    }
    for (const status of ["failed", "error"]) {
      expect(formatBrowserActionStatusLabel({ status })).toBe("失败");
    }

    expect(formatBrowserActionStatusLabel({ status: "running" })).toBe(
      "执行中",
    );
    expect(formatBrowserActionStatusLabel({ status: "pending" })).toBe(
      "待处理",
    );
    expect(formatBrowserActionStatusLabel({ status: " custom " })).toBe(
      "custom",
    );
    expect(formatBrowserActionStatusLabel({ status: "   " })).toBe(
      "未知状态",
    );
  });

  it("应格式化 LimeCore policy 状态和决策", () => {
    expect(formatLimeCorePolicyStatusLabel("local_defaults_evaluated")).toBe(
      "本地默认已评估",
    );
    expect(formatLimeCorePolicyStatusLabel("refs_declared")).toBe(
      "已声明引用",
    );
    expect(formatLimeCorePolicyStatusLabel("not_evaluated")).toBe(
      "尚未评估",
    );
    expect(formatLimeCorePolicyStatusLabel(" custom ")).toBe("custom");
    expect(formatLimeCorePolicyStatusLabel()).toBe("未知状态");

    expect(formatLimeCorePolicyDecisionLabel("allow")).toBe("本地允许");
    expect(formatLimeCorePolicyDecisionLabel("ask")).toBe("需要确认");
    expect(formatLimeCorePolicyDecisionLabel("deny")).toBe("已阻断");
    expect(formatLimeCorePolicyDecisionLabel("not_evaluated")).toBe("未评估");
    expect(formatLimeCorePolicyDecisionLabel(" custom ")).toBe("custom");
    expect(formatLimeCorePolicyDecisionLabel()).toBe("未知决策");
  });

  it("应格式化人工审核决策展示标签", () => {
    expect(
      formatReviewDecisionArtifactKindLabel("review_decision_markdown"),
    ).toBe("Markdown");
    expect(formatReviewDecisionArtifactKindLabel("review_decision_json")).toBe(
      "JSON",
    );

    expect(formatReviewDecisionStatusLabel("accepted")).toBe("接受");
    expect(formatReviewDecisionStatusLabel("deferred")).toBe("延后");
    expect(formatReviewDecisionStatusLabel("rejected")).toBe("拒绝");
    expect(formatReviewDecisionStatusLabel("needs_more_evidence")).toBe(
      "需要更多证据",
    );
    expect(formatReviewDecisionStatusLabel("pending_review")).toBe(
      "待人工审核",
    );
    expect(formatReviewDecisionStatusLabel(" custom ")).toBe("custom");
    expect(formatReviewDecisionStatusLabel()).toBe("未知");

    expect(formatReviewDecisionRiskLevelLabel("low")).toBe("低");
    expect(formatReviewDecisionRiskLevelLabel("medium")).toBe("中");
    expect(formatReviewDecisionRiskLevelLabel("high")).toBe("高");
    expect(formatReviewDecisionRiskLevelLabel("unknown")).toBe("未定");
    expect(formatReviewDecisionRiskLevelLabel(" custom ")).toBe("custom");
    expect(formatReviewDecisionRiskLevelLabel()).toBe("未知");

    expect(formatPermissionConfirmationStatusLabel("denied")).toBe("已拒绝");
    expect(formatPermissionConfirmationStatusLabel("resolved")).toBe("已通过");
    expect(formatPermissionConfirmationStatusLabel("requested")).toBe(
      "等待确认",
    );
    expect(formatPermissionConfirmationStatusLabel("not_requested")).toBe(
      "未发起",
    );
    expect(formatPermissionConfirmationStatusLabel(" custom ")).toBe("custom");
    expect(formatPermissionConfirmationStatusLabel()).toBe("未导出");

    expect(formatReviewLimitStatusLabel("user_locked_capability_gap")).toBe(
      "模型锁定缺口",
    );
    expect(formatReviewLimitStatusLabel("normal")).toBe("正常");
    expect(formatReviewLimitStatusLabel(" custom ")).toBe("custom");
    expect(formatReviewLimitStatusLabel()).toBe("未导出");
  });
});
