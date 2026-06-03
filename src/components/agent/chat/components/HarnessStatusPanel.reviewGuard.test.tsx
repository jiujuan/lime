import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeReviewDecisionTemplate } from "@/lib/api/agentRuntime";
import {
  findButtonByText,
  mountHarnessElement,
  renderPanel,
  setInputValue,
  getHarnessPanelTestMocks,
} from "./HarnessStatusPanel.testFixtures";
import { RuntimeReviewDecisionDialog } from "./RuntimeReviewDecisionDialog";

const { exportAgentRuntimeAnalysisHandoffMock, mockToast } =
  getHarnessPanelTestMocks();

describe("HarnessStatusPanel reviewGuard", () => {
  it("人工审核弹窗应阻止模型锁定能力缺口保存为接受", async () => {
    const onSave = vi.fn();
    const template: AgentRuntimeReviewDecisionTemplate = {
      session_id: "session-review-user-lock",
      thread_id: "thread-review-user-lock",
      workspace_id: "workspace-review-user-lock",
      workspace_root: "/tmp/workspace-review-user-lock",
      review_relative_root:
        ".lime/harness/sessions/session-review-user-lock/review",
      review_absolute_root:
        "/tmp/workspace-review-user-lock/.lime/harness/sessions/session-review-user-lock/review",
      analysis_relative_root:
        ".lime/harness/sessions/session-review-user-lock/analysis",
      analysis_absolute_root:
        "/tmp/workspace-review-user-lock/.lime/harness/sessions/session-review-user-lock/analysis",
      handoff_bundle_relative_root:
        ".lime/harness/sessions/session-review-user-lock",
      evidence_pack_relative_root:
        ".lime/harness/sessions/session-review-user-lock/evidence",
      replay_case_relative_root:
        ".lime/harness/sessions/session-review-user-lock/replay",
      exported_at: "2026-05-06T10:00:00.000Z",
      title: "模型锁定能力缺口审核",
      thread_status: "failed",
      latest_turn_status: "failed",
      pending_request_count: 0,
      queued_turn_count: 0,
      default_decision_status: "pending_review",
      limit_status: "user_locked_capability_gap",
      capability_gap: "browser_reasoning_candidate_missing",
      user_locked_capability_summary:
        "显式用户模型锁定不满足当前 execution profile（capabilityGap=browser_reasoning_candidate_missing），不能作为成功交付证据。",
      permission_status: "not_required",
      permission_confirmation_status: "resolved",
      permission_confirmation_request_id: "approval-resolved",
      permission_confirmation_source: "runtime_action_required",
      permission_confirmation_summary:
        "已通过（request_id=approval-resolved, source=runtime_action_required）。",
      decision: {
        decision_status: "pending_review",
        decision_summary: "",
        chosen_fix_strategy: "",
        risk_level: "unknown",
        risk_tags: [],
        human_reviewer: "",
        reviewed_at: undefined,
        followup_actions: [],
        regression_requirements: [],
        notes: "",
      },
      decision_status_options: [
        "accepted",
        "deferred",
        "rejected",
        "needs_more_evidence",
        "pending_review",
      ],
      risk_level_options: ["low", "medium", "high", "unknown"],
      review_checklist: ["确认模型锁定缺口已解除后再接受。"],
      analysis_artifacts: [],
      artifacts: [],
    };
    mountHarnessElement(
      <RuntimeReviewDecisionDialog
        open
        template={template}
        saving={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const dialog = document.body.querySelector(
      '[role="dialog"]',
    ) as HTMLDivElement | null;
    expect(dialog?.textContent).toContain("模型锁定能力缺口");
    expect(dialog?.textContent).toContain(
      "browser_reasoning_candidate_missing",
    );
    expect(dialog?.textContent).toContain("不能作为成功交付证据");

    const statusSelect = document.body.querySelector(
      'select[aria-label="决策状态"]',
    ) as HTMLSelectElement | null;
    const acceptedOption = Array.from(statusSelect?.options ?? []).find(
      (option) => option.value === "accepted",
    );
    expect(acceptedOption?.disabled).toBe(true);

    await act(async () => {
      if (statusSelect) {
        setInputValue(statusSelect, "accepted");
      }
      await Promise.resolve();
    });

    const saveButton = findButtonByText("保存审核结果");
    expect(dialog?.textContent).toContain(
      "模型锁定能力缺口未解决时不能保存“接受”",
    );
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("一键复制给 AI 在未导出时应先自动导出再复制 copy_prompt", async () => {
    exportAgentRuntimeAnalysisHandoffMock.mockResolvedValue({
      session_id: "session-analysis-copy-1",
      thread_id: "thread-analysis-copy-1",
      workspace_id: "workspace-analysis-copy-1",
      workspace_root: "/tmp/workspace-analysis-copy-1",
      analysis_relative_root:
        ".lime/harness/sessions/session-analysis-copy-1/analysis",
      analysis_absolute_root:
        "/tmp/workspace-analysis-copy-1/.lime/harness/sessions/session-analysis-copy-1/analysis",
      handoff_bundle_relative_root:
        ".lime/harness/sessions/session-analysis-copy-1",
      evidence_pack_relative_root:
        ".lime/harness/sessions/session-analysis-copy-1/evidence",
      replay_case_relative_root:
        ".lime/harness/sessions/session-analysis-copy-1/replay",
      exported_at: "2026-03-27T10:10:00.000Z",
      title: "分析复制任务",
      thread_status: "running",
      latest_turn_status: "running",
      pending_request_count: 0,
      queued_turn_count: 0,
      sanitized_workspace_root: "/workspace/lime",
      copy_prompt: "# Lime 外部诊断与修复任务\n请直接开始诊断。\n",
      artifacts: [
        {
          kind: "analysis_brief",
          title: "外部分析简报",
          relative_path:
            ".lime/harness/sessions/session-analysis-copy-1/analysis/analysis-brief.md",
          absolute_path:
            "/tmp/workspace-analysis-copy-1/.lime/harness/sessions/session-analysis-copy-1/analysis/analysis-brief.md",
          bytes: 256,
        },
      ],
    });

    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-analysis-copy-1",
        workspaceId: "workspace-analysis-copy-1",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    const copyButton = document.body.querySelector(
      'button[aria-label="一键复制给 AI"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeAnalysisHandoffMock).toHaveBeenCalledWith(
      "session-analysis-copy-1",
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "# Lime 外部诊断与修复任务\n请直接开始诊断。\n",
    );
    expect(mockToast.success).toHaveBeenCalledWith("已复制 AI 诊断与修复指令");
  });
});
