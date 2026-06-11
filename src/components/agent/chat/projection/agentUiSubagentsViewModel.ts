import type {
  AgentUiControl,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
  AgentUiSurface,
} from "./agentUiEventProjection";
import {
  AGENT_UI_SUBAGENTS_SURFACE_DEFINITIONS,
  AGENT_UI_SUBAGENTS_SURFACES,
  formatAgentUiProjectionControl,
  formatAgentUiProjectionEventAuxiliaryDetail,
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  formatAgentUiProjectionSurfaceDescription,
  formatAgentUiProjectionSurfaceLabel,
  type AgentUiProjectionTranslation,
} from "./agentUiProjectionSummary";

export interface AgentUiSubagentsItemAction {
  control: AgentUiControl;
  label: string;
  targetId: string;
}

export interface AgentUiSubagentsItemTarget {
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  evidenceId?: string;
  artifactId?: string;
  agentId?: string;
  taskId?: string;
  workItemId?: string;
  reviewId?: string;
  handoffId?: string;
  workerNotificationId?: string;
  remoteTaskId?: string;
  transcriptRef?: string;
  resultRef?: string;
  rawEventRef?: string;
  artifactIds?: string[];
  artifactPaths?: string[];
}

export interface AgentUiSubagentsViewItem {
  id: string;
  event: AgentUiProjectionEvent;
  title: string;
  subtitle: string;
  auxiliaryDetail: string | null;
  phaseLabel: string;
  chips: string[];
  attention: boolean;
  action: AgentUiSubagentsItemAction | null;
  target: AgentUiSubagentsItemTarget;
}

export interface AgentUiSubagentsViewSection {
  surface: AgentUiSurface;
  label: string;
  description: string;
  total: number;
  attentionCount: number;
  latestItems: AgentUiSubagentsViewItem[];
  primaryItem: AgentUiSubagentsViewItem | null;
}

export interface AgentUiSubagentsViewModel {
  total: number;
  attentionCount: number;
  sections: AgentUiSubagentsViewSection[];
}

export interface AgentUiSubagentsViewModelOptions {
  latestLimit?: number;
  includeEmptySections?: boolean;
  t?: AgentUiProjectionTranslation;
}

const ATTENTION_PHASES = new Set([
  "failed",
  "interrupted",
  "reviewing",
  "waiting",
]);
const ATTENTION_RUNTIME_STATUSES = new Set<AgentUiRuntimeStatus>([
  "aborted",
  "cancelled",
  "failed",
  "needs_input",
]);
const ATTENTION_CONTROLS = new Set<AgentUiControl>([
  "answer",
  "approve",
  "reject",
  "request_review",
]);
const REQUESTED_FIX_EXECUTION_STATUS_LABELS: Record<string, string> = {
  assigned: "已指派修复",
  blocked: "修复阻塞",
  completed: "修复完成",
  failed: "修复失败",
  pending: "待执行修复",
  running: "修复执行中",
};

const REQUESTED_FIX_EXECUTION_STATUS_LABEL_KEYS: Record<string, string> =
  Object.fromEntries(
    Object.keys(REQUESTED_FIX_EXECUTION_STATUS_LABELS).map((status) => [
      status,
      `agentChat.agentUiProjection.requestedFixStatus.${status}`,
    ]),
  );

function translateViewModelLabel(
  t: AgentUiProjectionTranslation | undefined,
  key: string | undefined,
  fallback: string,
  options: Record<string, unknown> = {},
): string {
  if (!t || !key) {
    return fallback;
  }
  return t(key, { defaultValue: fallback, ...options });
}

function formatSurfaceLabel(
  surface: AgentUiSurface,
  fallback: string,
  t?: AgentUiProjectionTranslation,
): string {
  return formatAgentUiProjectionSurfaceLabel(surface, t, fallback);
}

function formatSurfaceDescription(
  surface: AgentUiSurface,
  fallback: string,
  t?: AgentUiProjectionTranslation,
): string {
  return formatAgentUiProjectionSurfaceDescription(surface, t, fallback);
}

function normalizeText(
  value?: string | number | boolean | null,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = `${value}`.trim();
  return normalized || undefined;
}

