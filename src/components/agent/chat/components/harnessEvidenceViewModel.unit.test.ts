import { describe, expect, it } from "vitest";
import type {
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidencePack,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
} from "@/lib/api/agentRuntime/evidenceTypes";

import {
  buildBrowserReplayArtifact,
  buildReplayEvalCommand,
  buildReplayPromotionCommand,
  buildReplayPromotionContext,
  buildReplayTrendCommand,
  collectLimeCorePolicyMissingInputs,
  collectLimeCorePolicyRefKeys,
  filterBrowserActionIndexItems,
  formatAnalysisArtifactKindLabel,
  formatBrowserActionArtifactKindLabel,
  formatBrowserActionStatusLabel,
  formatCompletionAuditDecisionLabel,
  formatEvidenceArtifactKindLabel,
  formatHandoffArtifactKindLabel,
  formatHandoffStatusLabel,
  formatIsoDateTime,
  formatLimeCorePolicyDecisionLabel,
  formatLimeCorePolicyInputSourceLabel,
  formatLimeCorePolicyInputStatusLabel,
  formatLimeCorePolicyStatusLabel,
  formatPermissionConfirmationStatusLabel,
  formatReplayArtifactKindLabel,
  formatReviewDecisionArtifactKindLabel,
  formatReviewDecisionRiskLevelLabel,
  formatReviewDecisionStatusLabel,
  formatReviewLimitStatusLabel,
  formatSize,
  formatUnixTimestamp,
  quoteShellArg,
  resolveReviewDecisionRegressionFacts,
  slugifyHarnessCase,
  summarizeLimeCorePolicyDecision,
  uniqueNonEmptyStrings,
} from "./harnessEvidenceViewModel";

