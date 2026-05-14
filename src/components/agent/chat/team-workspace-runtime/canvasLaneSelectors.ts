import type { AsterSubagentSkillInfo } from "@/lib/api/agentRuntime";
import {
  formatDate,
  formatNumber,
  formatRelativeTime as formatRelativeTimeUnit,
} from "@/i18n/format";
import { agentZhCNResource as agentSourceResource } from "@/i18n/agentResources";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import { normalizeTeamWorkspaceDisplayValue } from "../utils/teamWorkspaceDisplay";
import { getTeamPresetOption } from "../utils/teamPresets";
import {
  buildTeamWorkspaceSkillDisplayName,
  resolveTeamWorkspaceRoleHintLabel,
} from "../utils/teamWorkspaceCopy";
import {
  mergeSessionActivityEntries,
  resolveRuntimeMemberStatusMeta,
  type TeamWorkspaceActivityEntry,
  type TeamWorkspaceRuntimeMember,
  type TeamWorkspaceRuntimeMemberStatus,
  type TeamWorkspaceRuntimeStatus,
} from "../teamWorkspaceRuntime";
import {
  buildActivityPreviewFromEntry,
  type SessionActivityPreviewState,
} from "./activityPreviewSelectors";

const SESSION_LANE_PREVIEW_ENTRY_LIMIT = 3;

type TeamWorkspaceCanvasLaneRuntimeStatus =
  | NonNullable<TeamWorkspaceRuntimeStatus>
  | "idle";

type TeamWorkspaceCanvasLaneResourceKey =
  | "agentChat.teamWorkspace.canvasLane.empty.completed"
  | "agentChat.teamWorkspace.canvasLane.empty.default"
  | "agentChat.teamWorkspace.canvasLane.empty.failed"
  | "agentChat.teamWorkspace.canvasLane.empty.queued"
  | "agentChat.teamWorkspace.canvasLane.empty.running"
  | "agentChat.teamWorkspace.canvasLane.empty.syncFailed"
  | "agentChat.teamWorkspace.canvasLane.empty.syncLoading"
  | "agentChat.teamWorkspace.canvasLane.memberHint.completed"
  | "agentChat.teamWorkspace.canvasLane.memberHint.connected"
  | "agentChat.teamWorkspace.canvasLane.memberHint.failed"
  | "agentChat.teamWorkspace.canvasLane.memberHint.running"
  | "agentChat.teamWorkspace.canvasLane.memberHint.spawning"
  | "agentChat.teamWorkspace.canvasLane.memberHint.waiting"
  | "agentChat.teamWorkspace.canvasLane.memberHint.waitingAssignment"
  | "agentChat.teamWorkspace.canvasLane.planned.badge"
  | "agentChat.teamWorkspace.canvasLane.planned.statusHint"
  | "agentChat.teamWorkspace.canvasLane.planned.updatedAt"
  | "agentChat.teamWorkspace.canvasLane.runtime.updatedAtWaiting"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.processingCount"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.recentProgress"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.stableProcessing"
  | "agentChat.teamWorkspace.canvasLane.runtimeDetail.waitingCount"
  | "agentChat.teamWorkspace.canvasLane.session.summaryEmpty"
  | "agentChat.teamWorkspace.canvasLane.updatedNow"
  | "agentChat.teamWorkspace.formation.memberStatus.completed"
  | "agentChat.teamWorkspace.formation.memberStatus.failed"
  | "agentChat.teamWorkspace.formation.memberStatus.planned"
  | "agentChat.teamWorkspace.formation.memberStatus.running"
  | "agentChat.teamWorkspace.formation.memberStatus.spawning"
  | "agentChat.teamWorkspace.formation.memberStatus.waiting"
  | "agentChat.teamWorkspace.runtimeStatus.aborted"
  | "agentChat.teamWorkspace.runtimeStatus.closed"
  | "agentChat.teamWorkspace.runtimeStatus.completed"
  | "agentChat.teamWorkspace.runtimeStatus.failed"
  | "agentChat.teamWorkspace.runtimeStatus.idle"
  | "agentChat.teamWorkspace.runtimeStatus.queued"
  | "agentChat.teamWorkspace.runtimeStatus.running";

