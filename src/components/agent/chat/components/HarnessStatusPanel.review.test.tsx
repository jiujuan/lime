import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  findButtonByText,
  renderPanel,
  setInputValue,
  getHarnessPanelTestMocks,
} from "./HarnessStatusPanel.testFixtures";
import {
  conversationProjectionStore,
  selectAgentUiProjectionEventsByType,
  selectLatestAgentUiProjectionEventForEvidence,
} from "../projection/conversationProjectionStore";

const {
  exportAgentRuntimeReviewDecisionTemplateMock,
  mockToast,
  saveAgentRuntimeReviewDecisionMock,
} = getHarnessPanelTestMocks();

describe("HarnessStatusPanel review", () => {
  it("存在 sessionId 时应支持导出人工审核记录并展示审核模板与清单", async () => {
    exportAgentRuntimeReviewDecisionTemplateMock.mockResolvedValue({
      session_id: "session-review-1",
      thread_id: "thread-review-1",
      workspace_id: "workspace-review-1",
      workspace_root: "/tmp/workspace-review-1",
      review_relative_root: ".lime/harness/sessions/session-review-1/review",
      review_absolute_root:
        "/tmp/workspace-review-1/.lime/harness/sessions/session-review-1/review",
      analysis_relative_root:
        ".lime/harness/sessions/session-review-1/analysis",
      analysis_absolute_root:
        "/tmp/workspace-review-1/.lime/harness/sessions/session-review-1/analysis",
      handoff_bundle_relative_root: ".lime/harness/sessions/session-review-1",
      evidence_pack_relative_root:
        ".lime/harness/sessions/session-review-1/evidence",
      replay_case_relative_root:
        ".lime/harness/sessions/session-review-1/replay",
      exported_at: "2026-03-27T10:20:00.000Z",
      title: "把外部分析结论回挂为人工审核记录",
      thread_status: "waiting_request",
      latest_turn_status: "action_required",
      pending_request_count: 1,
      queued_turn_count: 0,
      default_decision_status: "pending_review",
      limit_status: "user_locked_capability_gap",
      capability_gap: "browser_reasoning_candidate_missing",
      user_locked_capability_summary:
        "显式用户模型锁定不满足当前 execution profile（capabilityGap=browser_reasoning_candidate_missing），不能作为成功交付证据。",
      permission_status: "requires_confirmation",
      permission_confirmation_status: "denied",
      permission_confirmation_request_id: "approval-denied",
      permission_confirmation_source: "runtime_action_required",
      permission_confirmation_summary:
        "已拒绝（request_id=approval-denied, source=runtime_action_required），不能作为成功交付证据。",
      verification_summary: {
        artifact_validator: {
          applicable: true,
          record_count: 1,
          issue_count: 2,
          repaired_count: 1,
          fallback_used_count: 0,
          outcome: "blocking_failure",
        },
        focus_verification_failure_outcomes: [
          "Artifact 校验存在 2 条未恢复 issues。",
        ],
        focus_verification_recovered_outcomes: [
          "Artifact 校验已恢复 1 个产物，fallback 0 次。",
        ],
      },
      decision: {
        decision_status: "pending_review",
        decision_summary: "",
        chosen_fix_strategy: "",
        risk_level: "unknown",
        risk_tags: [],
        human_reviewer: "",
        reviewed_at: undefined,
        followup_actions: [
          "先对照 analysis-context.json / evidence/runtime.json 核对当前验证失败焦点，再决定是继续修复还是补证据。",
          "复查 Artifact 校验相关产物，确认 issues / repaired / fallback 状态与最终结论一致。",
        ],
        regression_requirements: [
          "按 replay case 复现问题并确认修复后行为与预期一致。",
          "重新导出 evidence pack，确认 Artifact 校验摘要已更新。",
        ],
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
      review_checklist: [
        "先阅读 analysis-brief.md 与 analysis-context.json。",
        "确认最终决策由人工审核者填写。",
      ],
      analysis_artifacts: [
        {
          kind: "analysis_brief",
          title: "外部分析简报",
          relative_path:
            ".lime/harness/sessions/session-review-1/analysis/analysis-brief.md",
          absolute_path:
            "/tmp/workspace-review-1/.lime/harness/sessions/session-review-1/analysis/analysis-brief.md",
          bytes: 320,
        },
      ],
      artifacts: [
        {
          kind: "review_decision_markdown",
          title: "人工审核记录",
          relative_path:
            ".lime/harness/sessions/session-review-1/review/review-decision.md",
          absolute_path:
            "/tmp/workspace-review-1/.lime/harness/sessions/session-review-1/review/review-decision.md",
          bytes: 512,
        },
        {
          kind: "review_decision_json",
          title: "人工审核记录 JSON",
          relative_path:
            ".lime/harness/sessions/session-review-1/review/review-decision.json",
          absolute_path:
            "/tmp/workspace-review-1/.lime/harness/sessions/session-review-1/review/review-decision.json",
          bytes: 256,
        },
      ],
    });

    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-review-1",
        workspaceId: "workspace-review-1",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    const exportButton = document.body.querySelector(
      'button[aria-label="导出人工审核记录"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      exportButton?.click();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeReviewDecisionTemplateMock).toHaveBeenCalledWith(
      "session-review-1",
    );
    expect(document.body.textContent).toContain("人工审核记录");
    expect(document.body.textContent).toContain("待人工审核");
    expect(document.body.textContent).toContain("权限确认");
    expect(document.body.textContent).toContain("权限确认已拒绝");
    expect(document.body.textContent).toContain("模型锁定能力缺口");
    expect(document.body.textContent).toContain(
      "browser_reasoning_candidate_missing",
    );
    expect(document.body.textContent).toContain("approval-denied");
    expect(document.body.textContent).toContain("不能作为成功交付证据");
    expect(document.body.textContent).toContain(
      ".lime/harness/sessions/session-review-1/review/review-decision.md",
    );
    expect(document.body.textContent).toContain(
      ".lime/harness/sessions/session-review-1/analysis/analysis-brief.md",
    );
    expect(document.body.textContent).toContain(
      "确认最终决策由人工审核者填写。",
    );
    expect(document.body.textContent).toContain("验证结果");
    expect(document.body.textContent).toContain("阻塞失败");
    expect(document.body.textContent).toContain(
      "Artifact 校验存在 2 条未恢复 issues。",
    );
    expect(document.body.textContent).toContain(
      "先对照 analysis-context.json / evidence/runtime.json 核对当前验证失败焦点",
    );
    expect(document.body.textContent).toContain(
      "重新导出 evidence pack，确认 Artifact 校验摘要已更新。",
    );
    expect(document.body.textContent).toContain("aster-rust");
    expect(
      selectAgentUiProjectionEventsByType(
        conversationProjectionStore.getSnapshot(),
        "task.changed",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceType: "team_control_projection",
        sessionId: "session-review-1",
        taskId: ".lime/harness/sessions/session-review-1/review",
        reviewId: ".lime/harness/sessions/session-review-1/review",
        workItemId: ".lime/harness/sessions/session-review-1/review",
        surface: "review_lane",
        control: "request_review",
        runtimeEntity: "work_item",
      }),
    ]);
    expect(
      selectLatestAgentUiProjectionEventForEvidence(
        conversationProjectionStore.getSnapshot(),
        ".lime/harness/sessions/session-review-1/review",
      ),
    ).toMatchObject({
      type: "review.requested",
      payload: {
        regressionOutcome: "blocking_failure",
        regressionFailureOutcomes: ["Artifact 校验存在 2 条未恢复 issues。"],
        requestedFixes: [
          "先对照 analysis-context.json / evidence/runtime.json 核对当前验证失败焦点，再决定是继续修复还是补证据。",
          "复查 Artifact 校验相关产物，确认 issues / repaired / fallback 状态与最终结论一致。",
        ],
        regressionRequirements: [
          "按 replay case 复现问题并确认修复后行为与预期一致。",
          "重新导出 evidence pack，确认 Artifact 校验摘要已更新。",
        ],
      },
    });
    expect(mockToast.success).toHaveBeenCalledWith("已导出 2 个人工审核文件");
  });

  it("应支持填写并保存人工审核结果", async () => {
    exportAgentRuntimeReviewDecisionTemplateMock.mockResolvedValue({
      session_id: "session-review-2",
      thread_id: "thread-review-2",
      workspace_id: "workspace-review-2",
      workspace_root: "/tmp/workspace-review-2",
      review_relative_root: ".lime/harness/sessions/session-review-2/review",
      review_absolute_root:
        "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/review",
      analysis_relative_root:
        ".lime/harness/sessions/session-review-2/analysis",
      analysis_absolute_root:
        "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/analysis",
      handoff_bundle_relative_root: ".lime/harness/sessions/session-review-2",
      evidence_pack_relative_root:
        ".lime/harness/sessions/session-review-2/evidence",
      replay_case_relative_root:
        ".lime/harness/sessions/session-review-2/replay",
      exported_at: "2026-03-27T10:28:00.000Z",
      title: "把外部分析结论回挂为人工审核记录",
      thread_status: "waiting_request",
      latest_turn_status: "action_required",
      pending_request_count: 1,
      queued_turn_count: 0,
      default_decision_status: "pending_review",
      permission_status: "requires_confirmation",
      permission_confirmation_status: "denied",
      permission_confirmation_request_id: "approval-denied-dialog",
      permission_confirmation_source: "runtime_action_required",
      permission_confirmation_summary:
        "已拒绝（request_id=approval-denied-dialog），不能作为成功交付证据。",
      verification_summary: {
        artifact_validator: {
          applicable: true,
          record_count: 1,
          issue_count: 1,
          repaired_count: 0,
          fallback_used_count: 0,
          outcome: "blocking_failure",
        },
        focus_verification_failure_outcomes: [
          "Artifact 校验存在 1 条未恢复 issue。",
        ],
        focus_verification_recovered_outcomes: [],
      },
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
      review_checklist: ["先阅读 analysis-brief.md 与 analysis-context.json。"],
      analysis_artifacts: [
        {
          kind: "analysis_brief",
          title: "外部分析简报",
          relative_path:
            ".lime/harness/sessions/session-review-2/analysis/analysis-brief.md",
          absolute_path:
            "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/analysis/analysis-brief.md",
          bytes: 320,
        },
      ],
      artifacts: [
        {
          kind: "review_decision_markdown",
          title: "人工审核记录",
          relative_path:
            ".lime/harness/sessions/session-review-2/review/review-decision.md",
          absolute_path:
            "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/review/review-decision.md",
          bytes: 512,
        },
      ],
    });
    saveAgentRuntimeReviewDecisionMock.mockResolvedValue({
      session_id: "session-review-2",
      thread_id: "thread-review-2",
      workspace_id: "workspace-review-2",
      workspace_root: "/tmp/workspace-review-2",
      review_relative_root: ".lime/harness/sessions/session-review-2/review",
      review_absolute_root:
        "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/review",
      analysis_relative_root:
        ".lime/harness/sessions/session-review-2/analysis",
      analysis_absolute_root:
        "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/analysis",
      handoff_bundle_relative_root: ".lime/harness/sessions/session-review-2",
      evidence_pack_relative_root:
        ".lime/harness/sessions/session-review-2/evidence",
      replay_case_relative_root:
        ".lime/harness/sessions/session-review-2/replay",
      exported_at: "2026-03-27T10:32:00.000Z",
      title: "把外部分析结论回挂为人工审核记录",
      thread_status: "waiting_request",
      latest_turn_status: "action_required",
      pending_request_count: 1,
      queued_turn_count: 0,
      default_decision_status: "pending_review",
      permission_status: "requires_confirmation",
      permission_confirmation_status: "denied",
      permission_confirmation_request_id: "approval-denied-dialog",
      permission_confirmation_source: "runtime_action_required",
      permission_confirmation_summary:
        "已拒绝（request_id=approval-denied-dialog），不能作为成功交付证据。",
      verification_summary: {
        artifact_validator: {
          applicable: true,
          record_count: 1,
          issue_count: 0,
          repaired_count: 1,
          fallback_used_count: 0,
          outcome: "recovered",
        },
        focus_verification_failure_outcomes: [],
        focus_verification_recovered_outcomes: [
          "Artifact 校验已恢复 1 个产物，fallback 0 次。",
        ],
        requested_fix_execution_results: [
          {
            requested_fix: "处理 approval-denied-dialog",
            requested_fix_index: 1,
            execution_status: "completed",
            regression_outcome: "recovered",
            summary_preview: "已处理权限确认后重新导出 evidence pack。",
            result_ref:
              "agent-runtime://session/session-review-2/thread/thread-review-2/turn/turn-review/item/item-fix-1",
            artifact_paths: [
              ".lime/harness/sessions/session-review-2/evidence/runtime.json",
            ],
          },
        ],
      },
      decision: {
        decision_status: "rejected",
        decision_summary: "权限确认已拒绝，拒绝本次交付。",
        chosen_fix_strategy: "先处理真实权限确认，再复验。",
        risk_level: "medium",
        risk_tags: ["runtime", "permission"],
        human_reviewer: "Lime Maintainer",
        reviewed_at: "2026-03-27T10:32:00.000Z",
        followup_actions: ["处理 approval-denied-dialog"],
        regression_requirements: ["npm run test:contracts", "人工审核回归"],
        notes: "拒绝状态来自真实权限确认。",
      },
      decision_status_options: [
        "accepted",
        "deferred",
        "rejected",
        "needs_more_evidence",
        "pending_review",
      ],
      risk_level_options: ["low", "medium", "high", "unknown"],
      review_checklist: ["先阅读 analysis-brief.md 与 analysis-context.json。"],
      analysis_artifacts: [
        {
          kind: "analysis_brief",
          title: "外部分析简报",
          relative_path:
            ".lime/harness/sessions/session-review-2/analysis/analysis-brief.md",
          absolute_path:
            "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/analysis/analysis-brief.md",
          bytes: 320,
        },
      ],
      artifacts: [
        {
          kind: "review_decision_markdown",
          title: "人工审核记录",
          relative_path:
            ".lime/harness/sessions/session-review-2/review/review-decision.md",
          absolute_path:
            "/tmp/workspace-review-2/.lime/harness/sessions/session-review-2/review/review-decision.md",
          bytes: 512,
        },
      ],
    });

    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-review-2",
        workspaceId: "workspace-review-2",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    const fillButton = document.body.querySelector(
      'button[aria-label="填写人工审核结果"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      fillButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const reviewDialog = document.body.querySelector(
      '[role="dialog"]',
    ) as HTMLDivElement | null;

    expect(reviewDialog?.textContent).toContain("验证结果");
    expect(reviewDialog?.textContent).toContain("阻塞失败");
    expect(reviewDialog?.textContent).toContain(
      "Artifact 校验存在 1 条未恢复 issue。",
    );
    expect(reviewDialog?.textContent).toContain("权限确认");
    expect(reviewDialog?.textContent).toContain("已拒绝");
    expect(reviewDialog?.textContent).toContain("approval-denied-dialog");
    expect(reviewDialog?.textContent).toContain("不能作为成功交付证据");

    const statusSelect = document.body.querySelector(
      'select[aria-label="决策状态"]',
    ) as HTMLSelectElement | null;
    const riskSelect = document.body.querySelector(
      'select[aria-label="风险等级"]',
    ) as HTMLSelectElement | null;
    const reviewerInput = document.body.querySelector(
      'input[aria-label="审核人"]',
    ) as HTMLInputElement | null;
    const riskTagsInput = document.body.querySelector(
      'input[aria-label="风险标签"]',
    ) as HTMLInputElement | null;
    const summaryTextarea = document.body.querySelector(
      'textarea[aria-label="决策摘要"]',
    ) as HTMLTextAreaElement | null;
    const strategyTextarea = document.body.querySelector(
      'textarea[aria-label="采用的修复策略"]',
    ) as HTMLTextAreaElement | null;
    const regressionsTextarea = document.body.querySelector(
      'textarea[aria-label="回归要求"]',
    ) as HTMLTextAreaElement | null;
    const followupsTextarea = document.body.querySelector(
      'textarea[aria-label="后续动作"]',
    ) as HTMLTextAreaElement | null;
    const notesTextarea = document.body.querySelector(
      'textarea[aria-label="审核备注"]',
    ) as HTMLTextAreaElement | null;

    await act(async () => {
      if (statusSelect) {
        setInputValue(statusSelect, "accepted");
      }
      if (riskSelect) {
        setInputValue(riskSelect, "medium");
      }
      if (reviewerInput) {
        setInputValue(reviewerInput, "Lime Maintainer");
      }
      if (riskTagsInput) {
        setInputValue(riskTagsInput, "runtime, permission");
      }
      if (summaryTextarea) {
        setInputValue(summaryTextarea, "权限确认已拒绝，拒绝本次交付。");
      }
      if (strategyTextarea) {
        setInputValue(strategyTextarea, "先处理真实权限确认，再复验。");
      }
      if (regressionsTextarea) {
        setInputValue(
          regressionsTextarea,
          "npm run test:contracts\n人工审核回归",
        );
      }
      if (followupsTextarea) {
        setInputValue(followupsTextarea, "处理 approval-denied-dialog");
      }
      if (notesTextarea) {
        setInputValue(notesTextarea, "拒绝状态来自真实权限确认。");
      }
      await Promise.resolve();
    });

    const saveButton = findButtonByText("保存审核结果");
    const acceptedOption = Array.from(statusSelect?.options ?? []).find(
      (option) => option.value === "accepted",
    );
    expect(acceptedOption?.disabled).toBe(true);
    expect(reviewDialog?.textContent).toContain(
      "权限确认未解决时不能保存“接受”",
    );
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveAgentRuntimeReviewDecisionMock).not.toHaveBeenCalled();

    await act(async () => {
      if (statusSelect) {
        setInputValue(statusSelect, "rejected");
      }
      await Promise.resolve();
    });
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeReviewDecisionTemplateMock).toHaveBeenCalledWith(
      "session-review-2",
    );
    expect(saveAgentRuntimeReviewDecisionMock).toHaveBeenCalledWith({
      session_id: "session-review-2",
      decision_status: "rejected",
      decision_summary: "权限确认已拒绝，拒绝本次交付。",
      chosen_fix_strategy: "先处理真实权限确认，再复验。",
      risk_level: "medium",
      risk_tags: ["runtime", "permission"],
      human_reviewer: "Lime Maintainer",
      reviewed_at: undefined,
      followup_actions: ["处理 approval-denied-dialog"],
      regression_requirements: ["npm run test:contracts", "人工审核回归"],
      notes: "拒绝状态来自真实权限确认。",
    });
    expect(document.body.textContent).toContain("当前人工审核结论");
    expect(document.body.textContent).toContain(
      "权限确认已拒绝，拒绝本次交付。",
    );
    expect(document.body.textContent).toContain("Lime Maintainer");
    expect(document.body.textContent).toContain("处理 approval-denied-dialog");
    const requestedFixTask = selectAgentUiProjectionEventsByType(
      conversationProjectionStore.getSnapshot(),
      "task.changed",
    )
      .slice()
      .reverse()
      .find((event) => event.payload?.taskEvent === "review_requested_fix");
    expect(requestedFixTask).toMatchObject({
      type: "task.changed",
      sessionId: "session-review-2",
      threadId: "thread-review-2",
      taskId: ".lime/harness/sessions/session-review-2/review:requested-fix:1",
      workItemId:
        ".lime/harness/sessions/session-review-2/review:requested-fix:1",
      reviewId: ".lime/harness/sessions/session-review-2/review",
      surface: "work_board",
      control: "open_detail",
      runtimeEntity: "work_item",
      runtimeStatus: "completed",
      payload: {
        taskEvent: "review_requested_fix",
        executionStatus: "completed",
        regressionOutcome: "recovered",
        regressionRecoveredOutcomes: [
          "Artifact 校验已恢复 1 个产物，fallback 0 次。",
        ],
        regressionRequirements: ["npm run test:contracts", "人工审核回归"],
        executionSummaryPreview: "已处理权限确认后重新导出 evidence pack。",
        executionResultRef:
          "agent-runtime://session/session-review-2/thread/thread-review-2/turn/turn-review/item/item-fix-1",
        executionArtifactPaths: [
          ".lime/harness/sessions/session-review-2/evidence/runtime.json",
        ],
      },
    });
    expect(mockToast.success).toHaveBeenCalledWith("已保存人工审核结果");
  });
});