function readPayloadText(
  event: AgentUiProjectionEvent,
  key: string,
): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? normalizeText(value)
    : undefined;
}

function normalizeTextList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueValues(
    values.map((value) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? normalizeText(value)
        : undefined,
    ),
  );
}

function readPayloadTextList(
  event: AgentUiProjectionEvent,
  key: string,
): string[] {
  return normalizeTextList(event.payload?.[key]);
}

function readPayloadRecord(
  event: AgentUiProjectionEvent,
  key: string,
): Record<string, unknown> | undefined {
  const value = event.payload?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRecordNumber(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function firstText(
  ...values: Array<string | number | boolean | null | undefined>
) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function isSubagentsEvent(event: AgentUiProjectionEvent): boolean {
  return Boolean(
    event.surface && AGENT_UI_SUBAGENTS_SURFACES.has(event.surface),
  );
}

function resolveRemoteTaskId(
  event: AgentUiProjectionEvent,
): string | undefined {
  return firstText(event.remoteTaskId, readPayloadText(event, "remoteTaskId"));
}

function resolveResultRef(event: AgentUiProjectionEvent): string | undefined {
  return firstText(
    readPayloadText(event, "executionResultRef"),
    readPayloadText(event, "resultRef"),
    event.refs?.rawEventRef,
    event.rawEventRef,
  );
}

function resolveArtifactIds(event: AgentUiProjectionEvent): string[] {
  return uniqueValues([
    event.artifactId,
    ...(event.refs?.artifactIds ?? []),
    ...readPayloadTextList(event, "executionArtifactIds"),
    ...readPayloadTextList(event, "artifactIds"),
  ]);
}

function resolveArtifactPaths(event: AgentUiProjectionEvent): string[] {
  return uniqueValues([
    ...(event.refs?.artifactPaths ?? []),
    ...readPayloadTextList(event, "executionArtifactPaths"),
    ...readPayloadTextList(event, "artifactPaths"),
  ]);
}

function isReviewRequestedFixWorkItem(event: AgentUiProjectionEvent): boolean {
  return (
    event.surface === "work_board" &&
    readPayloadText(event, "taskEvent") === "review_requested_fix"
  );
}

function formatRequestedFixExecutionStatusLabel(
  event: AgentUiProjectionEvent,
  t?: AgentUiProjectionTranslation,
): string | null {
  const status = readPayloadText(event, "executionStatus");
  if (!status) {
    return null;
  }
  const fallback =
    REQUESTED_FIX_EXECUTION_STATUS_LABELS[status] ?? `修复状态：${status}`;
  return translateViewModelLabel(
    t,
    REQUESTED_FIX_EXECUTION_STATUS_LABEL_KEYS[status],
    fallback,
    { status },
  );
}

function isTeamReassignmentWorkItem(event: AgentUiProjectionEvent): boolean {
  return (
    event.surface === "work_board" &&
    readPayloadText(event, "taskEvent") === "team_reassignment"
  );
}

function resolveWorkerUsage(
  event: AgentUiProjectionEvent,
): Record<string, unknown> | undefined {
  return event.workerUsage ?? readPayloadRecord(event, "workerUsage");
}

function formatWorkerUsageDetail(event: AgentUiProjectionEvent): string | null {
  const usage = resolveWorkerUsage(event);
  const totalTokens = readRecordNumber(usage, "totalTokens");
  const inputTokens = readRecordNumber(usage, "inputTokens");
  const outputTokens = readRecordNumber(usage, "outputTokens");
  const cachedInputTokens = readRecordNumber(usage, "cachedInputTokens");
  const cacheCreationInputTokens = readRecordNumber(
    usage,
    "cacheCreationInputTokens",
  );
  const detail = uniqueValues([
    totalTokens !== undefined ? `Tokens：${totalTokens}` : null,
    inputTokens !== undefined ? `输入：${inputTokens}` : null,
    outputTokens !== undefined ? `输出：${outputTokens}` : null,
    cachedInputTokens !== undefined ? `缓存读：${cachedInputTokens}` : null,
    cacheCreationInputTokens !== undefined
      ? `缓存写：${cacheCreationInputTokens}`
      : null,
  ]);

  return detail.length > 0 ? detail.join(" / ") : null;
}

function formatWorkerUsageChip(event: AgentUiProjectionEvent): string | null {
  const totalTokens = readRecordNumber(
    resolveWorkerUsage(event),
    "totalTokens",
  );
  return totalTokens !== undefined ? `Tokens ${totalTokens}` : null;
}

function formatHandoffRoute(event: AgentUiProjectionEvent): string | null {
  const from = readPayloadText(event, "from");
  const to = readPayloadText(event, "to");
  if (from && to) {
    return `${from} → ${to}`;
  }
  return to ?? from ?? null;
}

function formatRemoteContentUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0] ?? value;
  }
}

