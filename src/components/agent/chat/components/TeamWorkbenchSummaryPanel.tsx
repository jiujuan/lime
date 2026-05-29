import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Bot, CircleHelp, Workflow } from "lucide-react";
import {
  getAgentRuntimeSession,
  type AsterSubagentParentContext,
  type AsterSubagentSessionInfo,
  type QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";
import { cn } from "@/lib/utils";
import type {
  TeamWorkspaceActivityEntry,
  TeamWorkspaceControlSummary,
  TeamWorkspaceLiveRuntimeState,
  TeamWorkspaceRuntimeFormationState,
  TeamWorkspaceWaitSummary,
} from "../teamWorkspaceRuntime";
import {
  buildActivityPreviewCopy,
  extractSessionActivitySnapshot,
  type ActivityPreviewTranslate,
} from "../team-workspace-runtime/activityPreviewSelectors";
import {
  mergeSessionActivityEntries,
  resolveRuntimeMemberStatusMeta,
  summarizeTeamWorkspaceExecution,
} from "../teamWorkspaceRuntime";
import {
  buildTeamWorkspaceFormationCopy,
  buildRuntimeFormationDisplayState,
  type TeamWorkspaceFormationTranslate,
} from "../team-workspace-runtime/formationDisplaySelectors";
import {
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventAuxiliaryDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  formatAgentUiProjectionSurfaceLabel,
  summarizeAgentUiTeamWorkbenchProjectionEvents,
  summarizeAgentUiTeamWorkbenchSurfaceLanes,
  summarizeAgentUiTeamWorkbenchSurfaces,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import type { AgentUiProjectionEvent } from "../projection/agentUiEventProjection";
import type { AgentUiTeamWorkbenchViewItem } from "../projection/agentUiTeamWorkbenchViewModel";
import { useAgentUiProjectionEvents } from "../projection/useConversationProjectionStore";
import { useRemoteTaskExecutionRunProjection } from "../projection/useRemoteTaskExecutionRunProjection";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import { normalizeTeamWorkspaceDisplayValue } from "../utils/teamWorkspaceDisplay";
import { resolveTeamWorkspaceDisplayRuntimeStatusLabel } from "../utils/teamWorkspaceCopy";
import { AgentUiTeamWorkbenchSurfaceView } from "./AgentUiTeamWorkbenchSurfaceView";
import { TeamMemoryShadowCard } from "./TeamMemoryShadowCard";

interface TeamWorkbenchSummaryPanelProps {
  currentSessionId?: string | null;
  currentSessionRuntimeStatus?: AsterSubagentSessionInfo["runtime_status"];
  currentSessionLatestTurnStatus?: AsterSubagentSessionInfo["runtime_status"];
  currentSessionQueuedTurnCount?: number;
  childSubagentSessions?: AsterSubagentSessionInfo[];
  subagentParentContext?: AsterSubagentParentContext | null;
  liveRuntimeBySessionId?: Record<string, TeamWorkspaceLiveRuntimeState>;
  liveActivityBySessionId?: Record<string, TeamWorkspaceActivityEntry[]>;
  teamWaitSummary?: TeamWorkspaceWaitSummary | null;
  teamControlSummary?: TeamWorkspaceControlSummary | null;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  selectedTeamRoles?: TeamRoleDefinition[] | null;
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null;
  teamMemorySnapshot?: TeamMemorySnapshot | null;
  onWorkbenchAction?: (
    item: AgentUiTeamWorkbenchViewItem,
  ) => string | null | undefined | Promise<string | null | undefined>;
  onWorkbenchReassign?: (
    item: AgentUiTeamWorkbenchViewItem,
    nextAssignee: string,
  ) => string | null | undefined | Promise<string | null | undefined>;
}

interface WorkbenchActionRouteStatus {
  label: string;
  detail: string;
  className: string;
}

interface WorkbenchReassignmentCandidate {
  value: string;
  label: string;
  detail?: string;
}

function buildOperationSummary(params: {
  teamWaitSummary?: TeamWorkspaceWaitSummary | null;
  teamControlSummary?: TeamWorkspaceControlSummary | null;
}) {
  if (params.teamControlSummary) {
    const affectedCount = params.teamControlSummary.affectedSessionIds.length;
    switch (params.teamControlSummary.action) {
      case "resume":
        return `最近一次继续操作影响 ${affectedCount} 项任务。`;
      case "close_completed":
        return `最近一次收尾操作收起了 ${affectedCount} 项已完成任务。`;
      case "close":
      default:
        return `最近一次暂停操作影响 ${affectedCount} 项任务。`;
    }
  }

  if (params.teamWaitSummary) {
    return params.teamWaitSummary.timedOut
      ? `最近一次等待超时，仍有 ${params.teamWaitSummary.awaitedSessionIds.length} 项任务在推进。`
      : "最近一次等待已收到任务结果。";
  }

  return null;
}

function isPromiseLikeRouteResult(
  value: unknown,
): value is PromiseLike<string | null | undefined> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function buildWorkbenchActionRouteStatus(
  result?: string | null,
): WorkbenchActionRouteStatus | null {
  switch (result) {
    case "closed":
      return {
        label: "已收起",
        detail: "已完成本地收尾处理。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "continued":
      return {
        label: "已继续",
        detail: "已继续推进对应任务。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "opened":
      return {
        label: "已打开",
        detail: "已打开对应任务。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "waited":
      return {
        label: "已等待",
        detail: "已等待对应任务返回结果。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "located_only":
      return {
        label: "只定位",
        detail: "已定位这条工作台记录，当前只能查看，不能直接处理。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "seeded_work_item":
      return {
        label: "已回填输入",
        detail:
          "修复请求已回填到输入框；发送后才会进入执行，这里不会直接标记完成。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "submitted_work_item":
      return {
        label: "已提交执行",
        detail: "修复请求已提交为执行请求；结果会等后台记录回写后再更新。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "seeded_reassignment":
      return {
        label: "重指派已回填",
        detail:
          "负责人更新指令已回填；发送并执行后，以后台返回的负责人变化为准。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "work_item_source_located":
      return {
        label: "工作项已定位",
        detail:
          "已定位任务记录；可通过负责人选择器回填更新指令，等待后台确认负责人变化。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "remote_task_source_located":
      return {
        label: "远端任务已定位",
        detail:
          "已定位外部任务记录；当前只展示来源、状态与结果引用，不直接代替外部系统操作。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "handoff_source_located":
      return {
        label: "交接已定位",
        detail: "已定位交接记录；当前只展示交接过程，不直接代替其他任务操作。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "unsupported_remote":
      return {
        label: "外部任务未连接",
        detail: "需要连接外部任务入口后，才能在这里直接处理。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_review":
      return {
        label: "审核未连接",
        detail: "审核记录已定位；审核回写接入前，这里只提供查看。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_handoff":
      return {
        label: "交接未连接",
        detail: "交接记录已定位；接收、退回、恢复能力接入前，这里只提供查看。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_work_item":
      return {
        label: "工作项未连接",
        detail: "任务记录已定位；后台写回接入前，这里只提供查看。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported":
      return {
        label: "当前仅可查看",
        detail: "这条工作台记录暂无可执行的本地处理方式。",
        className: "border-slate-200 bg-slate-50 text-slate-600",
      };
    default:
      return null;
  }
}

function buildWorkbenchActionTargetRows(
  item: AgentUiTeamWorkbenchViewItem,
): Array<{ label: string; value: string }> {
  const artifactIds = item.target.artifactIds?.join(" / ");
  const artifactPaths = item.target.artifactPaths?.join(" / ");
  const rows: Array<[string, string | undefined]> = [
    ["任务记录", item.target.sessionId],
    ["线程", item.target.threadId],
    ["运行", item.target.runId],
    ["步骤", item.target.turnId],
    ["证据", item.target.evidenceId],
    ["交付物", item.target.artifactId],
    ["负责人", item.target.agentId],
    ["任务", item.target.taskId],
    ["工作项", item.target.workItemId],
    ["审核", item.target.reviewId],
    ["交接", item.target.handoffId],
    ["通知", item.target.workerNotificationId],
    ["远端任务", item.target.remoteTaskId],
    ["记录", item.target.transcriptRef],
    ["结果引用", item.target.resultRef],
    ["原始记录", item.target.rawEventRef],
    ["交付物 ID", artifactIds],
    ["交付物路径", artifactPaths],
  ];

  return rows
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({ label, value }));
}

function normalizeWorkbenchReassignmentValue(
  value?: string | null,
): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeWorkbenchReassignmentKey(
  value?: string | null,
): string | null {
  return (
    normalizeWorkbenchReassignmentValue(value)?.toLocaleLowerCase() ?? null
  );
}

function appendWorkbenchReassignmentCandidate(
  candidates: WorkbenchReassignmentCandidate[],
  seen: Set<string>,
  value?: string | null,
  label?: string | null,
  detailParts: Array<string | null | undefined> = [],
) {
  const normalizedValue = normalizeWorkbenchReassignmentValue(value);
  if (!normalizedValue) {
    return;
  }

  const key = normalizeWorkbenchReassignmentKey(normalizedValue);
  if (!key || seen.has(key)) {
    return;
  }
  seen.add(key);

  const normalizedLabel =
    normalizeWorkbenchReassignmentValue(label) ?? normalizedValue;
  const detail = Array.from(
    new Set(
      detailParts
        .map((part) => normalizeWorkbenchReassignmentValue(part))
        .filter((part): part is string => Boolean(part)),
    ),
  ).join(" / ");
  candidates.push({
    value: normalizedValue,
    label: normalizedLabel,
    ...(detail ? { detail } : {}),
  });
}

function readWorkbenchItemPayloadText(
  item: AgentUiTeamWorkbenchViewItem,
  key: string,
): string | null {
  const value = item.event.payload?.[key];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return normalizeWorkbenchReassignmentValue(String(value));
  }
  return null;
}

function resolveWorkbenchItemCurrentAssignee(
  item: AgentUiTeamWorkbenchViewItem,
): string | null {
  return (
    readWorkbenchItemPayloadText(item, "nextAssigneeId") ??
    readWorkbenchItemPayloadText(item, "currentAssigneeId") ??
    readWorkbenchItemPayloadText(item, "assigneeId") ??
    readWorkbenchItemPayloadText(item, "owner")
  );
}

function canReassignWorkbenchItem(
  item: AgentUiTeamWorkbenchViewItem | null,
): item is AgentUiTeamWorkbenchViewItem {
  return Boolean(
    item &&
    item.event.surface === "work_board" &&
    (item.target.workItemId ||
      item.event.workItemId ||
      item.target.taskId ||
      item.event.taskId ||
      item.action?.targetId),
  );
}

function buildWorkbenchReassignmentCandidates(params: {
  childSubagentSessions: AsterSubagentSessionInfo[];
  selectedItem: AgentUiTeamWorkbenchViewItem | null;
  selectedTeamRoles: TeamRoleDefinition[];
  teamDispatchPreviewState?: TeamWorkspaceRuntimeFormationState | null;
}): WorkbenchReassignmentCandidate[] {
  const candidates: WorkbenchReassignmentCandidate[] = [];
  const seen = new Set<string>();

  params.childSubagentSessions.forEach((session) => {
    appendWorkbenchReassignmentCandidate(
      candidates,
      seen,
      session.name || session.role_hint || session.id,
      session.name || session.role_hint || session.id,
      [session.id, session.role_hint, session.profile_name],
    );
  });

  params.teamDispatchPreviewState?.members.forEach((member) => {
    appendWorkbenchReassignmentCandidate(
      candidates,
      seen,
      member.label || member.roleKey || member.id,
      member.label || member.roleKey || member.id,
      [member.id, member.roleKey, member.profileId],
    );
  });

  params.selectedTeamRoles.forEach((role) => {
    appendWorkbenchReassignmentCandidate(
      candidates,
      seen,
      role.label || role.roleKey || role.id,
      role.label || role.roleKey || role.id,
      [role.id, role.roleKey, role.profileId],
    );
  });

  const currentAssigneeKey = params.selectedItem
    ? normalizeWorkbenchReassignmentKey(
        resolveWorkbenchItemCurrentAssignee(params.selectedItem),
      )
    : null;
  if (!currentAssigneeKey) {
    return candidates;
  }

  const filtered = candidates.filter(
    (candidate) =>
      normalizeWorkbenchReassignmentKey(candidate.value) !== currentAssigneeKey,
  );
  return filtered.length > 0 ? filtered : candidates;
}

function appendRelatedWorkbenchKey(keys: Set<string>, value?: string | null) {
  const normalized = value?.trim();
  if (normalized) {
    keys.add(normalized);
  }
}

function appendRelatedWorkbenchKeyList(
  keys: Set<string>,
  values?: string[] | null,
) {
  values?.forEach((value) => appendRelatedWorkbenchKey(keys, value));
}

function appendRelatedWorkbenchPayloadText(
  keys: Set<string>,
  payload: Record<string, unknown> | undefined,
  key: string,
) {
  const value = payload?.[key];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    appendRelatedWorkbenchKey(keys, String(value));
  }
}

function appendRelatedWorkbenchPayloadList(
  keys: Set<string>,
  payload: Record<string, unknown> | undefined,
  key: string,
) {
  const value = payload?.[key];
  if (!Array.isArray(value)) {
    return;
  }
  value.forEach((item) => {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      appendRelatedWorkbenchKey(keys, String(item));
    }
  });
}

function appendRelatedWorkbenchTranscriptKeys(
  keys: Set<string>,
  value?: string | null,
) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }

  appendRelatedWorkbenchKey(keys, normalized);
  normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => appendRelatedWorkbenchKey(keys, segment));
  normalized
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => appendRelatedWorkbenchKey(keys, segment));
}

function appendRelatedWorkbenchEventKeys(
  keys: Set<string>,
  event: AgentUiProjectionEvent,
) {
  appendRelatedWorkbenchKey(keys, event.agentId);
  appendRelatedWorkbenchKey(keys, event.taskId);
  appendRelatedWorkbenchKey(keys, event.workItemId);
  appendRelatedWorkbenchKey(keys, event.reviewId);
  appendRelatedWorkbenchKey(keys, event.handoffId);
  appendRelatedWorkbenchKey(keys, event.artifactId);
  appendRelatedWorkbenchKey(keys, event.evidenceId);
  appendRelatedWorkbenchKey(keys, event.workerNotificationId);
  appendRelatedWorkbenchKey(keys, event.rawEventRef);
  appendRelatedWorkbenchKey(keys, event.refs?.rawEventRef);
  appendRelatedWorkbenchKeyList(keys, event.refs?.artifactIds);
  appendRelatedWorkbenchKeyList(keys, event.refs?.artifactPaths);
  appendRelatedWorkbenchKey(
    keys,
    typeof event.payload?.remoteTaskId === "string"
      ? event.payload.remoteTaskId
      : undefined,
  );
  appendRelatedWorkbenchPayloadText(keys, event.payload, "resultRef");
  appendRelatedWorkbenchPayloadText(keys, event.payload, "executionResultRef");
  appendRelatedWorkbenchPayloadList(keys, event.payload, "artifactIds");
  appendRelatedWorkbenchPayloadList(keys, event.payload, "artifactPaths");
  appendRelatedWorkbenchPayloadList(
    keys,
    event.payload,
    "executionArtifactIds",
  );
  appendRelatedWorkbenchPayloadList(
    keys,
    event.payload,
    "executionArtifactPaths",
  );
  appendRelatedWorkbenchTranscriptKeys(keys, event.transcriptRef);
}

function buildSelectedWorkbenchRelatedEvents(
  events: AgentUiProjectionEvent[],
  item: AgentUiTeamWorkbenchViewItem | null,
): AgentUiProjectionEvent[] {
  if (!item) {
    return [];
  }

  const selectedKeys = new Set<string>();
  appendRelatedWorkbenchEventKeys(selectedKeys, item.event);
  appendRelatedWorkbenchKey(selectedKeys, item.action?.targetId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.agentId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.taskId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.workItemId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.reviewId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.handoffId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.evidenceId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.artifactId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.workerNotificationId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.remoteTaskId);
  appendRelatedWorkbenchKey(selectedKeys, item.target.resultRef);
  appendRelatedWorkbenchKey(selectedKeys, item.target.rawEventRef);
  appendRelatedWorkbenchKeyList(selectedKeys, item.target.artifactIds);
  appendRelatedWorkbenchKeyList(selectedKeys, item.target.artifactPaths);
  appendRelatedWorkbenchTranscriptKeys(selectedKeys, item.target.transcriptRef);

  if (selectedKeys.size === 0) {
    return [];
  }

  return events
    .filter((event) => {
      const eventKeys = new Set<string>();
      appendRelatedWorkbenchEventKeys(eventKeys, event);
      for (const key of eventKeys) {
        if (selectedKeys.has(key)) {
          return true;
        }
      }
      return false;
    })
    .slice()
    .reverse()
    .slice(0, RELATED_WORKBENCH_EVENT_LIMIT);
}

interface WorkbenchTranscriptZoom {
  transcriptRef: string;
  parentSessionId?: string;
  childSessionId?: string;
  latestTurnId?: string;
  agentId?: string;
  taskId?: string;
}

interface WorkbenchTranscriptHistoryState {
  sessionId: string;
  status: "loading" | "ready" | "error";
  entries: TeamWorkspaceActivityEntry[];
  queuedTurns: QueuedTurnSnapshot[];
  errorMessage?: string;
}

const TRANSCRIPT_HISTORY_ENTRY_LIMIT = 3;
const TRANSCRIPT_HISTORY_FETCH_LIMIT = 20;
const TRANSCRIPT_PENDING_QUEUE_LIMIT = 3;
const RELATED_WORKBENCH_EVENT_LIMIT = 6;

function normalizeWorkbenchTargetValue(
  value?: string | null,
): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function firstWorkbenchTargetValue(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const normalized = normalizeWorkbenchTargetValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function parseTranscriptRef(value: string): {
  childSessionId?: string;
  latestTurnId?: string;
} {
  const normalized = value.trim();
  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 0 && colonIndex < normalized.length - 1) {
    return {
      childSessionId: normalized.slice(0, colonIndex),
      latestTurnId: normalized.slice(colonIndex + 1),
    };
  }

  const slashSegments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (slashSegments.length > 0) {
    return { childSessionId: slashSegments[slashSegments.length - 1] };
  }

  return { childSessionId: normalized };
}

function buildWorkbenchTranscriptZoom(
  item: AgentUiTeamWorkbenchViewItem | null,
): WorkbenchTranscriptZoom | null {
  if (!item) {
    return null;
  }

  const transcriptRef = firstWorkbenchTargetValue(
    item.target.transcriptRef,
    item.event.transcriptRef,
    item.event.surface === "teammate_transcript"
      ? item.action?.targetId
      : undefined,
  );
  if (!transcriptRef && item.event.surface !== "teammate_transcript") {
    return null;
  }

  const parsed = transcriptRef ? parseTranscriptRef(transcriptRef) : {};
  const agentId = firstWorkbenchTargetValue(
    item.target.agentId,
    item.event.agentId,
  );
  const taskId = firstWorkbenchTargetValue(
    item.target.taskId,
    item.event.taskId,
  );

  return {
    transcriptRef: transcriptRef ?? item.id,
    parentSessionId: firstWorkbenchTargetValue(
      item.target.sessionId,
      item.event.sessionId,
    ),
    childSessionId: firstWorkbenchTargetValue(
      agentId,
      taskId,
      parsed.childSessionId,
    ),
    latestTurnId: parsed.latestTurnId,
    agentId,
    taskId,
  };
}

type WorkbenchTranscriptEntryGroupKind =
  | "pending_input"
  | "tool_activity"
  | "recent_messages";

interface WorkbenchTranscriptEntryGroup {
  kind: WorkbenchTranscriptEntryGroupKind;
  label: string;
  description: string;
  entries: TeamWorkspaceActivityEntry[];
}

const PENDING_INPUT_SOURCE_TYPES = new Set([
  "approval_request",
  "request_user_input",
]);
const TOOL_ACTIVITY_SOURCE_TYPES = new Set([
  "command_execution",
  "tool_call",
  "web_search",
]);
const RECENT_MESSAGE_SOURCE_TYPES = new Set([
  "agent_message",
  "message_fallback",
  "plan",
  "reasoning",
  "turn_summary",
  "user_message",
]);

const TRANSCRIPT_ENTRY_SOURCE_LABELS: Record<string, string> = {
  agent_message: "回复",
  approval_request: "等待确认",
  command_execution: "命令执行",
  message_fallback: "消息",
  plan: "计划",
  reasoning: "推理",
  request_user_input: "等待补充",
  tool_call: "工具调用",
  turn_summary: "步骤摘要",
  user_message: "用户消息",
  web_search: "联网搜索",
};

const AGENT_UI_SURFACE_LABELS: Record<string, string> = {
  artifact_workspace: "交付物工作区",
  background_teammate: "后台队友",
  conversation: "对话",
  delegation_graph: "分派关系",
  diagnostics: "诊断",
  handoff_lane: "交接",
  hitl: "人工确认",
  inline_process: "过程",
  remote_teammate: "远程队友",
  review_lane: "评审",
  runtime_status: "进度",
  session_tabs: "任务记录",
  task_capsule: "任务",
  team_policy: "团队策略",
  team_roster: "成员",
  teammate_transcript: "队友记录",
  timeline_evidence: "证据",
  tool_ui: "工具界面",
  work_board: "任务板",
  worker_notifications: "执行通知",
};

function formatTranscriptEntrySourceLabel(sourceType?: string | null): string {
  const normalized = sourceType?.trim();
  if (!normalized) {
    return "活动";
  }
  return TRANSCRIPT_ENTRY_SOURCE_LABELS[normalized] ?? "活动";
}

function formatAgentUiSurfaceLabel(
  surface?: string | null,
  t?: AgentUiProjectionTranslation,
): string {
  const normalized = surface?.trim();
  if (!normalized) {
    return "工作区";
  }
  return formatAgentUiProjectionSurfaceLabel(
    normalized,
    t,
    AGENT_UI_SURFACE_LABELS[normalized] ?? "工作区",
  );
}

function sanitizeWorkbenchEventText(value: string): string {
  return value
    .replace(/Agent UI/g, "工作台")
    .replace(/AgentRuntime/g, "后台运行")
    .replace(/\btranscript drilldown\b/gi, "记录明细")
    .replace(/\btranscript\b/gi, "记录")
    .replace(/([\u4e00-\u9fff])\s+(工作台|后台运行|记录明细|记录)/g, "$1$2")
    .replace(/(工作台|后台运行|记录明细|记录)\s+([\u4e00-\u9fff])/g, "$1$2");
}

function formatWorkbenchProjectionEventDetail(
  event: AgentUiProjectionEvent,
): string {
  return sanitizeWorkbenchEventText(formatAgentUiProjectionEventDetail(event));
}

function formatWorkbenchProjectionEventAuxiliaryDetail(
  event: AgentUiProjectionEvent,
): string | null {
  const detail = formatAgentUiProjectionEventAuxiliaryDetail(event);
  return detail ? sanitizeWorkbenchEventText(detail) : null;
}

function matchesTranscriptEntrySource(
  entry: TeamWorkspaceActivityEntry,
  sourceTypes: Set<string>,
) {
  return Boolean(entry.sourceType && sourceTypes.has(entry.sourceType));
}

function buildTranscriptEntryGroups(
  entries: TeamWorkspaceActivityEntry[],
): WorkbenchTranscriptEntryGroup[] {
  const groups: WorkbenchTranscriptEntryGroup[] = [
    {
      kind: "pending_input",
      label: "待处理输入",
      description: "等待你确认或补充的结构化请求。",
      entries: entries.filter((entry) =>
        matchesTranscriptEntrySource(entry, PENDING_INPUT_SOURCE_TYPES),
      ),
    },
    {
      kind: "tool_activity",
      label: "工具活动",
      description: "工具、命令和联网搜索的最新动作。",
      entries: entries.filter((entry) =>
        matchesTranscriptEntrySource(entry, TOOL_ACTIVITY_SOURCE_TYPES),
      ),
    },
    {
      kind: "recent_messages",
      label: "近期消息",
      description: "用户消息、回复、推理和计划的有界预览。",
      entries: entries.filter((entry) =>
        matchesTranscriptEntrySource(entry, RECENT_MESSAGE_SOURCE_TYPES),
      ),
    },
  ];
  return groups.filter((group) => group.entries.length > 0);
}

function buildQueuedTurnRows(
  queuedTurns?: QueuedTurnSnapshot[] | null,
): QueuedTurnSnapshot[] {
  return [...(queuedTurns ?? [])]
    .sort((left, right) => left.position - right.position)
    .slice(0, TRANSCRIPT_PENDING_QUEUE_LIMIT);
}

export function TeamWorkbenchSummaryPanel({
  currentSessionId,
  currentSessionRuntimeStatus,
  currentSessionLatestTurnStatus,
  currentSessionQueuedTurnCount = 0,
  childSubagentSessions = [],
  subagentParentContext = null,
  liveRuntimeBySessionId = {},
  liveActivityBySessionId = {},
  teamWaitSummary = null,
  teamControlSummary = null,
  selectedTeamLabel,
  selectedTeamSummary,
  selectedTeamRoles = [],
  teamDispatchPreviewState = null,
  teamMemorySnapshot = null,
  onWorkbenchAction,
  onWorkbenchReassign,
}: TeamWorkbenchSummaryPanelProps) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.resolvedLanguage || i18n.language;
  const translateProjection = useCallback<AgentUiProjectionTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateFormation = useCallback<TeamWorkspaceFormationTranslate>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateActivityPreview = useCallback<ActivityPreviewTranslate>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const teamText = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      String(
        t(
          key as never,
          {
            defaultValue,
            ...options,
          } as never,
        ),
      ),
    [t],
  );
  const formationCopy = useMemo(
    () =>
      buildTeamWorkspaceFormationCopy({
        locale,
        translate: translateFormation,
      }),
    [locale, translateFormation],
  );
  const activityPreviewCopy = useMemo(
    () =>
      buildActivityPreviewCopy({
        translate: translateActivityPreview,
      }),
    [translateActivityPreview],
  );
  const [selectedWorkbenchItem, setSelectedWorkbenchItem] =
    useState<AgentUiTeamWorkbenchViewItem | null>(null);
  const [
    selectedWorkbenchActionRouteResult,
    setSelectedWorkbenchActionRouteResult,
  ] = useState<string | null>(null);
  const [selectedReassignmentAssignee, setSelectedReassignmentAssignee] =
    useState("");
  const [reassignmentPending, setReassignmentPending] = useState(false);
  const [reassignmentError, setReassignmentError] = useState<string | null>(
    null,
  );
  const [selectedTranscriptHistoryState, setSelectedTranscriptHistoryState] =
    useState<WorkbenchTranscriptHistoryState | null>(null);
  const [showWorkbenchTechnicalDetails, setShowWorkbenchTechnicalDetails] =
    useState(false);
  useRemoteTaskExecutionRunProjection({
    enabled: Boolean(currentSessionId),
    sessionId: currentSessionId,
  });
  const dispatchPreviewState = teamDispatchPreviewState;
  const executionSummary = summarizeTeamWorkspaceExecution({
    currentSessionId,
    currentSessionRuntimeStatus,
    currentSessionLatestTurnStatus,
    currentSessionQueuedTurnCount,
    childSubagentSessions,
    subagentParentContext,
    liveRuntimeBySessionId,
  });
  const hasRuntimeSessions = executionSummary.totalSessionCount > 0;
  const runtimeFormationDisplay = buildRuntimeFormationDisplayState({
    copy: formationCopy,
    teamDispatchPreviewState: dispatchPreviewState,
    fallbackLabel: selectedTeamLabel,
    fallbackSummary: selectedTeamSummary,
  });
  const runtimeTeamLabel = runtimeFormationDisplay.panelLabel;
  const operationSummary = buildOperationSummary({
    teamWaitSummary,
    teamControlSummary,
  });
  const latestActivity = Object.values(liveActivityBySessionId)
    .flat()
    .slice(0, 4);
  const agentUiProjectionFilter = useMemo(
    () => ({ sessionId: currentSessionId ?? "__team-workbench-disabled__" }),
    [currentSessionId],
  );
  const agentUiProjectionEvents = useAgentUiProjectionEvents(
    agentUiProjectionFilter,
  );
  const teamWorkbenchProjectionSummary = useMemo(
    () =>
      summarizeAgentUiTeamWorkbenchProjectionEvents(agentUiProjectionEvents),
    [agentUiProjectionEvents],
  );
  const agentUiSurfaceLanes = useMemo(
    () =>
      summarizeAgentUiTeamWorkbenchSurfaceLanes(agentUiProjectionEvents, {
        t: translateProjection,
      }),
    [agentUiProjectionEvents, translateProjection],
  );
  const agentUiSurfaceSummaries = useMemo(
    () =>
      summarizeAgentUiTeamWorkbenchSurfaces(agentUiProjectionEvents, {
        latestLimit: 3,
        t: translateProjection,
      }),
    [agentUiProjectionEvents, translateProjection],
  );
  const selectedWorkbenchTargetRows = useMemo(
    () =>
      selectedWorkbenchItem
        ? buildWorkbenchActionTargetRows(selectedWorkbenchItem)
        : [],
    [selectedWorkbenchItem],
  );
  const selectedWorkbenchRelatedEvents = useMemo(
    () =>
      buildSelectedWorkbenchRelatedEvents(
        agentUiProjectionEvents,
        selectedWorkbenchItem,
      ),
    [agentUiProjectionEvents, selectedWorkbenchItem],
  );
  const selectedWorkbenchTranscriptZoom = useMemo(
    () => buildWorkbenchTranscriptZoom(selectedWorkbenchItem),
    [selectedWorkbenchItem],
  );
  const selectedWorkbenchActionRouteStatus = useMemo(
    () => buildWorkbenchActionRouteStatus(selectedWorkbenchActionRouteResult),
    [selectedWorkbenchActionRouteResult],
  );
  const selectedWorkbenchReassignmentCandidates = useMemo(
    () =>
      canReassignWorkbenchItem(selectedWorkbenchItem)
        ? buildWorkbenchReassignmentCandidates({
            childSubagentSessions,
            selectedItem: selectedWorkbenchItem,
            selectedTeamRoles: selectedTeamRoles ?? [],
            teamDispatchPreviewState: dispatchPreviewState,
          })
        : [],
    [
      childSubagentSessions,
      dispatchPreviewState,
      selectedTeamRoles,
      selectedWorkbenchItem,
    ],
  );
  const selectedWorkbenchCanReassign = Boolean(
    onWorkbenchReassign &&
    canReassignWorkbenchItem(selectedWorkbenchItem) &&
    selectedWorkbenchReassignmentCandidates.length > 0,
  );
  const selectedTranscriptChildSessionId =
    selectedWorkbenchTranscriptZoom?.childSessionId;
  const selectedTranscriptChildSession = useMemo(
    () =>
      selectedTranscriptChildSessionId
        ? (childSubagentSessions.find(
            (session) => session.id === selectedTranscriptChildSessionId,
          ) ?? null)
        : null,
    [childSubagentSessions, selectedTranscriptChildSessionId],
  );
  const selectedTranscriptLiveActivityEntries = useMemo(
    () =>
      selectedTranscriptChildSessionId
        ? (
            liveActivityBySessionId[selectedTranscriptChildSessionId] ?? []
          ).slice(0, 3)
        : [],
    [liveActivityBySessionId, selectedTranscriptChildSessionId],
  );
  useEffect(() => {
    const sessionId = selectedTranscriptChildSessionId;
    if (!sessionId || selectedTranscriptLiveActivityEntries.length > 0) {
      setSelectedTranscriptHistoryState(null);
      return;
    }

    let cancelled = false;
    setSelectedTranscriptHistoryState((previous) => ({
      sessionId,
      status: "loading",
      entries: previous?.sessionId === sessionId ? previous.entries : [],
      queuedTurns:
        previous?.sessionId === sessionId ? previous.queuedTurns : [],
    }));

    void getAgentRuntimeSession(sessionId, {
      historyLimit: TRANSCRIPT_HISTORY_FETCH_LIMIT,
    })
      .then((detail) => {
        if (cancelled) {
          return;
        }
        const snapshot = extractSessionActivitySnapshot(
          detail,
          TRANSCRIPT_HISTORY_ENTRY_LIMIT,
          { copy: activityPreviewCopy },
        );
        setSelectedTranscriptHistoryState({
          sessionId,
          status: "ready",
          entries: snapshot.entries,
          queuedTurns: buildQueuedTurnRows(detail.queued_turns),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setSelectedTranscriptHistoryState({
          sessionId,
          status: "error",
          entries: [],
          queuedTurns: [],
          errorMessage:
            error instanceof Error
              ? error.message
              : activityPreviewCopy.historyReadFailed,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activityPreviewCopy,
    selectedTranscriptChildSessionId,
    selectedTranscriptLiveActivityEntries.length,
  ]);
  const selectedTranscriptHistoryEntries = useMemo(
    () =>
      selectedTranscriptHistoryState &&
      selectedTranscriptHistoryState.sessionId ===
        selectedTranscriptChildSessionId &&
      selectedTranscriptHistoryState.status === "ready"
        ? selectedTranscriptHistoryState.entries
        : [],
    [selectedTranscriptChildSessionId, selectedTranscriptHistoryState],
  );
  const selectedTranscriptActivityEntries = useMemo(
    () =>
      mergeSessionActivityEntries(
        selectedTranscriptLiveActivityEntries,
        selectedTranscriptHistoryEntries,
        TRANSCRIPT_HISTORY_ENTRY_LIMIT,
      ),
    [selectedTranscriptHistoryEntries, selectedTranscriptLiveActivityEntries],
  );
  const selectedTranscriptQueuedTurns = useMemo(
    () =>
      selectedTranscriptHistoryState &&
      selectedTranscriptHistoryState.sessionId ===
        selectedTranscriptChildSessionId &&
      selectedTranscriptHistoryState.status === "ready"
        ? selectedTranscriptHistoryState.queuedTurns
        : [],
    [selectedTranscriptChildSessionId, selectedTranscriptHistoryState],
  );
  const selectedTranscriptEntryGroups = useMemo(
    () => buildTranscriptEntryGroups(selectedTranscriptActivityEntries),
    [selectedTranscriptActivityEntries],
  );
  const selectedTranscriptHistoryStatus =
    selectedTranscriptHistoryState &&
    selectedTranscriptHistoryState.sessionId ===
      selectedTranscriptChildSessionId
      ? selectedTranscriptHistoryState.status
      : null;
  const selectedTranscriptRuntimeState = selectedTranscriptChildSessionId
    ? liveRuntimeBySessionId[selectedTranscriptChildSessionId]
    : undefined;
  const selectedTranscriptRuntimeStatusLabel =
    resolveTeamWorkspaceDisplayRuntimeStatusLabel(
      selectedTranscriptRuntimeState?.runtimeStatus ??
        selectedTranscriptChildSession?.runtime_status,
    );
  const selectedTranscriptLatestTurnStatusLabel =
    resolveTeamWorkspaceDisplayRuntimeStatusLabel(
      selectedTranscriptRuntimeState?.latestTurnStatus ??
        selectedTranscriptChildSession?.latest_turn_status,
    );
  const handleWorkbenchAction = useCallback(
    (item: AgentUiTeamWorkbenchViewItem) => {
      setSelectedWorkbenchItem(item);
      setSelectedWorkbenchActionRouteResult(null);
      setReassignmentError(null);
      const routeResult = onWorkbenchAction?.(item);
      if (typeof routeResult === "string") {
        setSelectedWorkbenchActionRouteResult(routeResult);
        return;
      }
      if (isPromiseLikeRouteResult(routeResult)) {
        void routeResult
          .then((result) => {
            setSelectedWorkbenchActionRouteResult(result ?? null);
          })
          .catch(() => {
            setSelectedWorkbenchActionRouteResult("unsupported");
          });
      }
    },
    [onWorkbenchAction],
  );
  useEffect(() => {
    setReassignmentError(null);
    if (!selectedWorkbenchCanReassign) {
      setSelectedReassignmentAssignee("");
      return;
    }

    setSelectedReassignmentAssignee((previous) =>
      selectedWorkbenchReassignmentCandidates.some(
        (candidate) => candidate.value === previous,
      )
        ? previous
        : (selectedWorkbenchReassignmentCandidates[0]?.value ?? ""),
    );
  }, [selectedWorkbenchCanReassign, selectedWorkbenchReassignmentCandidates]);
  const handleWorkbenchReassign = useCallback(async () => {
    if (
      !selectedWorkbenchItem ||
      !onWorkbenchReassign ||
      !selectedReassignmentAssignee
    ) {
      return;
    }

    setReassignmentPending(true);
    setReassignmentError(null);
    try {
      const routeResult = await onWorkbenchReassign(
        selectedWorkbenchItem,
        selectedReassignmentAssignee,
      );
      setSelectedWorkbenchActionRouteResult(
        routeResult ?? "seeded_reassignment",
      );
    } catch (error) {
      setSelectedWorkbenchActionRouteResult("unsupported");
      setReassignmentError(
        error instanceof Error ? error.message : "重指派回填失败",
      );
    } finally {
      setReassignmentPending(false);
    }
  }, [
    onWorkbenchReassign,
    selectedReassignmentAssignee,
    selectedWorkbenchItem,
  ]);
  useEffect(() => {
    setSelectedWorkbenchItem(null);
    setSelectedWorkbenchActionRouteResult(null);
    setSelectedReassignmentAssignee("");
    setReassignmentError(null);
    setShowWorkbenchTechnicalDetails(false);
  }, [currentSessionId]);
  const selectedRoleCount = (selectedTeamRoles ?? []).filter((role) =>
    role.label.trim(),
  ).length;
  const displayRoleCount = hasRuntimeSessions
    ? executionSummary.totalSessionCount
    : (dispatchPreviewState?.members.length ?? selectedRoleCount);
  const roleCards = dispatchPreviewState?.members.length
    ? dispatchPreviewState.members.map((member) => {
        const statusMeta = resolveRuntimeMemberStatusMeta(member.status);
        return {
          id: member.id,
          label:
            normalizeTeamWorkspaceDisplayValue(member.label) || member.label,
          roleKey: member.roleKey,
          profileId: member.profileId,
          summary:
            normalizeTeamWorkspaceDisplayValue(member.summary) ||
            member.summary,
          skillIds: member.skillIds,
          statusMeta: {
            badgeClassName: statusMeta.badgeClassName,
            label: formationCopy.getMemberStatusLabel(member.status),
          },
        };
      })
    : (selectedTeamRoles ?? []).map((role) => ({
        id: role.id,
        label: normalizeTeamWorkspaceDisplayValue(role.label) || role.label,
        roleKey: role.roleKey,
        profileId: role.profileId,
        summary:
          normalizeTeamWorkspaceDisplayValue(role.summary) || role.summary,
        skillIds: role.skillIds ?? [],
        statusMeta: null,
      }));
  const summaryCards: Array<{ label: string; value: string; hint: string }> =
    [];
  if (executionSummary.activeSessionCount > 0) {
    summaryCards.push({
      label: "活跃任务",
      value: String(executionSummary.activeSessionCount),
      hint: "任务进行中",
    });
  }
  if (executionSummary.runningSessionCount > 0) {
    summaryCards.push({
      label: "处理中",
      value: String(executionSummary.runningSessionCount),
      hint: "正在推进",
    });
  }
  if (executionSummary.queuedSessionCount > 0) {
    summaryCards.push({
      label: "稍后开始",
      value: String(executionSummary.queuedSessionCount),
      hint: "按顺序继续",
    });
  }
  if (!hasRuntimeSessions && dispatchPreviewState) {
    summaryCards.push({
      label: "当前任务",
      value: String(displayRoleCount),
      hint: "当前分工",
    });
  } else if (!hasRuntimeSessions && selectedRoleCount > 0) {
    summaryCards.push({
      label: "计划分工",
      value: String(displayRoleCount),
      hint: "已选方案",
    });
  }
  const agentUiSurfaceCards = [
    {
      label: "成员",
      value: teamWorkbenchProjectionSummary.rosterCount,
      hint: "team_roster",
    },
    {
      label: "分派",
      value: teamWorkbenchProjectionSummary.delegationCount,
      hint: "delegation_graph",
    },
    {
      label: "任务板",
      value: teamWorkbenchProjectionSummary.workBoardCount,
      hint: "work_board",
    },
    {
      label: "通知",
      value: teamWorkbenchProjectionSummary.workerNotificationCount,
      hint: "worker_notifications",
    },
    {
      label: "交接",
      value: teamWorkbenchProjectionSummary.handoffCount,
      hint: "handoff_lane",
    },
    {
      label: "审核",
      value: teamWorkbenchProjectionSummary.reviewCount,
      hint: "review_lane",
    },
    {
      label: "记录",
      value: teamWorkbenchProjectionSummary.transcriptCount,
      hint: "teammate_transcript",
    },
    {
      label: "后台",
      value: teamWorkbenchProjectionSummary.backgroundCount,
      hint: "background_teammate",
    },
    {
      label: "外部",
      value: teamWorkbenchProjectionSummary.remoteCount,
      hint: "remote_teammate",
    },
    {
      label: "策略",
      value: teamWorkbenchProjectionSummary.policyCount,
      hint: "team_policy",
    },
  ];
  const technicalDetailsTitle = teamText(
    "agentChat.teamWorkbench.details.title",
    "工作台细节",
  );
  const technicalDetailsCount = teamText(
    "agentChat.teamWorkbench.details.count",
    "{{count}} 条记录",
    {
      count: teamWorkbenchProjectionSummary.total,
    },
  );
  const technicalDetailsToggleLabel = showWorkbenchTechnicalDetails
    ? teamText("agentChat.teamWorkbench.details.hideAria", "隐藏工作台细节")
    : teamText("agentChat.teamWorkbench.details.showAria", "查看工作台细节");
  const technicalDetailsHelp = teamText(
    "agentChat.teamWorkbench.details.help",
    "查看调度、评审、交接等细节",
  );
  const countUnitText = teamText("agentChat.teamWorkbench.countUnit", "条");
  const selectedTargetTitle = teamText(
    "agentChat.teamWorkbench.selectedTarget.title",
    "已定位工作台目标",
  );
  const selectedTargetDescription = teamText(
    "agentChat.teamWorkbench.selectedTarget.description",
    "这里只定位工作台里的目标，不根据普通文本猜测状态，也不直接代替外部任务、审核或交接操作。",
  );
  const actionViewFallback = teamText(
    "agentChat.teamWorkbench.action.view",
    "查看",
  );
  const reassignmentTitle = teamText(
    "agentChat.teamWorkbench.reassignment.title",
    "负责人重指派",
  );
  const reassignmentBadge = teamText(
    "agentChat.teamWorkbench.reassignment.badge",
    "负责人更新",
  );
  const reassignmentDescription = teamText(
    "agentChat.teamWorkbench.reassignment.description",
    "选择目标负责人后只回填负责人更新指令；发送并执行后，以后台返回的负责人变化为准。",
  );
  const reassignmentAssigneeAria = teamText(
    "agentChat.teamWorkbench.reassignment.assigneeAria",
    "选择重指派负责人",
  );
  const reassignmentSubmitText = reassignmentPending
    ? teamText("agentChat.teamWorkbench.reassignment.pending", "回填中...")
    : teamText("agentChat.teamWorkbench.reassignment.submit", "回填重指派指令");
  const relatedTitle = teamText(
    "agentChat.teamWorkbench.related.title",
    "相关队友链路",
  );
  const relatedCountText = teamText(
    "agentChat.teamWorkbench.related.count",
    "{{count}} 条事件",
    { count: selectedWorkbenchRelatedEvents.length },
  );
  const relatedDescription = teamText(
    "agentChat.teamWorkbench.related.description",
    "按成员、任务、工作项、队友记录与产物引用匹配同一目标；这里只串联已有状态，不生成新状态。",
  );
  const transcriptTitle = teamText(
    "agentChat.teamWorkbench.transcript.title",
    "队友记录详情",
  );
  const transcriptBadge = teamText(
    "agentChat.teamWorkbench.transcript.badge",
    "队友记录",
  );
  const transcriptDescription = teamText(
    "agentChat.teamWorkbench.transcript.description",
    "正文来自选中成员的活动预览；这里仅展示引用与焦点，不把队友输出混进主回复。",
  );
  const transcriptRefLabel = teamText(
    "agentChat.teamWorkbench.transcript.refLabel",
    "记录引用：",
  );
  const transcriptParentLabel = teamText(
    "agentChat.teamWorkbench.transcript.parentLabel",
    "父级任务：",
  );
  const transcriptChildLabel = teamText(
    "agentChat.teamWorkbench.transcript.childLabel",
    "队友任务：",
  );
  const transcriptTurnLabel = teamText(
    "agentChat.teamWorkbench.transcript.turnLabel",
    "最新步骤：",
  );
  const childOverviewTitle = teamText(
    "agentChat.teamWorkbench.transcript.childOverview",
    "队友任务概览",
  );
  const childStatusText = teamText(
    "agentChat.teamWorkbench.transcript.status",
    "状态：{{status}}",
    { status: selectedTranscriptRuntimeStatusLabel },
  );
  const childTurnStatusText = teamText(
    "agentChat.teamWorkbench.transcript.turnStatus",
    "步骤状态：{{status}}",
    { status: selectedTranscriptLatestTurnStatusLabel },
  );
  const transcriptRoleText = selectedTranscriptChildSession?.role_hint
    ? teamText("agentChat.teamWorkbench.transcript.role", "角色：{{role}}", {
        role: selectedTranscriptChildSession.role_hint,
      })
    : "";
  const transcriptSummaryText = selectedTranscriptChildSession?.task_summary
    ? teamText(
        "agentChat.teamWorkbench.transcript.taskSummary",
        "任务摘要：{{summary}}",
        { summary: selectedTranscriptChildSession.task_summary },
      )
    : "";
  const drilldownTitle = teamText(
    "agentChat.teamWorkbench.transcript.drilldown",
    "记录明细",
  );
  const queuedTurnsChipText = teamText(
    "agentChat.teamWorkbench.transcript.queuedTurns",
    "输入队列 {{count}} 条",
    { count: selectedTranscriptQueuedTurns.length },
  );
  const drilldownDescription = teamText(
    "agentChat.teamWorkbench.transcript.drilldownDescription",
    "这里只展示已有输入队列与历史正文；没有记录时不合成等待、工具或消息状态。",
  );
  const queuedTurnsTitle = teamText(
    "agentChat.teamWorkbench.transcript.queuedTurnsTitle",
    "输入队列",
  );
  const imageCountText = (count: number) =>
    teamText(
      "agentChat.teamWorkbench.transcript.imageCount",
      "· 图片 {{count}}",
      {
        count,
      },
    );
  const childProgressTitle = teamText(
    "agentChat.teamWorkbench.transcript.progress",
    "队友任务进展",
  );
  const childProgressCountText = teamText(
    "agentChat.teamWorkbench.transcript.progressCount",
    "{{count}} 条",
    { count: selectedTranscriptActivityEntries.length },
  );
  const childLiveCountText = teamText(
    "agentChat.teamWorkbench.transcript.liveCount",
    "实时 {{count}} 条",
    { count: selectedTranscriptLiveActivityEntries.length },
  );
  const childHistoryCountText = teamText(
    "agentChat.teamWorkbench.transcript.historyCount",
    "历史正文 {{count}} 条",
    { count: selectedTranscriptHistoryEntries.length },
  );
  const historyLoadingText = teamText(
    "agentChat.teamWorkbench.transcript.historyLoading",
    "正在读取历史正文",
  );
  const historyLoadingDescription = teamText(
    "agentChat.teamWorkbench.transcript.historyLoadingDescription",
    "正在读取历史正文；读取结果只作为队友记录预览，不进入主回复。",
  );
  const historyErrorText = teamText(
    "agentChat.teamWorkbench.transcript.historyError",
    "读取历史正文失败：{{message}}",
    { message: selectedTranscriptHistoryState?.errorMessage ?? "未知错误" },
  );
  const noTranscriptActivityText = teamText(
    "agentChat.teamWorkbench.transcript.noActivity",
    "还没有收到这项任务的实时活动，历史正文也暂无可展示过程；如需完整上下文，请继续聚焦对应任务读取。",
  );
  const surfaceSummaryTitle = teamText(
    "agentChat.teamWorkbench.surfaceSummary.title",
    "工作区专门视图",
  );
  const referenceLabelText = runtimeFormationDisplay.referenceLabel
    ? teamText("agentChat.teamWorkbench.reference", "参考方案：{{label}}", {
        label: runtimeFormationDisplay.referenceLabel,
      })
    : "";
  const recentActivityTitle = teamText(
    "agentChat.teamWorkbench.recentActivity.title",
    "最近动态",
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <Workflow className="h-3.5 w-3.5" />
          <span>
            {teamText("agentChat.teamWorkbench.header.generate", "生成")}
          </span>
          {runtimeTeamLabel ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium tracking-normal text-sky-700 normal-case">
              {runtimeTeamLabel}
            </span>
          ) : null}
          {runtimeFormationDisplay.panelStatusLabel ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case",
                runtimeFormationDisplay.panelStatusBadgeClassName,
              )}
            >
              {runtimeFormationDisplay.panelStatusLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-900">
          {executionSummary.statusTitle ||
            runtimeFormationDisplay.panelHeadline ||
            teamText(
              "agentChat.teamWorkbench.header.readyFallback",
              "生成已就绪，等待主线程开始编排",
            )}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {runtimeFormationDisplay.panelDescription}
        </p>
        {!hasRuntimeSessions && dispatchPreviewState ? (
          <div
            className={cn(
              "mt-3 rounded-2xl border px-3 py-2 text-xs leading-5",
              runtimeFormationDisplay.panelStatusBadgeClassName ||
                "border border-slate-200 bg-slate-50 text-slate-700",
            )}
          >
            {runtimeFormationDisplay.noticeText}
          </div>
        ) : null}
      </section>

      {teamMemorySnapshot ? (
        <TeamMemoryShadowCard snapshot={teamMemorySnapshot} />
      ) : null}

      {summaryCards.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {card.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {card.value}
              </div>
              <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
            </div>
          ))}
        </section>
      ) : null}

      {teamWorkbenchProjectionSummary.total > 0 ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <Workflow className="h-3.5 w-3.5 shrink-0" />
              <span>{technicalDetailsTitle}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium tracking-normal text-emerald-700 normal-case">
                {technicalDetailsCount}
              </span>
            </div>
            <button
              type="button"
              aria-label={technicalDetailsToggleLabel}
              title={technicalDetailsHelp}
              data-testid="team-workbench-technical-details-toggle"
              onClick={() =>
                setShowWorkbenchTechnicalDetails((current) => !current)
              }
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </div>
          {showWorkbenchTechnicalDetails ? (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {agentUiSurfaceCards.map((card) => (
                  <div
                    key={`team-workbench-agentui-surface-${card.hint}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {card.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {card.value}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {formatAgentUiSurfaceLabel(
                        card.hint,
                        translateProjection,
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {agentUiSurfaceLanes.length > 0 ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {agentUiSurfaceLanes.map((lane) => (
                    <div
                      key={`team-workbench-agentui-lane-${lane.id}`}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            {lane.label}
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-slate-500">
                            {lane.description}
                          </div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                          {lane.total}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {lane.latestEvents.map((event) => (
                          <div
                            key={`team-workbench-agentui-lane-event-${lane.id}-${event.sequence ?? event.type}-${event.agentId ?? event.taskId ?? event.reviewId ?? event.handoffId ?? event.surface}`}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"
                          >
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-700">
                                {formatAgentUiProjectionEventType(
                                  event.type,
                                  translateProjection,
                                )}
                              </span>
                              {event.surface ? (
                                <span>
                                  {formatAgentUiSurfaceLabel(
                                    event.surface,
                                    translateProjection,
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] text-slate-500">
                              {formatWorkbenchProjectionEventDetail(event)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <AgentUiTeamWorkbenchSurfaceView
                events={agentUiProjectionEvents}
                latestLimit={2}
                onAction={handleWorkbenchAction}
              />
              {selectedWorkbenchItem ? (
                <div
                  className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3"
                  data-agentui-selected-workbench-action
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {selectedTargetTitle}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700">
                      {selectedWorkbenchItem.action?.label ??
                        actionViewFallback}{" "}
                      ·{" "}
                      {selectedWorkbenchItem.action?.targetId ??
                        selectedWorkbenchItem.id}
                    </span>
                    {selectedWorkbenchItem.event.surface ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                        {formatAgentUiSurfaceLabel(
                          selectedWorkbenchItem.event.surface,
                          translateProjection,
                        )}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-600">
                    {selectedTargetDescription}
                  </p>
                  {selectedWorkbenchActionRouteStatus ? (
                    <div
                      className={cn(
                        "mt-2 rounded-xl border px-3 py-2 text-[10px] leading-4",
                        selectedWorkbenchActionRouteStatus.className,
                      )}
                      data-agentui-workbench-route-result
                    >
                      <span className="font-semibold">
                        {selectedWorkbenchActionRouteStatus.label}
                      </span>
                      <span className="ml-1">
                        {selectedWorkbenchActionRouteStatus.detail}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs font-medium text-slate-900">
                    {selectedWorkbenchItem.title}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-4 text-slate-600">
                    {selectedWorkbenchItem.subtitle}
                  </div>
                  {selectedWorkbenchTargetRows.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedWorkbenchTargetRows.map((target) => (
                        <span
                          key={`${target.label}-${target.value}`}
                          className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] text-sky-700"
                        >
                          {target.label}：{target.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedWorkbenchCanReassign ? (
                    <div
                      className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3"
                      data-agentui-reassignment-selector
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          {reassignmentTitle}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                          {reassignmentBadge}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        {reassignmentDescription}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={selectedReassignmentAssignee}
                          onChange={(event) =>
                            setSelectedReassignmentAssignee(event.target.value)
                          }
                          className="h-8 min-w-[180px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm shadow-slate-950/5 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                          data-agentui-reassignment-select
                          aria-label={reassignmentAssigneeAria}
                        >
                          {selectedWorkbenchReassignmentCandidates.map(
                            (candidate) => (
                              <option
                                key={`agentui-reassignment-candidate-${candidate.value}`}
                                value={candidate.value}
                              >
                                {candidate.label}
                                {candidate.detail
                                  ? `（${sanitizeWorkbenchEventText(candidate.detail)}）`
                                  : ""}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-xl bg-slate-900 px-3 text-xs font-medium text-white shadow-sm shadow-slate-950/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          disabled={
                            reassignmentPending || !selectedReassignmentAssignee
                          }
                          onClick={() => void handleWorkbenchReassign()}
                          data-agentui-reassignment-submit
                        >
                          {reassignmentSubmitText}
                        </button>
                      </div>
                      {reassignmentError ? (
                        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700">
                          {reassignmentError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedWorkbenchRelatedEvents.length > 1 ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          {relatedTitle}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                          {relatedCountText}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        {relatedDescription}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {selectedWorkbenchRelatedEvents.map((event) => {
                          const auxiliaryDetail =
                            formatWorkbenchProjectionEventAuxiliaryDetail(
                              event,
                            );
                          return (
                            <div
                              key={`selected-workbench-related-${event.sequence ?? event.type}-${event.surface ?? event.sourceType}-${event.agentId ?? event.taskId ?? event.reviewId ?? event.handoffId ?? event.workerNotificationId ?? event.rawEventRef}`}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                                <span className="font-semibold text-slate-700">
                                  {formatAgentUiProjectionEventType(
                                    event.type,
                                    translateProjection,
                                  )}
                                </span>
                                <span>
                                  {formatAgentUiProjectionPhase(
                                    event.phase,
                                    translateProjection,
                                  )}
                                </span>
                                {event.surface ? (
                                  <span>
                                    {formatAgentUiSurfaceLabel(
                                      event.surface,
                                      translateProjection,
                                    )}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                {formatWorkbenchProjectionEventDetail(event)}
                              </div>
                              {auxiliaryDetail ? (
                                <div className="mt-0.5 truncate text-[10px] text-slate-400">
                                  {auxiliaryDetail}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {selectedWorkbenchTranscriptZoom ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          {transcriptTitle}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                          {transcriptBadge}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        {transcriptDescription}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                          {transcriptRefLabel}
                          {selectedWorkbenchTranscriptZoom.transcriptRef}
                        </span>
                        {selectedWorkbenchTranscriptZoom.parentSessionId ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                            {transcriptParentLabel}
                            {selectedWorkbenchTranscriptZoom.parentSessionId}
                          </span>
                        ) : null}
                        {selectedWorkbenchTranscriptZoom.childSessionId ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                            {transcriptChildLabel}
                            {selectedWorkbenchTranscriptZoom.childSessionId}
                          </span>
                        ) : null}
                        {selectedWorkbenchTranscriptZoom.latestTurnId ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                            {transcriptTurnLabel}
                            {selectedWorkbenchTranscriptZoom.latestTurnId}
                          </span>
                        ) : null}
                      </div>
                      {selectedTranscriptChildSession ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-semibold text-slate-800">
                              {childOverviewTitle}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                              {selectedTranscriptChildSession.name ??
                                selectedTranscriptChildSession.id}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                              {childStatusText}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                              {childTurnStatusText}
                            </span>
                            {selectedTranscriptChildSession.role_hint ? (
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                                {transcriptRoleText}
                              </span>
                            ) : null}
                          </div>
                          {selectedTranscriptChildSession.task_summary ? (
                            <p className="mt-2 text-[10px] leading-4 text-slate-600">
                              {transcriptSummaryText}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {selectedTranscriptQueuedTurns.length > 0 ||
                      selectedTranscriptEntryGroups.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-semibold text-slate-800">
                              {drilldownTitle}
                            </span>
                            {selectedTranscriptQueuedTurns.length > 0 ? (
                              <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-amber-700">
                                {queuedTurnsChipText}
                              </span>
                            ) : null}
                            {selectedTranscriptEntryGroups.map((group) => (
                              <span
                                key={`transcript-zoom-group-chip-${group.kind}`}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600"
                              >
                                {group.label} {group.entries.length}{" "}
                                {countUnitText}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-slate-600">
                            {drilldownDescription}
                          </p>
                          {selectedTranscriptQueuedTurns.length > 0 ? (
                            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2">
                              <div className="text-[10px] font-semibold text-amber-800">
                                {queuedTurnsTitle}
                              </div>
                              <div className="mt-1 space-y-1">
                                {selectedTranscriptQueuedTurns.map((turn) => (
                                  <div
                                    key={`transcript-zoom-queued-turn-${turn.queued_turn_id}`}
                                    className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] leading-4 text-amber-800"
                                  >
                                    <span className="font-semibold">
                                      #{turn.position + 1}
                                    </span>
                                    <span className="ml-1">
                                      {sanitizeWorkbenchEventText(
                                        turn.message_preview,
                                      )}
                                    </span>
                                    {turn.image_count > 0 ? (
                                      <span className="ml-1 text-amber-600">
                                        {imageCountText(turn.image_count)}
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {selectedTranscriptEntryGroups.length > 0 ? (
                            <div className="mt-2 grid gap-2 lg:grid-cols-3">
                              {selectedTranscriptEntryGroups.map((group) => (
                                <div
                                  key={`transcript-zoom-group-${group.kind}`}
                                  className="rounded-xl border border-slate-200 bg-white px-2 py-2"
                                >
                                  <div className="text-[10px] font-semibold text-slate-800">
                                    {group.label}
                                  </div>
                                  <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                                    {group.description}
                                  </div>
                                  <div className="mt-1.5 space-y-1.5">
                                    {group.entries.map((entry) => (
                                      <div
                                        key={`transcript-zoom-group-${group.kind}-${entry.id}`}
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                                      >
                                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                          <span className="font-semibold text-slate-800">
                                            {entry.title}
                                          </span>
                                          {entry.sourceType ? (
                                            <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-slate-500">
                                              {formatTranscriptEntrySourceLabel(
                                                entry.sourceType,
                                              )}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-600">
                                          {sanitizeWorkbenchEventText(
                                            entry.detail,
                                          )}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {selectedTranscriptActivityEntries.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-semibold text-slate-800">
                              {childProgressTitle}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                              {childProgressCountText}
                            </span>
                            {selectedTranscriptLiveActivityEntries.length >
                            0 ? (
                              <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-sky-700">
                                {childLiveCountText}
                              </span>
                            ) : null}
                            {selectedTranscriptHistoryEntries.length > 0 ? (
                              <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                                {childHistoryCountText}
                              </span>
                            ) : null}
                            {selectedTranscriptHistoryStatus === "loading" ? (
                              <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-amber-700">
                                {historyLoadingText}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-2">
                            {selectedTranscriptActivityEntries.map((entry) => (
                              <div
                                key={`transcript-zoom-activity-${entry.id}`}
                                className="rounded-xl border border-slate-200 bg-white px-2 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                  <span className="font-semibold text-slate-800">
                                    {entry.title}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 font-medium",
                                      entry.badgeClassName,
                                    )}
                                  >
                                    {entry.statusLabel}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-600">
                                  {sanitizeWorkbenchEventText(entry.detail)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : selectedTranscriptHistoryStatus === "loading" ? (
                        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-700">
                          {historyLoadingDescription}
                        </p>
                      ) : selectedTranscriptHistoryStatus === "error" ? (
                        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700">
                          {historyErrorText}
                        </p>
                      ) : selectedTranscriptChildSessionId ? (
                        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
                          {noTranscriptActivityText}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {agentUiSurfaceSummaries.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {surfaceSummaryTitle}
                  </div>
                  {agentUiSurfaceSummaries.map((surface, index) => (
                    <details
                      key={`team-workbench-agentui-surface-detail-${surface.surface}`}
                      className="group rounded-2xl border border-slate-200 bg-white px-3 py-2"
                      open={index === 0}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs">
                        <span>
                          <span className="font-semibold text-slate-900">
                            {surface.label}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-500">
                            {formatAgentUiSurfaceLabel(
                              surface.surface,
                              translateProjection,
                            )}
                          </span>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                          {surface.total}
                        </span>
                      </summary>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        {surface.description}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {surface.latestEvents.map((event) => {
                          const auxiliaryDetail =
                            formatWorkbenchProjectionEventAuxiliaryDetail(
                              event,
                            );
                          return (
                            <div
                              key={`team-workbench-agentui-surface-detail-event-${surface.surface}-${event.sequence ?? event.type}-${event.agentId ?? event.taskId ?? event.reviewId ?? event.handoffId ?? event.sourceType}`}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                                <span className="font-semibold text-slate-700">
                                  {formatAgentUiProjectionEventType(
                                    event.type,
                                    translateProjection,
                                  )}
                                </span>
                                <span>
                                  {formatAgentUiProjectionPhase(
                                    event.phase,
                                    translateProjection,
                                  )}
                                </span>
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                {formatWorkbenchProjectionEventDetail(event)}
                              </div>
                              {auxiliaryDetail ? (
                                <div className="mt-0.5 truncate text-[10px] text-slate-400">
                                  {auxiliaryDetail}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
              {teamWorkbenchProjectionSummary.latestEvents.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {teamWorkbenchProjectionSummary.latestEvents.map((event) => (
                    <div
                      key={`team-workbench-agentui-event-${event.sequence ?? event.type}-${event.agentId ?? event.taskId ?? event.evidenceId ?? event.reviewId ?? event.handoffId ?? event.sourceType}`}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          {formatAgentUiProjectionEventType(
                            event.type,
                            translateProjection,
                          )}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                          {formatAgentUiProjectionPhase(
                            event.phase,
                            translateProjection,
                          )}
                        </span>
                        {event.surface ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                            {formatAgentUiSurfaceLabel(
                              event.surface,
                              translateProjection,
                            )}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">
                        {formatWorkbenchProjectionEventDetail(event)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {roleCards.length > 0 ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Bot className="h-3.5 w-3.5" />
            <span>
              {dispatchPreviewState
                ? formationCopy.detailRoleSectionRuntimeLabel
                : formationCopy.detailRoleSectionPlanLabel}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {roleCards.map((role) => (
              <div
                key={`team-workbench-role-${role.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {role.label}
                  </span>
                  {role.statusMeta ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        role.statusMeta.badgeClassName,
                      )}
                    >
                      {role.statusMeta.label}
                    </span>
                  ) : null}
                  {role.roleKey ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                      {role.roleKey}
                    </span>
                  ) : null}
                  {role.profileId ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                      {role.profileId}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 text-xs leading-5 text-slate-600">
                  {role.summary}
                </div>
                {role.skillIds.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {role.skillIds.map((skillId) => (
                      <span
                        key={`${role.id}-${skillId}`}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500"
                      >
                        {skillId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {runtimeFormationDisplay.referenceLabel ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              {referenceLabelText}
            </div>
          ) : null}
        </section>
      ) : null}

      {(operationSummary || latestActivity.length > 0) && (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            <span>{recentActivityTitle}</span>
          </div>
          {operationSummary ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
              {operationSummary}
            </div>
          ) : null}
          {latestActivity.length > 0 ? (
            <div className="mt-3 space-y-2">
              {latestActivity.map((entry) => (
                <div
                  key={`team-workbench-activity-${entry.id}`}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {entry.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        entry.badgeClassName,
                      )}
                    >
                      {entry.statusLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs leading-5 text-slate-600">
                    {sanitizeWorkbenchEventText(entry.detail)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