export type TeamWorkspaceCanvasLaneTranslate = (
  key: TeamWorkspaceCanvasLaneResourceKey,
  options?: Record<string, unknown>,
) => string;

export interface TeamWorkspaceRuntimeDetailCopy {
  formatProcessingCount: (activeCount: number, totalCount: number) => string;
  formatRecentProgress: (status: string) => string;
  formatWaitingCount: (count: number) => string;
  getRuntimeStatusLabel: (
    status?: TeamWorkspaceRuntimeStatus | "idle",
  ) => string;
  stableProcessingLabel: string;
}

export interface TeamWorkspaceCanvasLaneCopy extends TeamWorkspaceRuntimeDetailCopy {
  emptyCompleted: string;
  emptyDefault: string;
  emptyFailed: string;
  emptyQueued: string;
  emptyRunning: string;
  emptySyncFailed: string;
  emptySyncLoading: string;
  formatUpdatedAt: (updatedAt?: number) => string;
  getMemberStatusHint: (
    status: TeamWorkspaceRuntimeMemberStatus,
    hasSession: boolean,
  ) => string;
  getMemberStatusLabel: (status: TeamWorkspaceRuntimeMemberStatus) => string;
  plannedBadge: string;
  plannedStatusHint: string;
  plannedUpdatedAt: string;
  runtimeUpdatedAtWaiting: string;
  sessionSummaryEmpty: string;
}

type AgentSourceResourceKey = keyof typeof agentSourceResource;

function interpolateCanvasLaneSourceTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateCanvasLaneSourceKey(
  key: TeamWorkspaceCanvasLaneResourceKey,
  values?: Record<string, unknown>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateCanvasLaneSourceTemplate(template, values);
}