function formatRemoteArtifactContentLocation(
  event: AgentUiProjectionEvent,
): string | null {
  const contentRef = readPayloadText(event, "primaryArtifactContentRef");
  if (contentRef) {
    return `内容：${contentRef}`;
  }
  const contentUrl = readPayloadText(event, "primaryArtifactContentUrl");
  return contentUrl
    ? `内容链接：${formatRemoteContentUrlLabel(contentUrl)}`
    : null;
}

function resolveTargetId(event: AgentUiProjectionEvent): string {
  if (event.surface === "teammate_transcript") {
    return (
      firstText(event.transcriptRef, event.agentId, event.taskId) ??
      `${event.sourceType}:${event.sequence ?? event.type}`
    );
  }

  return (
    firstText(
      event.workItemId,
      event.reviewId,
      event.handoffId,
      resolveRemoteTaskId(event),
      event.taskId,
      event.agentId,
      event.workerNotificationId,
      event.transcriptRef,
      event.artifactId,
      event.evidenceId,
      event.rawEventRef,
    ) ?? `${event.sourceType}:${event.sequence ?? event.type}`
  );
}

function resolveItemTitle(
  event: AgentUiProjectionEvent,
  t?: AgentUiProjectionTranslation,
): string {
  switch (event.surface) {
    case "team_roster":
      return (
        firstText(
          event.agentName,
          event.agentRole,
          event.agentId,
          event.teamName,
        ) ?? "Subagent"
      );
    case "delegation_graph":
      return (
        firstText(event.agentName, event.agentId, event.taskId) ?? "Delegation"
      );
    case "work_board":
      if (isTeamReassignmentWorkItem(event)) {
        const nextAssigneeId = readPayloadText(event, "nextAssigneeId");
        return nextAssigneeId
          ? `重新指派给 ${nextAssigneeId}`
          : (firstText(event.workItemId, event.taskId) ?? "重新指派");
      }
      return (
        firstText(
          isReviewRequestedFixWorkItem(event)
            ? readPayloadText(event, "requestedFix")
            : undefined,
          event.workItemId,
          event.taskId,
          event.reviewId,
        ) ?? "Work item"
      );
    case "worker_notifications":
      return (
        firstText(event.workerNotificationId, event.agentName, event.agentId) ??
        "Worker notification"
      );
    case "handoff_lane":
      return (
        firstText(event.handoffId, readPayloadText(event, "reason")) ??
        "Handoff"
      );
    case "review_lane":
      return (
        firstText(
          event.reviewId,
          event.workItemId,
          readPayloadText(event, "decisionStatus"),
        ) ?? "Review"
      );
    case "teammate_transcript":
      return (
        firstText(event.transcriptRef, event.agentName, event.agentId) ??
        "Transcript"
      );
    case "background_teammate":
      return (
        firstText(event.agentName, event.taskId, event.agentId) ??
        "Background subagent"
      );
    case "remote_teammate":
      return (
        firstText(
          event.agentName,
          readPayloadText(event, "agentCardName"),
          readPayloadText(event, "title"),
          resolveRemoteTaskId(event),
        ) ?? "Remote subagent"
      );
    case "team_policy":
      return (
        firstText(
          event.teamName,
          event.teamId,
          readPayloadText(event, "teamEvent"),
        ) ?? "Subagents policy"
      );
    default:
      return formatAgentUiProjectionEventType(event.type, t);
  }
}

