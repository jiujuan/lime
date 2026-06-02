import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceBrowserActionItem,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeThreadReadModel,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import type { Artifact } from "@/lib/artifact/types";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type { ActionRequired } from "../types";
import type { HarnessSessionState } from "../utils/harnessState";
import { isRuntimeStatusDiagnosticsOnly } from "../utils/turnSummaryPresentation";
import {
  normalizeToolNameKey,
  resolveToolDisplayLabel,
} from "../utils/toolDisplayInfo";
import {
  buildWorkflowSummaryText,
  getWorkflowStatusLabel,
} from "../utils/workflowStepPresentation";
import {
  pickCommandFromArguments,
  pickPathFromArguments,
} from "./harnessStatusPanelTextParsing";

export * from "./harnessFileReviewViewModel";
export * from "./harnessOutputSignalViewModel";
export * from "./harnessToolInventoryViewModel";
export {
  createUrlPattern,
  findFirstUrl,
  isLikelyFilePath,
  normalizeUrlCandidate,
  pickCommandFromArguments,
  pickPathFromArguments,
  splitTextIntoSegments,
} from "./harnessStatusPanelTextParsing";
export type {
  NormalizedUrlCandidate,
  TextSegment,
} from "./harnessStatusPanelTextParsing";

export type HarnessStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export interface ChildSubagentSessionSummary {
  total: number;
  running: number;
  queued: number;
  active: number;
  settled: number;
  failed: number;
}

export type ApprovalRiskKind = "file_change" | "command" | "input" | "default";

export interface RuntimeTaskPresentation {
  title: string;
  summaryText: string;
  phaseLabel: string;
  statusLabel: string;
  progressLabel: string;
  stepStatus: StepStatus;
  checkpoints: string[];
}

export interface HarnessRuntimeFactSummary {
  decisionReason: string | null;
  fallbackChain: string[];
  oemPolicy: NonNullable<AgentRuntimeThreadReadModel["oem_policy"]> | null;
}

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

export function isFileMutationApproval(item: ActionRequired): boolean {
  const normalizedToolName = normalizeToolNameKey(item.toolName || "");
  return [
    "write",
    "writefile",
    "edit",
    "editfile",
    "multiedit",
    "createfile",
    "delete",
    "remove",
    "move",
    "patch",
    "applypatch",
  ].some((keyword) => normalizedToolName.includes(keyword));
}

export function resolveApprovalRiskKind(
  item: ActionRequired,
): ApprovalRiskKind {
  if (pickCommandFromArguments(item.arguments)) {
    return "command";
  }
  if (pickPathFromArguments(item.arguments) && isFileMutationApproval(item)) {
    return "file_change";
  }
  if (item.actionType === "ask_user" || item.actionType === "elicitation") {
    return "input";
  }
  return "default";
}

export function resolveApprovalActionLabelKey(item: ActionRequired): string {
  switch (item.actionType) {
    case "ask_user":
      return "agentChat.harness.approvals.action.askUser";
    case "elicitation":
      return "agentChat.harness.approvals.action.elicitation";
    case "tool_confirmation":
    default:
      return "agentChat.harness.approvals.action.tool";
  }
}

export function describeApproval(item: ActionRequired): string | undefined {
  const hints: string[] = [];

  if (item.toolName?.trim()) {
    hints.push(resolveFriendlyToolLabel(item.toolName) || item.toolName.trim());
  }

  const path = pickPathFromArguments(item.arguments);
  if (path) {
    hints.push(path);
  }

  const command = pickCommandFromArguments(item.arguments);
  if (command) {
    hints.push(command);
  }

  return hints.length > 0 ? hints.join(" · ") : undefined;
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

export function joinDisplayParts(
  parts: Array<string | null | undefined>,
): string | undefined {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return normalized.length > 0 ? normalized.join(" · ") : undefined;
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

const APPROVAL_RISK_LABEL_KEY_BY_KIND: Record<ApprovalRiskKind, string> = {
  file_change: "agentChat.harness.approvals.risk.file_change",
  command: "agentChat.harness.approvals.risk.command",
  input: "agentChat.harness.approvals.risk.input",
  default: "agentChat.harness.approvals.risk.default",
};

export function resolveApprovalRiskLabelKey(
  kind: ApprovalRiskKind,
): string {
  return APPROVAL_RISK_LABEL_KEY_BY_KIND[kind] || kind;
}

export function resolveSubagentRuntimeStatusLabel(
  status?: AsterSubagentSessionInfo["runtime_status"],
): string {
  switch (status) {
    case "queued":
      return "稍后开始";
    case "running":
      return "处理中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "aborted":
      return "已暂停";
    case "idle":
    default:
      return "待开始";
  }
}

export function resolveSubagentRuntimeStatusVariant(
  status?: AsterSubagentSessionInfo["runtime_status"],
): HarnessStatusBadgeVariant {
  switch (status) {
    case "running":
      return "default";
    case "completed":
      return "secondary";
    case "failed":
    case "aborted":
      return "destructive";
    case "queued":
    case "idle":
    default:
      return "outline";
  }
}

export function resolveSubagentSessionTypeLabel(value?: string): string {
  switch (value) {
    case "sub_agent":
      return "子任务";
    case "fork":
      return "分支任务";
    case "user":
    default:
      return value?.trim() || "任务会话";
  }
}

export function resolveFriendlyToolLabel(value?: string): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalizeToolNameKey(normalized) === "turnsummary") {
    return "当前任务摘要";
  }

  return resolveToolDisplayLabel(normalized);
}