function formatRelativeUpdatedAt(params: {
  locale?: string | null;
  updatedAt?: number;
  updatedNow: string;
}): string {
  if (!params.updatedAt) {
    return params.updatedNow;
  }

  const timestamp = params.updatedAt * 1000;
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) {
    return params.updatedNow;
  }
  if (diff < hour) {
    return formatRelativeTimeUnit(-Math.floor(diff / minute), "minute", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < day) {
    return formatRelativeTimeUnit(-Math.floor(diff / hour), "hour", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < week) {
    return formatRelativeTimeUnit(-Math.floor(diff / day), "day", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < month) {
    return formatRelativeTimeUnit(-Math.floor(diff / week), "week", {
      locale: params.locale,
      numeric: "auto",
    });
  }

  return formatDate(timestamp, { locale: params.locale });
}

function resolveRuntimeStatusKey(
  status?: TeamWorkspaceRuntimeStatus | "idle",
): TeamWorkspaceCanvasLaneResourceKey {
  return `agentChat.teamWorkspace.runtimeStatus.${status ?? "idle"}` as TeamWorkspaceCanvasLaneResourceKey;
}

function resolveMemberStatusKey(
  status: TeamWorkspaceRuntimeMemberStatus,
): TeamWorkspaceCanvasLaneResourceKey {
  return `agentChat.teamWorkspace.formation.memberStatus.${status}` as TeamWorkspaceCanvasLaneResourceKey;
}

export function buildTeamWorkspaceCanvasLaneCopy(params: {
  locale?: string | null;
  translate: TeamWorkspaceCanvasLaneTranslate;
}): TeamWorkspaceCanvasLaneCopy {
  const formatCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    emptyCompleted: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.completed",
    ),
    emptyDefault: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.default",
    ),
    emptyFailed: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.failed",
    ),
    emptyQueued: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.queued",
    ),
    emptyRunning: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.running",
    ),
    emptySyncFailed: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.syncFailed",
    ),
    emptySyncLoading: params.translate(
      "agentChat.teamWorkspace.canvasLane.empty.syncLoading",
    ),
    formatProcessingCount: (activeCount, totalCount) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.processingCount",
        {
          activeCount: formatCount(activeCount),
          totalCount: formatCount(totalCount),
        },
      ),
    formatRecentProgress: (status) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.recentProgress",
        { status },
      ),
    formatUpdatedAt: (updatedAt) =>
      formatRelativeUpdatedAt({
        locale: params.locale,
        updatedAt,
        updatedNow: params.translate(
          "agentChat.teamWorkspace.canvasLane.updatedNow",
        ),
      }),
    formatWaitingCount: (count) =>
      params.translate(
        "agentChat.teamWorkspace.canvasLane.runtimeDetail.waitingCount",
        { formattedCount: formatCount(count) },
      ),
    getMemberStatusHint: (status, hasSession) => {
      if (status === "spawning") {
        return params.translate(
          "agentChat.teamWorkspace.canvasLane.memberHint.spawning",
        );
      }
      if (status === "running") {
        return params.translate(
          "agentChat.teamWorkspace.canvasLane.memberHint.running",
        );
      }
      if (status === "waiting") {
        return params.translate(
          "agentChat.teamWorkspace.canvasLane.memberHint.waiting",
        );
      }
      if (status === "completed") {
        return params.translate(
          "agentChat.teamWorkspace.canvasLane.memberHint.completed",
        );
      }
      if (status === "failed") {
        return params.translate(
          "agentChat.teamWorkspace.canvasLane.memberHint.failed",
        );
      }
      return params.translate(
        hasSession
          ? "agentChat.teamWorkspace.canvasLane.memberHint.connected"
          : "agentChat.teamWorkspace.canvasLane.memberHint.waitingAssignment",
      );
    },
    getMemberStatusLabel: (status) =>
      params.translate(resolveMemberStatusKey(status)),
    getRuntimeStatusLabel: (status) =>
      params.translate(resolveRuntimeStatusKey(status)),
    plannedBadge: params.translate(
      "agentChat.teamWorkspace.canvasLane.planned.badge",
    ),
    plannedStatusHint: params.translate(
      "agentChat.teamWorkspace.canvasLane.planned.statusHint",
    ),
    plannedUpdatedAt: params.translate(
      "agentChat.teamWorkspace.canvasLane.planned.updatedAt",
    ),
    runtimeUpdatedAtWaiting: params.translate(
      "agentChat.teamWorkspace.canvasLane.runtime.updatedAtWaiting",
    ),
    sessionSummaryEmpty: params.translate(
      "agentChat.teamWorkspace.canvasLane.session.summaryEmpty",
    ),
    stableProcessingLabel: params.translate(
      "agentChat.teamWorkspace.canvasLane.runtimeDetail.stableProcessing",
    ),
  };
}

const SOURCE_TEAM_WORKSPACE_CANVAS_LANE_COPY = buildTeamWorkspaceCanvasLaneCopy(
  {
    locale: "zh-CN",
    translate: translateCanvasLaneSourceKey,
  },
);

const STATUS_STYLE_META: Record<
  TeamWorkspaceCanvasLaneRuntimeStatus,
  {
    badgeClassName: string;
    dotClassName: string;
  }