function resolveItemSubtitle(event: AgentUiProjectionEvent): string {
  if (isTeamReassignmentWorkItem(event)) {
    const previousAssigneeId = readPayloadText(event, "previousAssigneeId");
    const nextAssigneeId = readPayloadText(event, "nextAssigneeId");
    const reassignmentReason = readPayloadText(event, "reassignmentReason");
    const route =
      previousAssigneeId && nextAssigneeId
        ? `${previousAssigneeId} → ${nextAssigneeId}`
        : (nextAssigneeId ?? previousAssigneeId);
    return uniqueValues([
      firstText(event.workItemId, event.taskId)
        ? `工作项：${firstText(event.workItemId, event.taskId)}`
        : null,
      route ? `负责人：${route}` : null,
      reassignmentReason ? `原因：${reassignmentReason}` : null,
    ]).join(" / ");
  }

  if (event.surface === "handoff_lane") {
    const handoffRoute = formatHandoffRoute(event);
    const status = readPayloadText(event, "status");
    const resumeTarget = readPayloadText(event, "resumeTarget");
    const contextBoundary = readPayloadText(event, "contextBoundary");
    const summaryPreview = readPayloadText(event, "summaryPreview");
    const detail = uniqueValues([
      status ? `状态：${status}` : null,
      handoffRoute ? `交接：${handoffRoute}` : null,
      resumeTarget ? `恢复：${resumeTarget}` : null,
      contextBoundary ? `边界：${contextBoundary}` : null,
      summaryPreview ? `摘要：${summaryPreview}` : null,
    ]);
    if (detail.length > 0) {
      return detail.join(" / ");
    }
  }

  if (isReviewRequestedFixWorkItem(event)) {
    const fixIndex = readPayloadText(event, "requestedFixIndex");
    const fixCount = readPayloadText(event, "requestedFixCount");
    const status = readPayloadText(event, "executionStatus");
    const regressionOutcome = readPayloadText(event, "regressionOutcome");
    const executionSummaryPreview = readPayloadText(
      event,
      "executionSummaryPreview",
    );
    const executionResultRef = readPayloadText(event, "executionResultRef");
    const reviewId = firstText(
      event.reviewId,
      readPayloadText(event, "reviewId"),
    );
    return uniqueValues([
      reviewId ? `Review：${reviewId}` : null,
      fixIndex && fixCount ? `修复项 ${fixIndex}/${fixCount}` : null,
      status ? `状态：${status}` : null,
      regressionOutcome ? `回归：${regressionOutcome}` : null,
      executionSummaryPreview ? `结果：${executionSummaryPreview}` : null,
      executionResultRef ? `引用：${executionResultRef}` : null,
    ]).join(" / ");
  }

  if (event.surface === "worker_notifications") {
    const workerUsage = formatWorkerUsageDetail(event);
    const durationMs = readPayloadText(event, "durationMs");
    const toolCount = readPayloadText(event, "toolCount");
    const resultRef = readPayloadText(event, "resultRef");
    const transcriptRef = firstText(
      event.transcriptRef,
      readPayloadText(event, "transcriptRef"),
    );
    const detail = uniqueValues([
      transcriptRef ? `Transcript：${transcriptRef}` : null,
      workerUsage,
      durationMs ? `时长：${durationMs}ms` : null,
      toolCount ? `工具：${toolCount}` : null,
      resultRef ? `结果：${resultRef}` : null,
    ]);
    if (detail.length > 0) {
      return detail.join(" / ");
    }
  }

  if (event.surface === "remote_teammate") {
    const artifactCount = readPayloadText(event, "artifactCount");
    const artifactTitle = firstText(
      readPayloadText(event, "primaryArtifactTitle"),
      readPayloadText(event, "primaryArtifactId"),
    );
    const detail = uniqueValues([
      resolveRemoteTaskId(event)
        ? `远端任务：${resolveRemoteTaskId(event)}`
        : null,
      readPayloadText(event, "agentCardProvider")
        ? `来源：${readPayloadText(event, "agentCardProvider")}`
        : null,
      readPayloadText(event, "remoteStatus")
        ? `状态：${readPayloadText(event, "remoteStatus")}`
        : null,
      readPayloadText(event, "inputSummary")
        ? `输入：${readPayloadText(event, "inputSummary")}`
        : null,
      artifactCount ? `Artifact：${artifactCount}` : null,
      artifactTitle ? `交付物：${artifactTitle}` : null,
      formatRemoteArtifactContentLocation(event),
      readPayloadText(event, "primaryArtifactMimeType")
        ? `类型：${readPayloadText(event, "primaryArtifactMimeType")}`
        : null,
      readPayloadText(event, "primaryArtifactDigest")
        ? `校验：${readPayloadText(event, "primaryArtifactDigest")}`
        : null,
      readPayloadText(event, "primaryArtifactPreview")
        ? `预览：${readPayloadText(event, "primaryArtifactPreview")}`
        : null,
    ]);
    if (detail.length > 0) {
      return detail.join(" / ");
    }
  }

  return formatAgentUiProjectionEventDetail(event);
}

