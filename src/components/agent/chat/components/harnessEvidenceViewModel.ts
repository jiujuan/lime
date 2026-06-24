import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceBrowserActionItem,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
} from "@/lib/api/agentRuntime";
import type { Artifact } from "@/lib/artifact/types";

export interface ReviewDecisionRegressionFacts {
  regressionOutcome?: "blocking_failure" | "recovered";
  regressionFailureOutcomes?: string[];
  regressionRecoveredOutcomes?: string[];
  requestedFixExecutionResults?: Array<{
    requestedFix?: string;
    requestedFixIndex?: number;
    executionStatus?:
      | "pending"
      | "assigned"
      | "running"
      | "completed"
      | "failed"
      | "blocked"
      | "cancelled";
    regressionOutcome?: string;
    summaryPreview?: string;
    resultRef?: string;
    artifactIds?: string[];
    artifactPaths?: string[];
  }>;
}

export interface ReplayPromotionContext {
  suiteId: string;
  title: string;
  slug: string;
}

export function formatUnixTimestamp(value?: number): string {
  if (!value) {
    return "未知";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatIsoDateTime(value?: string): string {
  if (!value) {
    return "未知";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveReviewDecisionRegressionFacts(
  verificationSummary?:
    | AgentRuntimeReviewDecisionTemplate["verification_summary"]
    | null,
): ReviewDecisionRegressionFacts {
  const regressionFailureOutcomes =
    verificationSummary?.focus_verification_failure_outcomes;
  const regressionRecoveredOutcomes =
    verificationSummary?.focus_verification_recovered_outcomes;
  const artifactOutcome = verificationSummary?.artifact_validator?.outcome;
  const regressionOutcome = regressionFailureOutcomes?.length
    ? "blocking_failure"
    : regressionRecoveredOutcomes?.length
      ? "recovered"
      : artifactOutcome === "blocking_failure" ||
          artifactOutcome === "recovered"
        ? artifactOutcome
        : undefined;

  return {
    regressionOutcome,
    regressionFailureOutcomes,
    regressionRecoveredOutcomes,
    requestedFixExecutionResults: (
      verificationSummary?.requested_fix_execution_results ?? []
    ).map((result) => ({
      requestedFix: result.requested_fix,
      requestedFixIndex: result.requested_fix_index,
      executionStatus: result.execution_status,
      regressionOutcome: result.regression_outcome,
      summaryPreview: result.summary_preview,
      resultRef: result.result_ref,
      artifactIds: result.artifact_ids,
      artifactPaths: result.artifact_paths,
    })),
  };
}

export function formatSize(value?: number): string | null {
  if (!value || value <= 0) {
    return null;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

export function formatHandoffStatusLabel(value?: string | null): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "未知";
  }

  switch (normalized) {
    case "idle":
      return "空闲";
    case "pending":
      return "待处理";
    case "queued":
      return "排队中";
    case "running":
      return "处理中";
    case "waiting_request":
      return "等待请求";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "interrupting":
      return "中断中";
    case "interrupted":
      return "已中断";
    default:
      return normalized;
  }
}

export function formatHandoffArtifactKindLabel(
  kind: AgentRuntimeHandoffBundle["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "plan":
      return "计划";
    case "progress":
      return "进度";
    case "handoff":
      return "交接";
    case "review_summary":
      return "审查";
    default:
      return kind;
  }
}

export function formatEvidenceArtifactKindLabel(
  kind: AgentRuntimeEvidencePack["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "summary":
      return "摘要";
    case "runtime":
      return "运行时";
    case "timeline":
      return "时间线";
    case "artifacts":
      return "产物";
    default:
      return kind;
  }
}

export function formatBrowserActionArtifactKindLabel(kind?: string): string {
  switch (kind?.trim()) {
    case "browser_session":
      return "browser_session";
    case "browser_snapshot":
      return "browser_snapshot";
    default:
      return kind?.trim() || "未知产物";
  }
}

export function formatLimeCorePolicyInputStatusLabel(value?: string): string {
  switch (value?.trim()) {
    case "declared_only":
      return "仅声明";
    default:
      return value?.trim() || "未知";
  }
}

export function formatLimeCorePolicyInputSourceLabel(value?: string): string {
  switch (value?.trim()) {
    case "limecore_pending":
      return "等待 LimeCore";
    default:
      return value?.trim() || "未知来源";
  }
}

export function uniqueNonEmptyStrings(
  values: Array<string | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function collectLimeCorePolicyRefKeys(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string[] {
  return uniqueNonEmptyStrings([
    ...index.ref_keys,
    ...index.items.flatMap((item) => item.refs),
  ]);
}

export function collectLimeCorePolicyMissingInputs(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string[] {
  return uniqueNonEmptyStrings([
    ...(index.missing_inputs ?? []),
    ...index.items.flatMap((item) => item.missing_inputs ?? []),
    ...index.items.flatMap((item) => item.unresolved_refs ?? []),
  ]);
}

export function summarizeLimeCorePolicyDecision(
  index: AgentRuntimeEvidenceLimeCorePolicyIndex,
): string {
  const decisionCounts = index.decision_counts.filter((entry) =>
    entry.decision.trim(),
  );
  if (decisionCounts.length === 0) {
    return "未评估";
  }
  if (decisionCounts.length === 1) {
    return formatLimeCorePolicyDecisionLabel(decisionCounts[0].decision);
  }
  return decisionCounts
    .map(
      (entry) =>
        `${formatLimeCorePolicyDecisionLabel(entry.decision)} ${entry.count}`,
    )
    .join(" / ");
}

export function formatReplayArtifactKindLabel(
  kind: AgentRuntimeReplayCase["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "input":
      return "输入";
    case "expected":
      return "期望";
    case "grader":
      return "评分";
    case "evidence_links":
      return "证据链接";
    default:
      return kind;
  }
}

export function formatAnalysisArtifactKindLabel(
  kind: AgentRuntimeAnalysisHandoff["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "analysis_brief":
      return "简报";
    case "analysis_context":
      return "上下文";
    default:
      return kind;
  }
}

export function slugifyHarnessCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "replay-case";
}

export function quoteShellArg(value: string): string {
  return JSON.stringify(value);
}

export function buildReplayPromotionContext(params: {
  replayCase: AgentRuntimeReplayCase;
  analysisTitle?: string | null;
  reviewTitle?: string | null;
}): ReplayPromotionContext {
  const titleSource =
    params.reviewTitle?.trim() ||
    params.analysisTitle?.trim() ||
    `Replay case ${params.replayCase.session_id}`;
  const slugSource =
    params.reviewTitle?.trim() ||
    params.analysisTitle?.trim() ||
    params.replayCase.session_id;

  return {
    suiteId: "repo-promoted-replays",
    title: titleSource,
    slug: slugifyHarnessCase(slugSource),
  };
}

export function buildReplayPromotionCommand(params: {
  replayCase: AgentRuntimeReplayCase;
  analysisTitle?: string | null;
  reviewTitle?: string | null;
}): string {
  const context = buildReplayPromotionContext(params);
  return [
    "npm run harness:eval:promote --",
    `--session-id ${quoteShellArg(params.replayCase.session_id)}`,
    `--slug ${quoteShellArg(context.slug)}`,
    `--title ${quoteShellArg(context.title)}`,
  ].join(" ");
}

export function buildReplayEvalCommand(): string {
  return "npm run harness:eval";
}

export function buildReplayTrendCommand(): string {
  return "npm run harness:eval:trend";
}

export function formatCompletionAuditDecisionLabel(
  decision?: string | null,
): string {
  switch (decision?.trim()) {
    case "completed":
      return "completed · 证据完成";
    case "blocked":
      return "blocked · 运行阻断";
    case "needs_input":
      return "needs_input · 等待输入";
    case "verifying":
      return "verifying · 等待审计";
    default:
      return decision?.trim() || "unknown";
  }
}

export function formatBrowserActionStatusLabel(
  item: Pick<AgentRuntimeEvidenceBrowserActionItem, "success" | "status">,
): string {
  if (item.success === true && !item.status) {
    return "成功";
  }
  if (item.success === false && !item.status) {
    return "失败";
  }

  switch (item.status?.trim()) {
    case "completed":
    case "success":
    case "succeeded":
      return "成功";
    case "failed":
    case "error":
      return "失败";
    case "running":
      return "执行中";
    case "pending":
      return "待处理";
    default:
      return item.status?.trim() || "未知状态";
  }
}

export interface BrowserActionIndexQuery {
  threadId?: string;
  turnId?: string;
  contentId?: string;
  executor?: string;
}

export function filterBrowserActionIndexItems(
  index: AgentRuntimeEvidenceBrowserActionIndex,
  query: BrowserActionIndexQuery,
): AgentRuntimeEvidenceBrowserActionItem[] {
  const normalizedQuery = {
    threadId: query.threadId?.trim(),
    turnId: query.turnId?.trim(),
    contentId: query.contentId?.trim(),
    executor: query.executor?.trim(),
  };
  return index.items.filter((item) => {
    if (
      normalizedQuery.threadId &&
      item.thread_id !== normalizedQuery.threadId
    ) {
      return false;
    }
    if (normalizedQuery.turnId && item.turn_id !== normalizedQuery.turnId) {
      return false;
    }
    if (
      normalizedQuery.contentId &&
      item.content_id !== normalizedQuery.contentId
    ) {
      return false;
    }
    if (
      normalizedQuery.executor &&
      item.executor !== normalizedQuery.executor
    ) {
      return false;
    }
    return true;
  });
}

export function buildBrowserReplayArtifact(
  evidencePack: AgentRuntimeEvidencePack,
  index: AgentRuntimeEvidenceBrowserActionIndex,
): Artifact {
  const timestamp = Date.parse(evidencePack.exported_at);
  return {
    id: `browser-replay:${evidencePack.session_id}`,
    type: "browser_assist",
    title: "Browser Assist 复盘",
    content: "",
    status: "complete",
    meta: {
      browserActionIndex: {
        actionCount: index.action_count,
        sessionCount: index.session_count,
        observationCount: index.observation_count,
        screenshotCount: index.screenshot_count,
        lastUrl: index.last_url,
        threadIds: index.thread_ids,
        turnIds: index.turn_ids,
        contentIds: index.content_ids,
        sessionIds: index.session_ids,
        targetIds: index.target_ids,
        profileKeys: index.profile_keys,
        executorCounts: index.executor_counts,
        items: index.items.map((item) => ({
          artifactKind: item.artifact_kind,
          toolName: item.tool_name,
          action: item.action,
          actionId: item.action_id,
          status: item.status,
          success: item.success,
          sessionId: item.session_id,
          targetId: item.target_id,
          tabId: item.tab_id,
          profileKey: item.profile_key,
          backend: item.backend,
          requestId: item.request_id,
          threadId: item.thread_id,
          turnId: item.turn_id,
          contentId: item.content_id,
          executor: item.executor,
          evidenceRefs: item.evidence_refs,
          lastUrl: item.last_url,
          title: item.title,
          entrySource: item.entry_source,
          observationAvailable: item.observation_available,
          screenshotAvailable: item.screenshot_available,
        })),
      },
      modalityContractKey: "browser_control",
      viewerSurface: "browser_replay_viewer",
      evidencePackRoot: evidencePack.pack_relative_root,
      sessionId: index.session_ids[0] || evidencePack.session_id,
      profileKey: index.profile_keys[0],
      targetId: index.target_ids[0],
      url: index.last_url,
    },
    position: { start: 0, end: 0 },
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    updatedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

export function formatLimeCorePolicyStatusLabel(value?: string): string {
  switch (value?.trim()) {
    case "local_defaults_evaluated":
      return "本地默认已评估";
    case "refs_declared":
      return "已声明引用";
    case "not_evaluated":
      return "尚未评估";
    default:
      return value?.trim() || "未知状态";
  }
}

export function formatLimeCorePolicyDecisionLabel(value?: string): string {
  switch (value?.trim()) {
    case "allow":
      return "本地允许";
    case "ask":
      return "需要确认";
    case "deny":
      return "已阻断";
    case "not_evaluated":
      return "未评估";
    default:
      return value?.trim() || "未知决策";
  }
}

export function formatReviewDecisionArtifactKindLabel(
  kind: AgentRuntimeReviewDecisionTemplate["artifacts"][number]["kind"],
): string {
  switch (kind) {
    case "review_decision_markdown":
      return "Markdown";
    case "review_decision_json":
      return "JSON";
    default:
      return kind;
  }
}

export function formatReviewDecisionStatusLabel(status?: string): string {
  switch (status?.trim()) {
    case "accepted":
      return "接受";
    case "deferred":
      return "延后";
    case "rejected":
      return "拒绝";
    case "needs_more_evidence":
      return "需要更多证据";
    case "pending_review":
      return "待人工审核";
    default:
      return status?.trim() || "未知";
  }
}

export function formatReviewDecisionRiskLevelLabel(riskLevel?: string): string {
  switch (riskLevel?.trim()) {
    case "low":
      return "低";
    case "medium":
      return "中";
    case "high":
      return "高";
    case "unknown":
      return "未定";
    default:
      return riskLevel?.trim() || "未知";
  }
}

export function formatPermissionConfirmationStatusLabel(
  status?: string,
): string {
  switch (status?.trim()) {
    case "denied":
      return "已拒绝";
    case "resolved":
      return "已通过";
    case "requested":
      return "等待确认";
    case "not_requested":
      return "未发起";
    default:
      return status?.trim() || "未导出";
  }
}

export function formatReviewLimitStatusLabel(status?: string): string {
  switch (status?.trim()) {
    case "user_locked_capability_gap":
      return "模型锁定缺口";
    case "normal":
      return "正常";
    default:
      return status?.trim() || "未导出";
  }
}
