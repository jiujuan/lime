import type {
  AgentRuntimeEvidenceBrowserActionItem,
  AgentRuntimeReviewDecisionTemplate,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import {
  normalizeToolNameKey,
  resolveToolDisplayLabel,
} from "../utils/toolDisplayInfo";

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