function buildTarget(
  event: AgentUiProjectionEvent,
): AgentUiSubagentsItemTarget {
  const artifactIds = resolveArtifactIds(event);
  const artifactPaths = resolveArtifactPaths(event);
  return {
    sessionId: normalizeText(event.sessionId),
    threadId: normalizeText(event.threadId),
    runId: normalizeText(event.runId),
    turnId: normalizeText(event.turnId),
    evidenceId: normalizeText(event.evidenceId),
    artifactId: normalizeText(event.artifactId),
    agentId: normalizeText(event.agentId),
    taskId: normalizeText(event.taskId),
    workItemId: normalizeText(event.workItemId),
    reviewId: normalizeText(event.reviewId),
    handoffId: normalizeText(event.handoffId),
    workerNotificationId: normalizeText(event.workerNotificationId),
    remoteTaskId: resolveRemoteTaskId(event),
    transcriptRef: normalizeText(event.transcriptRef),
    resultRef: resolveResultRef(event),
    rawEventRef: normalizeText(event.rawEventRef ?? event.refs?.rawEventRef),
    artifactIds: artifactIds.length > 0 ? artifactIds : undefined,
    artifactPaths: artifactPaths.length > 0 ? artifactPaths : undefined,
  };
}

function buildItemAction(
  event: AgentUiProjectionEvent,
  t?: AgentUiProjectionTranslation,
): AgentUiSubagentsItemAction | null {
  if (
    !event.control ||
    event.control === "none" ||
    event.control === "unknown"
  ) {
    return null;
  }
  const requestedFixActionLabel = isReviewRequestedFixWorkItem(event)
    ? event.control === "open_detail"
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.control.openRequestedFixResult",
          "查看修复结果",
        )
      : event.control === "assign"
        ? translateViewModelLabel(
            t,
            "agentChat.agentUiProjection.control.assignRequestedFix",
            "指派修复",
          )
        : undefined
    : undefined;
  return {
    control: event.control,
    label: isTeamReassignmentWorkItem(event)
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.control.reassign",
          "重新指派",
        )
      : (requestedFixActionLabel ??
        formatAgentUiProjectionControl(event.control, t)),
    targetId: resolveTargetId(event),
  };
}

function isAttentionItem(event: AgentUiProjectionEvent): boolean {
  return Boolean(
    ATTENTION_PHASES.has(event.phase) ||
    (event.runtimeStatus &&
      ATTENTION_RUNTIME_STATUSES.has(event.runtimeStatus)) ||
    (event.control && ATTENTION_CONTROLS.has(event.control)),
  );
}