describe("harnessEvidenceViewModel", () => {
  it("应格式化交接、证据和文件制品展示辅助信息", () => {
    const timestamp = 1_779_714_000;
    const isoDateTime = "2026-05-26T11:00:00.000Z";

    expect(formatUnixTimestamp()).toBe("未知");
    expect(formatUnixTimestamp(timestamp)).toBe(
      new Date(timestamp * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    expect(formatIsoDateTime()).toBe("未知");
    expect(formatIsoDateTime("not-a-date")).toBe("not-a-date");
    expect(formatIsoDateTime(isoDateTime)).toBe(
      new Date(isoDateTime).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );

    expect(formatSize()).toBeNull();
    expect(formatSize(0)).toBeNull();
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(1_572_864)).toBe("1.5 MB");

    expect(formatHandoffStatusLabel("waiting_request")).toBe("等待请求");
    expect(formatHandoffStatusLabel(" interrupted ")).toBe("已中断");
    expect(formatHandoffStatusLabel(" custom ")).toBe("custom");
    expect(formatHandoffStatusLabel()).toBe("未知");
    expect(formatHandoffArtifactKindLabel("review_summary")).toBe("审查");
    expect(formatEvidenceArtifactKindLabel("timeline")).toBe("时间线");
    expect(formatBrowserActionArtifactKindLabel("browser_snapshot")).toBe(
      "browser_snapshot",
    );
    expect(formatBrowserActionArtifactKindLabel(" custom_artifact ")).toBe(
      "custom_artifact",
    );
    expect(formatBrowserActionArtifactKindLabel()).toBe("未知产物");
  });

  it("应汇总 LimeCore policy 引用、缺失输入和决策展示", () => {
    const index: AgentRuntimeEvidenceLimeCorePolicyIndex = {
      snapshot_count: 2,
      ref_keys: [" limecore.project ", "limecore.project"],
      missing_inputs: [" token ", ""],
      pending_hit_refs: [],
      policy_value_hit_count: 0,
      status_counts: [],
      decision_counts: [
        { decision: "allow", count: 2 },
        { decision: " ask ", count: 1 },
        { decision: " ", count: 99 },
      ],
      items: [
        {
          refs: ["limecore.user", " limecore.project "],
          missing_inputs: [" token ", "profile"],
          unresolved_refs: [" limecore.missing "],
        },
      ],
    };

    expect(formatLimeCorePolicyInputStatusLabel("declared_only")).toBe(
      "仅声明",
    );
    expect(formatLimeCorePolicyInputStatusLabel(" custom ")).toBe("custom");
    expect(formatLimeCorePolicyInputStatusLabel()).toBe("未知");
    expect(formatLimeCorePolicyInputSourceLabel("limecore_pending")).toBe(
      "等待 LimeCore",
    );
    expect(formatLimeCorePolicyInputSourceLabel(" custom_source ")).toBe(
      "custom_source",
    );
    expect(formatLimeCorePolicyInputSourceLabel()).toBe("未知来源");

    expect(uniqueNonEmptyStrings([" a ", "", undefined, "a", "b"])).toEqual([
      "a",
      "b",
    ]);
    expect(collectLimeCorePolicyRefKeys(index)).toEqual([
      "limecore.project",
      "limecore.user",
    ]);
    expect(collectLimeCorePolicyMissingInputs(index)).toEqual([
      "token",
      "profile",
      "limecore.missing",
    ]);
    expect(summarizeLimeCorePolicyDecision(index)).toBe(
      "本地允许 2 / 需要确认 1",
    );
    expect(
      summarizeLimeCorePolicyDecision({
        ...index,
        decision_counts: [{ decision: "deny", count: 1 }],
      }),
    ).toBe("已阻断");
    expect(
      summarizeLimeCorePolicyDecision({
        ...index,
        decision_counts: [{ decision: " ", count: 1 }],
      }),
    ).toBe("未评估");
  });

  it("应构建审核回归事实和 replay 推广命令", () => {
    const replayCase = {
      session_id: "session 42",
    } as AgentRuntimeReplayCase;
    const verificationSummary = {
      artifact_validator: {
        applicable: true,
        record_count: 3,
        issue_count: 1,
        repaired_count: 0,
        fallback_used_count: 0,
        outcome: "recovered",
      },
      focus_verification_failure_outcomes: ["unit_failed"],
      focus_verification_recovered_outcomes: ["typecheck_recovered"],
      requested_fix_execution_results: [
        {
          requested_fix: "补测试",
          requested_fix_index: 0,
          execution_status: "completed",
          regression_outcome: "recovered",
          summary_preview: "已恢复",
          result_ref: "artifact://result",
          artifact_ids: ["artifact-1"],
          artifact_paths: ["/tmp/result.md"],
        },
      ],
    } satisfies AgentRuntimeReviewDecisionTemplate["verification_summary"];

    expect(resolveReviewDecisionRegressionFacts(verificationSummary)).toEqual({
      regressionOutcome: "blocking_failure",
      regressionFailureOutcomes: ["unit_failed"],
      regressionRecoveredOutcomes: ["typecheck_recovered"],
      requestedFixExecutionResults: [
        {
          requestedFix: "补测试",
          requestedFixIndex: 0,
          executionStatus: "completed",
          regressionOutcome: "recovered",
          summaryPreview: "已恢复",
          resultRef: "artifact://result",
          artifactIds: ["artifact-1"],
          artifactPaths: ["/tmp/result.md"],
        },
      ],
    });
    expect(
      resolveReviewDecisionRegressionFacts({
        ...verificationSummary,
        focus_verification_failure_outcomes: [],
      }).regressionOutcome,
    ).toBe("recovered");

    expect(formatReplayArtifactKindLabel("evidence_links")).toBe("证据链接");
    expect(formatAnalysisArtifactKindLabel("analysis_context")).toBe("上下文");
    expect(slugifyHarnessCase(" Fix: Browser Flow #42 ")).toBe(
      "fix-browser-flow-42",
    );
    expect(slugifyHarnessCase("中文标题")).toBe("replay-case");
    expect(quoteShellArg('session "42"')).toBe('"session \\"42\\""');

    expect(
      buildReplayPromotionContext({
        replayCase,
        analysisTitle: " 分析标题 ",
        reviewTitle: " 审核标题 ",
      }),
    ).toEqual({
      suiteId: "repo-promoted-replays",
      title: "审核标题",
      slug: "replay-case",
    });
    expect(
      buildReplayPromotionContext({
        replayCase,
        analysisTitle: "Browser Flow 42",
      }),
    ).toEqual({
      suiteId: "repo-promoted-replays",
      title: "Browser Flow 42",
      slug: "browser-flow-42",
    });
    expect(buildReplayPromotionCommand({ replayCase })).toBe(
      'npm run harness:eval:promote -- --session-id "session 42" --slug "session-42" --title "Replay case session 42"',
    );
    expect(buildReplayEvalCommand()).toBe("npm run harness:eval");
    expect(buildReplayTrendCommand()).toBe("npm run harness:eval:trend");
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
    expect(formatBrowserActionStatusLabel({ status: "   " })).toBe("未知状态");
  });

  it("应构建浏览器复盘 artifact", () => {
    const evidencePack: AgentRuntimeEvidencePack = {
      session_id: "session-1",
      thread_id: "thread-1",
      workspace_root: "/tmp/workspace",
      pack_relative_root: "evidence/session-1",
      pack_absolute_root: "/tmp/workspace/evidence/session-1",
      exported_at: "2026-05-26T11:00:00.000Z",
      thread_status: "completed",
      turn_count: 1,
      item_count: 1,
      pending_request_count: 0,
      queued_turn_count: 0,
      recent_artifact_count: 1,
      known_gaps: [],
      artifacts: [],
    };
    const index: AgentRuntimeEvidenceBrowserActionIndex = {
      action_count: 1,
      session_count: 1,
      observation_count: 1,
      screenshot_count: 1,
      last_url: "https://example.test",
      thread_ids: ["thread-1"],
      turn_ids: ["turn-1"],
      content_ids: ["content-browser-1"],
      session_ids: ["browser-session-1"],
      target_ids: ["target-1"],
      profile_keys: ["profile-1"],
      status_counts: [],
      artifact_kind_counts: [],
      action_counts: [],
      backend_counts: [],
      executor_counts: [{ executor: "mcp__lime-browser", count: 1 }],
      items: [
        {
          artifact_kind: "browser_snapshot",
          tool_name: "browser_navigate",
          action: "navigate",
          action_id: "browser-action-1",
          status: "completed",
          success: true,
          session_id: "browser-session-1",
          target_id: "target-1",
          tab_id: "target-1",
          profile_key: "profile-1",
          backend: "playwright",
          request_id: "request-1",
          confirmation_request_id: "browser-confirm-1",
          control_mode: "human",
          lifecycle_state: "human_controlling",
          human_reason: "browser_action_requires_confirmation",
          thread_id: "thread-1",
          turn_id: "turn-1",
          content_id: "content-browser-1",
          executor: "mcp__lime-browser",
          evidence_refs: [
            "browser_session:browser-session-1",
            "browser_action:browser-session-1:browser-action-1",
          ],
          last_url: "https://example.test",
          title: "Example",
          entry_source: "runtime",
          observation_available: true,
          screenshot_available: true,
        },
      ],
    };

    const artifact = buildBrowserReplayArtifact(evidencePack, index);
    expect(artifact).toMatchObject({
      id: "browser-replay:session-1",
      type: "browser_assist",
      title: "Browser Assist 复盘",
      status: "complete",
      meta: {
        modalityContractKey: "browser_control",
        viewerSurface: "browser_replay_viewer",
        evidencePackRoot: "evidence/session-1",
        sessionId: "browser-session-1",
        profileKey: "profile-1",
        targetId: "target-1",
        url: "https://example.test",
        browserActionIndex: {
          actionCount: 1,
          sessionCount: 1,
          observationCount: 1,
          screenshotCount: 1,
          threadIds: ["thread-1"],
          turnIds: ["turn-1"],
          contentIds: ["content-browser-1"],
          executorCounts: [{ executor: "mcp__lime-browser", count: 1 }],
          items: [
            {
              artifactKind: "browser_snapshot",
              toolName: "browser_navigate",
              action: "navigate",
              actionId: "browser-action-1",
              threadId: "thread-1",
              turnId: "turn-1",
              contentId: "content-browser-1",
              executor: "mcp__lime-browser",
              tabId: "target-1",
              confirmationRequestId: "browser-confirm-1",
              controlMode: "human",
              lifecycleState: "human_controlling",
              humanReason: "browser_action_requires_confirmation",
              evidenceRefs: [
                "browser_session:browser-session-1",
                "browser_action:browser-session-1:browser-action-1",
              ],
              success: true,
              observationAvailable: true,
              screenshotAvailable: true,
            },
          ],
        },
      },
    });
    expect(artifact.createdAt).toBe(Date.parse(evidencePack.exported_at));
    expect(artifact.updatedAt).toBe(Date.parse(evidencePack.exported_at));
  });

  it("应按 thread / turn / content / executor 查询浏览器 action trace", () => {
    const index: AgentRuntimeEvidenceBrowserActionIndex = {
      action_count: 2,
      session_count: 1,
      observation_count: 2,
      screenshot_count: 1,
      thread_ids: ["thread-1", "thread-2"],
      turn_ids: ["turn-1", "turn-2"],
      content_ids: ["content-1", "content-2"],
      session_ids: ["browser-session-1"],
      target_ids: ["target-1"],
      profile_keys: ["profile-1"],
      status_counts: [],
      artifact_kind_counts: [],
      action_counts: [],
      backend_counts: [],
      executor_counts: [
        { executor: "mcp__lime-browser", count: 1 },
        { executor: "human", count: 1 },
      ],
      items: [
        {
          action_id: "browser-action-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          content_id: "content-1",
          executor: "mcp__lime-browser",
        },
        {
          action_id: "browser-action-2",
          thread_id: "thread-2",
          turn_id: "turn-2",
          content_id: "content-2",
          executor: "human",
        },
      ],
    };

    expect(
      filterBrowserActionIndexItems(index, { threadId: "thread-1" }).map(
        (item) => item.action_id,
      ),
    ).toEqual(["browser-action-1"]);
    expect(
      filterBrowserActionIndexItems(index, {
        turnId: "turn-2",
        executor: "human",
      }).map((item) => item.action_id),
    ).toEqual(["browser-action-2"]);
    expect(
      filterBrowserActionIndexItems(index, {
        contentId: "content-1",
        executor: "human",
      }),
    ).toEqual([]);
  });

  it("应格式化 LimeCore policy 状态和决策", () => {
    expect(formatLimeCorePolicyStatusLabel("local_defaults_evaluated")).toBe(
      "本地默认已评估",
    );
    expect(formatLimeCorePolicyStatusLabel("refs_declared")).toBe("已声明引用");
    expect(formatLimeCorePolicyStatusLabel("not_evaluated")).toBe("尚未评估");
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