> = {
  idle: {
    badgeClassName: "border border-slate-200 bg-white text-slate-600",
    dotClassName: "bg-slate-300",
  },
  queued: {
    badgeClassName: "border border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-400",
  },
  running: {
    badgeClassName: "border border-sky-200 bg-sky-50 text-sky-700",
    dotClassName: "bg-sky-500",
  },
  completed: {
    badgeClassName: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  failed: {
    badgeClassName: "border border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
  },
  aborted: {
    badgeClassName: "border border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
  },
  closed: {
    badgeClassName: "border border-slate-200 bg-slate-100 text-slate-600",
    dotClassName: "bg-slate-400",
  },
};

export interface TeamWorkspaceCanvasLaneSession {
  id: string;
  name: string;
  isCurrent?: boolean;
  runtimeStatus?: TeamWorkspaceRuntimeStatus;
  taskSummary?: string;
  roleHint?: string;
  sessionType?: string;
  updatedAt?: number;
  model?: string;
  blueprintRoleId?: string;
  blueprintRoleLabel?: string;
  profileId?: string;
  profileName?: string;
  roleKey?: string;
  teamPresetId?: string;
  skills?: AsterSubagentSkillInfo[];
  latestTurnStatus?: TeamWorkspaceRuntimeStatus;
  queuedTurnCount?: number;
  teamParallelBudget?: number;
  teamActiveCount?: number;
  teamQueuedCount?: number;
  providerConcurrencyGroup?: string;
  providerParallelBudget?: number;
}

export interface TeamWorkspaceRuntimeDetailSession {
  latestTurnStatus?: TeamWorkspaceRuntimeStatus;
  queuedTurnCount?: number;
  teamQueuedCount?: number;
  teamActiveCount?: number;
  teamParallelBudget?: number;
  providerConcurrencyGroup?: string;
  providerParallelBudget?: number;
}

export type TeamWorkspaceCanvasLaneKind = "session" | "runtime" | "planned";

export interface TeamWorkspaceCanvasLane {
  id: string;
  persistKey: string;
  fallbackPersistKeys: string[];
  kind: TeamWorkspaceCanvasLaneKind;
  title: string;
  summary: string;
  badgeLabel: string;
  badgeClassName: string;
  dotClassName: string;
  roleLabel?: string;
  profileLabel?: string;
  presetLabel?: string;
  modelLabel?: string;
  statusHint?: string | null;
  updatedAtLabel?: string | null;
  skillLabels: string[];
  session?: TeamWorkspaceCanvasLaneSession;
  previewText?: string | null;
  previewEntries?: TeamWorkspaceActivityEntry[];
}

function resolveStatusMeta(
  status?: TeamWorkspaceRuntimeStatus,
  copy: Pick<
    TeamWorkspaceRuntimeDetailCopy,
    "getRuntimeStatusLabel"
  > = SOURCE_TEAM_WORKSPACE_CANVAS_LANE_COPY,
) {
  const normalizedStatus = status ?? "idle";
  return {
    ...STATUS_STYLE_META[normalizedStatus],
    label: copy.getRuntimeStatusLabel(normalizedStatus),
  };
}

function normalizeComparableText(value?: string | null): string {
  return value?.trim().toLocaleLowerCase() || "";
}

function buildSkillDisplayName(skill: AsterSubagentSkillInfo): string {
  return buildTeamWorkspaceSkillDisplayName(skill);
}

export function buildRuntimeDetailSummary(
  session?: TeamWorkspaceRuntimeDetailSession | null,
  copy: TeamWorkspaceRuntimeDetailCopy = SOURCE_TEAM_WORKSPACE_CANVAS_LANE_COPY,
): string | null {
  if (!session) {
    return null;
  }

  const parts: string[] = [];
  const waitingCount = session.teamQueuedCount ?? session.queuedTurnCount ?? 0;
  if (waitingCount > 0) {
    parts.push(copy.formatWaitingCount(waitingCount));
  }
  if (session.latestTurnStatus) {
    parts.push(
      copy.formatRecentProgress(
        resolveStatusMeta(session.latestTurnStatus, copy).label,
      ),
    );
  }
  if (
    session.teamActiveCount !== undefined &&
    session.teamParallelBudget !== undefined
  ) {
    parts.push(
      copy.formatProcessingCount(
        session.teamActiveCount,
        session.teamParallelBudget,
      ),
    );
  }
  if (
    session.providerParallelBudget === 1 &&
    session.providerConcurrencyGroup
  ) {
    parts.push(copy.stableProcessingLabel);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildSessionLaneEmptyState(params: {
  copy: TeamWorkspaceCanvasLaneCopy;
  session?: TeamWorkspaceCanvasLaneSession | null;
  previewState?: SessionActivityPreviewState | null;
}) {
  const { copy, session, previewState } = params;

  if (previewState?.status === "error") {
    return (
      normalizeTeamWorkspaceDisplayValue(previewState.errorMessage) ||
      copy.emptySyncFailed
    );
  }

  if (previewState?.status === "loading") {
    return copy.emptySyncLoading;
  }

  if (session?.runtimeStatus === "queued") {
    return copy.emptyQueued;
  }

  if (session?.runtimeStatus === "running") {
    return copy.emptyRunning;
  }

  if (session?.runtimeStatus === "completed") {
    return copy.emptyCompleted;
  }

  if (
    session?.runtimeStatus === "failed" ||
    session?.runtimeStatus === "aborted"
  ) {
    return copy.emptyFailed;
  }

  return copy.emptyDefault;
}

function buildCanvasLaneTitleSummary(
  member: Pick<TeamWorkspaceRuntimeMember, "status" | "summary" | "sessionId">,
  copy: TeamWorkspaceCanvasLaneCopy,
) {
  const memberMeta = resolveRuntimeMemberStatusMeta(member.status);

  return {
    badgeLabel: copy.getMemberStatusLabel(member.status),
    badgeClassName: memberMeta.badgeClassName,
    dotClassName:
      member.status === "failed"
        ? "bg-rose-500"
        : member.status === "completed"
          ? "bg-emerald-500"
          : member.status === "waiting"
            ? "bg-amber-400"
            : "bg-sky-500",
    summary:
      normalizeTeamWorkspaceDisplayValue(member.summary) || member.summary,
    statusHint: copy.getMemberStatusHint(
      member.status,
      Boolean(member.sessionId),
    ),
  };
}

function buildPlannedRoleLaneSummary(
  role: TeamRoleDefinition,
  copy: TeamWorkspaceCanvasLaneCopy,
) {
  return {
    badgeLabel: copy.plannedBadge,
    badgeClassName: "border border-slate-200 bg-slate-50 text-slate-600",
    dotClassName: "bg-slate-300",
    summary: normalizeTeamWorkspaceDisplayValue(role.summary) || role.summary,
    statusHint: copy.plannedStatusHint,
  };
}

function resolveLaneMatchingRuntimeMemberId(
  session: TeamWorkspaceCanvasLaneSession,
  runtimeMembers: TeamWorkspaceRuntimeMember[],
): string | null {
  if (runtimeMembers.length === 0) {
    return null;
  }

  const explicitRoleId = session.blueprintRoleId?.trim();
  if (
    explicitRoleId &&
    runtimeMembers.some((member) => member.id === explicitRoleId)
  ) {
    return explicitRoleId;
  }

  const normalizedRoleLabel = normalizeComparableText(
    session.blueprintRoleLabel || session.name,
  );
  const normalizedRoleKey = normalizeComparableText(
    session.roleKey || session.roleHint,
  );
  const normalizedProfileId = normalizeComparableText(session.profileId);

  const candidates = runtimeMembers
    .map((member) => {
      let score = 0;
      if (
        normalizedRoleLabel &&
        normalizeComparableText(member.label) === normalizedRoleLabel
      ) {
        score += 8;
      }
      if (
        normalizedRoleKey &&
        normalizeComparableText(member.roleKey) === normalizedRoleKey
      ) {
        score += 5;
      }
      if (
        normalizedProfileId &&
        normalizeComparableText(member.profileId) === normalizedProfileId
      ) {
        score += 4;
      }
      return {
        memberId: member.id,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1 && candidates[0]?.score === candidates[1]?.score) {
    return null;
  }
  return candidates[0]?.memberId ?? null;
}

function resolveLaneMatchingPlannedRoleId(
  session: TeamWorkspaceCanvasLaneSession,
  plannedRoles: TeamRoleDefinition[],
): string | null {
  if (plannedRoles.length === 0) {
    return null;
  }

  const normalizedRoleLabel = normalizeComparableText(
    session.blueprintRoleLabel || session.name,
  );
  const normalizedRoleKey = normalizeComparableText(
    session.roleKey || session.roleHint,
  );
  const normalizedProfileId = normalizeComparableText(session.profileId);

  const candidates = plannedRoles
    .map((role) => {
      let score = 0;
      if (
        normalizedRoleLabel &&
        normalizeComparableText(role.label) === normalizedRoleLabel
      ) {
        score += 8;
      }
      if (
        normalizedRoleKey &&
        normalizeComparableText(role.roleKey) === normalizedRoleKey
      ) {
        score += 5;
      }
      if (
        normalizedProfileId &&
        normalizeComparableText(role.profileId) === normalizedProfileId
      ) {
        score += 4;
      }
      return {
        roleId: role.id,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1 && candidates[0]?.score === candidates[1]?.score) {
    return null;
  }
  return candidates[0]?.roleId ?? null;
}

function resolveRuntimeMemberMatchingPlannedRoleId(
  member: TeamWorkspaceRuntimeMember,
  plannedRoles: TeamRoleDefinition[],
): string | null {
  if (plannedRoles.length === 0) {
    return null;
  }

  const normalizedRoleLabel = normalizeComparableText(member.label);
  const normalizedRoleKey = normalizeComparableText(member.roleKey);
  const normalizedProfileId = normalizeComparableText(member.profileId);

  const candidates = plannedRoles
    .map((role) => {
      let score = 0;
      if (
        normalizedRoleLabel &&
        normalizeComparableText(role.label) === normalizedRoleLabel
      ) {
        score += 8;
      }
      if (
        normalizedRoleKey &&
        normalizeComparableText(role.roleKey) === normalizedRoleKey
      ) {
        score += 5;
      }
      if (
        normalizedProfileId &&
        normalizeComparableText(role.profileId) === normalizedProfileId
      ) {
        score += 4;
      }
      return {
        roleId: role.id,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1 && candidates[0]?.score === candidates[1]?.score) {
    return null;
  }
  return candidates[0]?.roleId ?? null;
}

function buildSessionCanvasLane(params: {
  copy: TeamWorkspaceCanvasLaneCopy;
  session: TeamWorkspaceCanvasLaneSession;
  runtimeMembers: TeamWorkspaceRuntimeMember[];
  plannedRoles: TeamRoleDefinition[];
  liveActivityBySessionId?: Record<string, TeamWorkspaceActivityEntry[]>;
  previewBySessionId?: Record<string, SessionActivityPreviewState>;
  activityTimelineEntryLimit: number;
}): TeamWorkspaceCanvasLane {
  const { copy, session, runtimeMembers, plannedRoles } = params;
  const previewState = params.previewBySessionId?.[session.id] ?? null;
  const mergedEntries = mergeSessionActivityEntries(
    params.liveActivityBySessionId?.[session.id],
    previewState?.entries,
    params.activityTimelineEntryLimit,
  );
  const cardActivityPreview =
    buildActivityPreviewFromEntry(mergedEntries[0]) ?? previewState?.preview;
  const meta = resolveStatusMeta(session.runtimeStatus, copy);
  const matchedRuntimeMemberId = resolveLaneMatchingRuntimeMemberId(
    session,
    runtimeMembers,
  );
  const matchedPlannedRoleId = resolveLaneMatchingPlannedRoleId(
    session,
    plannedRoles,
  );
  const presetLabel = session.teamPresetId
    ? (getTeamPresetOption(session.teamPresetId)?.label ?? session.teamPresetId)
    : undefined;

  return {
    id: session.id,
    persistKey: `session:${session.id}`,
    fallbackPersistKeys: [
      matchedRuntimeMemberId ? `runtime:${matchedRuntimeMemberId}` : null,
      matchedPlannedRoleId ? `planned:${matchedPlannedRoleId}` : null,
    ].filter(Boolean) as string[],
    kind: "session",
    title: session.name,
    summary:
      normalizeTeamWorkspaceDisplayValue(session.taskSummary) ||
      copy.sessionSummaryEmpty,
    badgeLabel: meta.label,
    badgeClassName: meta.badgeClassName,
    dotClassName: meta.dotClassName,
    roleLabel:
      session.blueprintRoleLabel ||
      resolveTeamWorkspaceRoleHintLabel(session.roleHint) ||
      undefined,
    profileLabel: session.profileName || undefined,
    presetLabel,
    modelLabel: session.model || undefined,
    statusHint: buildRuntimeDetailSummary(session, copy),
    updatedAtLabel: copy.formatUpdatedAt(session.updatedAt),
    skillLabels: (session.skills ?? [])
      .slice(0, 4)
      .map((skill) => buildSkillDisplayName(skill)),
    session,
    previewText:
      cardActivityPreview ??
      buildSessionLaneEmptyState({ copy, session, previewState }),
    previewEntries: mergedEntries.slice(0, SESSION_LANE_PREVIEW_ENTRY_LIMIT),
  };
}

export function buildTeamWorkspaceCanvasLanes(params: {
  copy?: TeamWorkspaceCanvasLaneCopy;
  hasRealTeamGraph: boolean;
  sessions: TeamWorkspaceCanvasLaneSession[];
  runtimeMembers: TeamWorkspaceRuntimeMember[];
  plannedRoles: TeamRoleDefinition[];
  liveActivityBySessionId?: Record<string, TeamWorkspaceActivityEntry[]>;
  previewBySessionId?: Record<string, SessionActivityPreviewState>;
  activityTimelineEntryLimit: number;
}): TeamWorkspaceCanvasLane[] {
  const copy = params.copy ?? SOURCE_TEAM_WORKSPACE_CANVAS_LANE_COPY;

  if (params.hasRealTeamGraph) {
    return params.sessions.map((session) =>
      buildSessionCanvasLane({
        copy,
        session,
        runtimeMembers: params.runtimeMembers,
        plannedRoles: params.plannedRoles,
        liveActivityBySessionId: params.liveActivityBySessionId,
        previewBySessionId: params.previewBySessionId,
        activityTimelineEntryLimit: params.activityTimelineEntryLimit,
      }),
    );
  }

  if (params.runtimeMembers.length > 0) {
    return params.runtimeMembers.map((member) => {
      const laneSummary = buildCanvasLaneTitleSummary(member, copy);
      const matchedPlannedRoleId = resolveRuntimeMemberMatchingPlannedRoleId(
        member,
        params.plannedRoles,
      );

      return {
        id: member.id,
        persistKey: `runtime:${member.id}`,
        fallbackPersistKeys: matchedPlannedRoleId
          ? [`planned:${matchedPlannedRoleId}`]
          : [],
        kind: "runtime",
        title: member.label,
        summary: laneSummary.summary,
        badgeLabel: laneSummary.badgeLabel,
        badgeClassName: laneSummary.badgeClassName,
        dotClassName: laneSummary.dotClassName,
        roleLabel:
          resolveTeamWorkspaceRoleHintLabel(member.roleKey) || undefined,
        profileLabel: undefined,
        statusHint: laneSummary.statusHint,
        updatedAtLabel: copy.runtimeUpdatedAtWaiting,
        skillLabels: [],
        previewText:
          normalizeTeamWorkspaceDisplayValue(member.summary) || member.summary,
        previewEntries: [],
      };
    });
  }

  return params.plannedRoles.map((role) => {
    const laneSummary = buildPlannedRoleLaneSummary(role, copy);

    return {
      id: role.id,
      persistKey: `planned:${role.id}`,
      fallbackPersistKeys: [],
      kind: "planned",
      title: role.label,
      summary: laneSummary.summary,
      badgeLabel: laneSummary.badgeLabel,
      badgeClassName: laneSummary.badgeClassName,
      dotClassName: laneSummary.dotClassName,
      roleLabel: resolveTeamWorkspaceRoleHintLabel(role.roleKey) || undefined,
      profileLabel: undefined,
      statusHint: laneSummary.statusHint,
      updatedAtLabel: copy.plannedUpdatedAt,
      skillLabels: [],
      previewText:
        normalizeTeamWorkspaceDisplayValue(role.summary) || role.summary,
      previewEntries: [],
    };
  });
}