function buildItemChips(
  event: AgentUiProjectionEvent,
  t?: AgentUiProjectionTranslation,
): string[] {
  return uniqueValues([
    formatAgentUiProjectionEventType(event.type, t),
    formatAgentUiProjectionPhase(event.phase, t),
    event.runtimeEntity,
    event.runtimeStatus,
    isReviewRequestedFixWorkItem(event)
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.reviewFix",
          "Review fix",
        )
      : null,
    isTeamReassignmentWorkItem(event)
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.reassign",
          "Reassign",
        )
      : null,
    isTeamReassignmentWorkItem(event)
      ? uniqueValues([
          readPayloadText(event, "previousAssigneeId"),
          readPayloadText(event, "nextAssigneeId"),
        ]).join(" → ")
      : null,
    event.control && event.control !== "none"
      ? formatAgentUiProjectionControl(event.control, t)
      : null,
    isReviewRequestedFixWorkItem(event)
      ? formatRequestedFixExecutionStatusLabel(event, t)
      : null,
    readPayloadText(event, "decisionStatus"),
    readPayloadText(event, "riskLevel"),
    readPayloadText(event, "agentCardProvider"),
    event.surface === "remote_teammate" &&
    readPayloadText(event, "artifactCount")
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.artifactCount",
          `Artifact ${readPayloadText(event, "artifactCount")}`,
          { count: readPayloadText(event, "artifactCount") },
        )
      : null,
    event.surface === "remote_teammate" &&
    (readPayloadText(event, "primaryArtifactContentRef") ||
      readPayloadText(event, "primaryArtifactContentUrl"))
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.remoteContent",
          "远端内容",
        )
      : null,
    event.surface === "remote_teammate"
      ? readPayloadText(event, "primaryArtifactMimeType")
      : null,
    event.surface === "handoff_lane" ? readPayloadText(event, "status") : null,
    event.surface === "handoff_lane"
      ? readPayloadText(event, "handoffEvent")
      : null,
    event.surface === "handoff_lane" ? formatHandoffRoute(event) : null,
    readPayloadText(event, "executionStatus"),
    isReviewRequestedFixWorkItem(event)
      ? readPayloadText(event, "regressionOutcome")
      : null,
    isReviewRequestedFixWorkItem(event) &&
    readPayloadText(event, "executionResultRef")
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.hasExecutionRef",
          "有执行引用",
        )
      : null,
    event.surface === "worker_notifications"
      ? formatWorkerUsageChip(event)
      : null,
    event.surface === "worker_notifications" &&
    readPayloadText(event, "toolCount")
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.toolCount",
          `工具 ${readPayloadText(event, "toolCount")}`,
          { count: readPayloadText(event, "toolCount") },
        )
      : null,
    event.surface === "worker_notifications" &&
    readPayloadText(event, "resultRef")
      ? translateViewModelLabel(
          t,
          "agentChat.agentUiProjection.chip.hasResultRef",
          "有结果引用",
        )
      : null,
  ]);
}

export function buildAgentUiSubagentsViewItem(
  event: AgentUiProjectionEvent,
  t?: AgentUiProjectionTranslation,
): AgentUiSubagentsViewItem {
  const auxiliaryDetail = formatAgentUiProjectionEventAuxiliaryDetail(event);
  return {
    id: `${event.surface ?? "unknown"}:${resolveTargetId(event)}:${
      event.sequence ?? event.type
    }`,
    event,
    title: resolveItemTitle(event, t),
    subtitle: resolveItemSubtitle(event),
    auxiliaryDetail,
    phaseLabel: formatAgentUiProjectionPhase(event.phase, t),
    chips: buildItemChips(event, t),
    attention: isAttentionItem(event),
    action: buildItemAction(event, t),
    target: buildTarget(event),
  };
}

export function buildAgentUiSubagentsViewModel(
  events: AgentUiProjectionEvent[],
  options: AgentUiSubagentsViewModelOptions = {},
): AgentUiSubagentsViewModel {
  const latestLimit = Math.max(1, options.latestLimit ?? 4);
  const t = options.t;
  const teamEvents = events.filter(isSubagentsEvent);
  const sections = AGENT_UI_SUBAGENTS_SURFACE_DEFINITIONS.map((definition) => {
    const surfaceEvents = teamEvents.filter(
      (event) => event.surface === definition.surface,
    );
    const latestItems = surfaceEvents
      .slice()
      .reverse()
      .slice(0, latestLimit)
      .map((event) => buildAgentUiSubagentsViewItem(event, t));
    const attentionCount = surfaceEvents.filter(isAttentionItem).length;

    return {
      ...definition,
      label: formatSurfaceLabel(definition.surface, definition.label, t),
      description: formatSurfaceDescription(
        definition.surface,
        definition.description,
        t,
      ),
      total: surfaceEvents.length,
      attentionCount,
      latestItems,
      primaryItem: latestItems[0] ?? null,
    } satisfies AgentUiSubagentsViewSection;
  }).filter((section) => options.includeEmptySections || section.total > 0);

  return {
    total: teamEvents.length,
    attentionCount: sections.reduce(
      (total, section) => total + section.attentionCount,
      0,
    ),
    sections,
  };
}
