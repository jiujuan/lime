import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Bot, Clock3, Sparkles, Workflow } from "lucide-react";
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
        detail: "已路由到本地 Team session close / stop handler。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "continued":
      return {
        label: "已继续",
        detail: "已路由到本地 Team session resume handler。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "opened":
      return {
        label: "已打开",
        detail: "已聚焦本地 child session。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "waited":
      return {
        label: "已等待",
        detail: "已路由到本地 Team session wait handler。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "located_only":
      return {
        label: "只定位",
        detail:
          "该目标已在 Agent UI 标准工作区中定位，当前没有可执行的本地子任务处理器。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "seeded_work_item":
      return {
        label: "已回填输入",
        detail:
          "requested fix 已回填到输入框；发送后才会进入真实执行，不在工作台内伪造完成态。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "submitted_work_item":
      return {
        label: "已提交执行",
        detail:
          "requested fix 已作为主线程 runtime turn 提交；执行结果仍以 requestedFixExecutionResults metadata 回写，不伪造完成态。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "seeded_reassignment":
      return {
        label: "重指派已回填",
        detail:
          "负责人更新指令已回填；发送并执行后，以运行时返回的负责人变化为准。",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "work_item_source_located":
      return {
        label: "工作项已定位",
        detail:
          "已定位结构化任务板记录；可通过负责人选择器回填负责人更新指令，等待运行时确认负责人变化。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "remote_task_source_located":
      return {
        label: "远端任务已定位",
        detail:
          "已定位结构化远端任务记录；当前只展示来源、状态与结果引用，不伪造远端运行时控制。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "handoff_source_located":
      return {
        label: "交接已定位",
        detail:
          "已定位结构化交接记录；当前只展示交接生命周期，不从文本伪造跨 Agent 控制。",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "unsupported_remote":
      return {
        label: "远端未接入",
        detail: "远端队友需要接入真实远端入口或 A2A 任务记录后才能运行时控制。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_review":
      return {
        label: "审核未接入",
        detail: "评审记录已定位；真实审核回调与重指派写回仍需后续接入。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_handoff":
      return {
        label: "交接未接入",
        detail: "交接记录已定位；真实接收、退回、恢复记录接入前不伪造状态。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported_work_item":
      return {
        label: "工作项未接入",
        detail:
          "任务板目标已定位；真实任务板或团队 API 写回接入前不伪造工作项状态。",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "unsupported":
      return {
        label: "暂不支持",
        detail: "该 Agent UI 目标暂无可执行的本地运行时处理器。",
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
    ["会话", item.target.sessionId],
    ["线程", item.target.threadId],
    ["运行", item.target.runId],
    ["回合", item.target.turnId],
    ["Evidence", item.target.evidenceId],
    ["Artifact", item.target.artifactId],
    ["Agent", item.target.agentId],
    ["任务", item.target.taskId],
    ["工作项", item.target.workItemId],
    ["Review", item.target.reviewId],
    ["Handoff", item.target.handoffId],
    ["Worker", item.target.workerNotificationId],
    ["远端任务", item.target.remoteTaskId],
    ["Transcript", item.target.transcriptRef],
    ["结果引用", item.target.resultRef],
    ["Raw event", item.target.rawEventRef],
    ["Artifact IDs", artifactIds],
    ["Artifact paths", artifactPaths],
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
  agent_message: "Agent 回复",
  approval_request: "等待确认",
  command_execution: "命令执行",
  message_fallback: "消息",
  plan: "计划",
  reasoning: "推理",
  request_user_input: "等待补充",
  tool_call: "工具调用",
  turn_summary: "回合摘要",
  user_message: "用户消息",
  web_search: "联网搜索",
};

const AGENT_UI_SURFACE_LABELS: Record<string, string> = {
  artifact_workspace: "产物工作区",
  background_teammate: "后台队友",
  conversation: "对话",
  delegation_graph: "分派关系",
  diagnostics: "诊断",
  handoff_lane: "交接",
  hitl: "人工确认",
  inline_process: "过程",
  remote_teammate: "远程队友",
  review_lane: "评审",
  runtime_status: "运行状态",
  session_tabs: "会话",
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
      description: "用户消息、Agent 回复、推理和计划的有界预览。",
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
  const summaryCards = [
    {
      label: "活跃任务",
      value: String(executionSummary.activeSessionCount),
      hint: executionSummary.hasActiveRuntime ? "任务进行中" : "尚未运行",
    },
    {
      label: "处理中",
      value: String(executionSummary.runningSessionCount),
      hint: executionSummary.runningSessionCount > 0 ? "正在推进" : "暂无",
    },
    {
      label: "稍后开始",
      value: String(executionSummary.queuedSessionCount),
      hint: executionSummary.queuedSessionCount > 0 ? "按顺序继续" : "暂无",
    },
    {
      label: hasRuntimeSessions
        ? "总会话"
        : dispatchPreviewState
          ? "当前任务"
          : selectedRoleCount > 0
            ? "计划分工"
            : "总会话",
      value: String(
        hasRuntimeSessions
          ? executionSummary.totalSessionCount
          : displayRoleCount,
      ),
      hint: hasRuntimeSessions
        ? "已进入任务轨道"
        : dispatchPreviewState
          ? "当前分工"
          : selectedRoleCount > 0
            ? "已选方案"
            : "等待创建",
    },
  ];
  const agentUiSurfaceCards = [
    {
      label: "Roster",
      value: teamWorkbenchProjectionSummary.rosterCount,
      hint: "team_roster",
    },
    {
      label: "Delegation",
      value: teamWorkbenchProjectionSummary.delegationCount,
      hint: "delegation_graph",
    },
    {
      label: "Board",
      value: teamWorkbenchProjectionSummary.workBoardCount,
      hint: "work_board",
    },
    {
      label: "Worker",
      value: teamWorkbenchProjectionSummary.workerNotificationCount,
      hint: "worker_notifications",
    },
    {
      label: "Handoff",
      value: teamWorkbenchProjectionSummary.handoffCount,
      hint: "handoff_lane",
    },
    {
      label: "Review",
      value: teamWorkbenchProjectionSummary.reviewCount,
      hint: "review_lane",
    },
    {
      label: "Transcript",
      value: teamWorkbenchProjectionSummary.transcriptCount,
      hint: "teammate_transcript",
    },
    {
      label: "Background",
      value: teamWorkbenchProjectionSummary.backgroundCount,
      hint: "background_teammate",
    },
    {
      label: "Remote",
      value: teamWorkbenchProjectionSummary.remoteCount,
      hint: "remote_teammate",
    },
    {
      label: "Policy",
      value: teamWorkbenchProjectionSummary.policyCount,
      hint: "team_policy",
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <Workflow className="h-3.5 w-3.5" />
          <span>生成</span>
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
            "生成已就绪，等待主线程开始编排"}
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
        {!hasRuntimeSessions && !dispatchPreviewState ? (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-700">
            尚未接入任务。发送后这里会先展示分工，再过渡到当前进展。
          </div>
        ) : null}
      </section>

      {teamMemorySnapshot ? (
        <TeamMemoryShadowCard snapshot={teamMemorySnapshot} />
      ) : null}

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

      {teamWorkbenchProjectionSummary.total > 0 ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Workflow className="h-3.5 w-3.5" />
            <span>Agent UI v0.6</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium tracking-normal text-emerald-700 normal-case">
              {teamWorkbenchProjectionSummary.total} 条事件
            </span>
          </div>
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
                  {formatAgentUiSurfaceLabel(card.hint, translateProjection)}
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
                          {formatAgentUiProjectionEventDetail(event)}
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
                  已定位工作台目标
                </span>
                <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  {selectedWorkbenchItem.action?.label ?? "查看"} ·{" "}
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
                这里只定位 Agent UI
                标准工作区中的目标，不从文本推断状态，也不伪造远端、评审或交接运行时调用。
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
                      负责人重指派
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                      负责人更新
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-600">
                    选择目标负责人后只回填负责人更新指令；发送并执行后，Agent UI
                    仍以运行时返回的负责人变化作为唯一事实。
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={selectedReassignmentAssignee}
                      onChange={(event) =>
                        setSelectedReassignmentAssignee(event.target.value)
                      }
                      className="h-8 min-w-[180px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm shadow-slate-950/5 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                      data-agentui-reassignment-select
                      aria-label="选择重指派负责人"
                    >
                      {selectedWorkbenchReassignmentCandidates.map(
                        (candidate) => (
                          <option
                            key={`agentui-reassignment-candidate-${candidate.value}`}
                            value={candidate.value}
                          >
                            {candidate.label}
                            {candidate.detail ? `（${candidate.detail}）` : ""}
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
                      {reassignmentPending ? "回填中..." : "回填重指派指令"}
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
                      相关队友链路
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                      {selectedWorkbenchRelatedEvents.length} 条事件
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-600">
                    按成员、任务、工作项、队友记录与产物引用精确匹配同一目标的事件；这里只串联队友状态，不合成新运行时事实。
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {selectedWorkbenchRelatedEvents.map((event) => {
                      const auxiliaryDetail =
                        formatAgentUiProjectionEventAuxiliaryDetail(event);
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
                            {formatAgentUiProjectionEventDetail(event)}
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
                      队友记录详情
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                      队友记录
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-600">
                    正文由子会话 /
                    团队任务板选中成员活动预览读取；这里仅展示标准引用与焦点，不把队友输出混进主回复。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                      记录引用：
                      {selectedWorkbenchTranscriptZoom.transcriptRef}
                    </span>
                    {selectedWorkbenchTranscriptZoom.parentSessionId ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                        父会话：
                        {selectedWorkbenchTranscriptZoom.parentSessionId}
                      </span>
                    ) : null}
                    {selectedWorkbenchTranscriptZoom.childSessionId ? (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                        子会话：
                        {selectedWorkbenchTranscriptZoom.childSessionId}
                      </span>
                    ) : null}
                    {selectedWorkbenchTranscriptZoom.latestTurnId ? (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                        最新回合：
                        {selectedWorkbenchTranscriptZoom.latestTurnId}
                      </span>
                    ) : null}
                  </div>
                  {selectedTranscriptChildSession ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="font-semibold text-slate-800">
                          子会话概览
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                          {selectedTranscriptChildSession.name ??
                            selectedTranscriptChildSession.id}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                          状态：{selectedTranscriptRuntimeStatusLabel}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                          回合状态：{selectedTranscriptLatestTurnStatusLabel}
                        </span>
                        {selectedTranscriptChildSession.role_hint ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                            角色：{selectedTranscriptChildSession.role_hint}
                          </span>
                        ) : null}
                      </div>
                      {selectedTranscriptChildSession.task_summary ? (
                        <p className="mt-2 text-[10px] leading-4 text-slate-600">
                          任务摘要：
                          {selectedTranscriptChildSession.task_summary}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedTranscriptQueuedTurns.length > 0 ||
                  selectedTranscriptEntryGroups.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="font-semibold text-slate-800">
                          结构化 Drilldown
                        </span>
                        {selectedTranscriptQueuedTurns.length > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-amber-700">
                            输入队列 {selectedTranscriptQueuedTurns.length} 条
                          </span>
                        ) : null}
                        {selectedTranscriptEntryGroups.map((group) => (
                          <span
                            key={`transcript-zoom-group-chip-${group.kind}`}
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600"
                          >
                            {group.label} {group.entries.length} 条
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        这里只消费子会话详情里的输入队列与历史正文类型；没有结构化记录时不合成等待、工具或消息状态。
                      </p>
                      {selectedTranscriptQueuedTurns.length > 0 ? (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2">
                          <div className="text-[10px] font-semibold text-amber-800">
                            输入队列
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
                                  {turn.message_preview}
                                </span>
                                {turn.image_count > 0 ? (
                                  <span className="ml-1 text-amber-600">
                                    · 图片 {turn.image_count}
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
                                      {entry.detail}
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
                          子会话进展
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                          {selectedTranscriptActivityEntries.length} 条
                        </span>
                        {selectedTranscriptLiveActivityEntries.length > 0 ? (
                          <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-sky-700">
                            live {selectedTranscriptLiveActivityEntries.length}{" "}
                            条
                          </span>
                        ) : null}
                        {selectedTranscriptHistoryEntries.length > 0 ? (
                          <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                            历史正文 {selectedTranscriptHistoryEntries.length}{" "}
                            条
                          </span>
                        ) : null}
                        {selectedTranscriptHistoryStatus === "loading" ? (
                          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-amber-700">
                            正在读取历史正文
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
                              {entry.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selectedTranscriptHistoryStatus === "loading" ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-700">
                      正在从子会话读取历史正文；读取结果仍只作为
                      队友记录预览，不进入主回复。
                    </p>
                  ) : selectedTranscriptHistoryStatus === "error" ? (
                    <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700">
                      读取子会话历史正文失败：
                      {selectedTranscriptHistoryState?.errorMessage ??
                        "未知错误"}
                    </p>
                  ) : selectedTranscriptChildSessionId ? (
                    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
                      还没有收到这项子会话的 live
                      activity，历史正文也暂无可展示过程；
                      如需完整上下文，继续通过 Team board 聚焦对应子任务读取。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {agentUiSurfaceSummaries.length > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                工作区专门视图
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
                        formatAgentUiProjectionEventAuxiliaryDetail(event);
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
                            {formatAgentUiProjectionEventDetail(event)}
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
                    {formatAgentUiProjectionEventDetail(event)}
                  </div>
                </div>
              ))}
            </div>
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
              参考方案：{runtimeFormationDisplay.referenceLabel}
            </div>
          ) : null}
        </section>
      ) : null}

      {(operationSummary || latestActivity.length > 0) && (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            <span>最近动态</span>
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
                    {entry.detail}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.12em] text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />
          <span>交互说明</span>
        </div>
        <div className="mt-2">
          左侧主画布负责展示任务轨道、实时过程与细节；右侧用于总览、任务结构与快速理解当前进展状态。
        </div>
        <div className="mt-2 flex items-center gap-2 text-sky-700">
          <Sparkles className="h-3.5 w-3.5" />
          <span>这套布局会复用到图片、多文件和其他专用画布。</span>
        </div>
      </div>
    </div>
  );
}