export function summarizeChildSubagentSessions(
  sessions: AsterSubagentSessionInfo[],
): ChildSubagentSessionSummary {
  const running = sessions.filter(
    (session) => session.runtime_status === "running",
  ).length;
  const queued = sessions.filter(
    (session) => session.runtime_status === "queued",
  ).length;
  const failed = sessions.filter(
    (session) =>
      session.runtime_status === "failed" ||
      session.runtime_status === "aborted",
  ).length;
  const settled = sessions.filter(
    (session) =>
      session.runtime_status === "completed" ||
      session.runtime_status === "failed" ||
      session.runtime_status === "aborted" ||
      session.runtime_status === "closed",
  ).length;

  return {
    total: sessions.length,
    running,
    queued,
    active: running + queued,
    settled,
    failed,
  };
}

export function formatRuntimePhaseLabel(
  runtimeStatus: HarnessSessionState["runtimeStatus"],
): string {
  if (!runtimeStatus) {
    return "空闲";
  }

  switch (runtimeStatus.phase) {
    case "preparing":
      return "准备中";
    case "routing":
      return "处理中";
    case "context":
      return "整理信息";
    case "cancelled":
      return "已取消";
    case "failed":
      return "需要处理";
    default:
      return runtimeStatus.phase;
  }
}

export function resolveRuntimeStepStatus(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): StepStatus {
  if (runtimeStatus.phase === "failed") {
    return "error";
  }
  if (runtimeStatus.phase === "cancelled") {
    return "skipped";
  }
  return "active";
}

export function resolveRuntimeStatusLabel(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): string {
  if (runtimeStatus.phase === "cancelled") {
    return "已取消";
  }
  return getWorkflowStatusLabel(resolveRuntimeStepStatus(runtimeStatus));
}

export function buildRuntimeSummaryText(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
): string {
  const detail = runtimeStatus.detail?.trim();
  if (detail) {
    return detail;
  }
  if (runtimeStatus.phase === "cancelled") {
    return "当前流程已取消，可重新发起新的任务继续。";
  }
  return buildWorkflowSummaryText({
    leadingStep: {
      status: resolveRuntimeStepStatus(runtimeStatus),
    },
    remainingCount: 1,
    emptyLabel: "当前流程已完成",
  });
}

export function formatRuntimeProgressLabel(
  runtimeStatus: NonNullable<HarnessSessionState["runtimeStatus"]>,
  checkpoints: string[],
): string {
  if (checkpoints.length > 0) {
    return `已记录 ${checkpoints.length} 个任务节点`;
  }
  if (runtimeStatus.phase === "failed") {
    return "等待处理异常后重试";
  }
  if (runtimeStatus.phase === "cancelled") {
    return "当前流程已取消";
  }
  return "等待更多执行进展";
}

export function buildRuntimeTaskPresentation(
  runtimeStatus: HarnessSessionState["runtimeStatus"],
): RuntimeTaskPresentation | null {
  if (!runtimeStatus || isRuntimeStatusDiagnosticsOnly(runtimeStatus)) {
    return null;
  }

  const checkpoints = (runtimeStatus.checkpoints ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    title: runtimeStatus.title?.trim() || "正在整理当前任务",
    summaryText: buildRuntimeSummaryText(runtimeStatus),
    phaseLabel: formatRuntimePhaseLabel(runtimeStatus),
    statusLabel: resolveRuntimeStatusLabel(runtimeStatus),
    progressLabel: formatRuntimeProgressLabel(runtimeStatus, checkpoints),
    stepStatus: resolveRuntimeStepStatus(runtimeStatus),
    checkpoints,
  };
}

export function buildRuntimeFactSummary(
  threadRead?: AgentRuntimeThreadReadModel | null,
): HarnessRuntimeFactSummary | null {
  const runtimeSummary = threadRead?.runtime_summary;
  const decisionReason =
    threadRead?.decision_reason ?? runtimeSummary?.decisionReason ?? null;
  const fallbackChain = Array.isArray(threadRead?.fallback_chain)
    ? threadRead?.fallback_chain || []
    : Array.isArray(runtimeSummary?.fallbackChain)
      ? runtimeSummary?.fallbackChain || []
      : [];
  const oemPolicy = threadRead?.oem_policy ?? null;

  if (!decisionReason && fallbackChain.length === 0 && !oemPolicy) {
    return null;
  }

  return {
    decisionReason,
    fallbackChain,
    oemPolicy,
  };
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
        sessionIds: index.session_ids,
        targetIds: index.target_ids,
        profileKeys: index.profile_keys,
        items: index.items.map((item) => ({
          artifactKind: item.artifact_kind,
          toolName: item.tool_name,
          action: item.action,
          status: item.status,
          success: item.success,
          sessionId: item.session_id,
          targetId: item.target_id,
          profileKey: item.profile_key,
          backend: item.backend,
          requestId: item.request_id,
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

export function formatReviewDecisionRiskLevelLabel(
  riskLevel?: string,
): string {
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
