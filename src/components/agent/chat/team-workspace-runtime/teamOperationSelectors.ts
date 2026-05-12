import {
  formatDate,
  formatNumber,
  formatRelativeTime as formatLocaleRelativeTime,
} from "@/i18n/format";
import {
  normalizeTeamWorkspaceRuntimeStatus,
  type TeamWorkspaceResolvedRuntimeStatus,
  type TeamWorkspaceControlSummary,
  type TeamWorkspaceWaitSummary,
} from "../teamWorkspaceRuntime";

export interface TeamOperationDisplayEntry {
  id: string;
  title: string;
  detail: string;
  badgeClassName: string;
  updatedAt: number;
  targetSessionId?: string;
}

export interface TeamWorkspaceOperationSessionSnapshot {
  id: string;
  name: string;
}

export interface TeamWorkspaceVisibleOperationState {
  visibleTeamWaitSummary: TeamWorkspaceWaitSummary | null;
  visibleTeamControlSummary: TeamWorkspaceControlSummary | null;
  entries: TeamOperationDisplayEntry[];
}

type TeamWorkspaceOperationResourceKey =
  | "agentChat.teamWorkspace.operations.control.closeCount"
  | "agentChat.teamWorkspace.operations.control.closeCompleted"
  | "agentChat.teamWorkspace.operations.control.closeOne"
  | "agentChat.teamWorkspace.operations.control.resumeCount"
  | "agentChat.teamWorkspace.operations.control.resumeOne"
  | "agentChat.teamWorkspace.operations.taskFallback"
  | "agentChat.teamWorkspace.operations.title.close"
  | "agentChat.teamWorkspace.operations.title.closeCompleted"
  | "agentChat.teamWorkspace.operations.title.resume"
  | "agentChat.teamWorkspace.operations.title.waitResolved"
  | "agentChat.teamWorkspace.operations.title.waitTimedOut"
  | "agentChat.teamWorkspace.operations.wait.resolved"
  | "agentChat.teamWorkspace.operations.wait.timedOut"
  | "agentChat.teamWorkspace.runtimeStatus.aborted"
  | "agentChat.teamWorkspace.runtimeStatus.closed"
  | "agentChat.teamWorkspace.runtimeStatus.completed"
  | "agentChat.teamWorkspace.runtimeStatus.failed"
  | "agentChat.teamWorkspace.runtimeStatus.idle"
  | "agentChat.teamWorkspace.runtimeStatus.queued"
  | "agentChat.teamWorkspace.runtimeStatus.running";

export type TeamWorkspaceOperationTranslate = (
  key: TeamWorkspaceOperationResourceKey,
  options?: Record<string, unknown>,
) => string;

export interface TeamWorkspaceOperationCopy {
  closeTitle: string;
  closeCompletedTitle: string;
  formatCloseCount: (count: number) => string;
  formatCloseCompleted: (count: number) => string;
  formatCloseOne: (sessionName: string) => string;
  formatResumeCount: (count: number) => string;
  formatResumeOne: (sessionName: string) => string;
  formatRuntimeStatus: (status?: TeamWorkspaceResolvedRuntimeStatus) => string;
  formatWaitResolved: (sessionName: string, status: string) => string;
  formatWaitTimedOut: (count: number) => string;
  resumeTitle: string;
  taskFallback: string;
  waitResolvedTitle: string;
  waitTimedOutTitle: string;
}

const STATUS_BADGE_CLASS_NAME = {
  idle: "border border-slate-200 bg-white text-slate-600",
  queued: "border border-amber-200 bg-amber-50 text-amber-700",
  running: "border border-sky-200 bg-sky-50 text-sky-700",
  completed: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border border-rose-200 bg-rose-50 text-rose-700",
  aborted: "border border-rose-200 bg-rose-50 text-rose-700",
  closed: "border border-slate-200 bg-slate-100 text-slate-600",
} as const;

function resolveStatusBadgeClassName(
  status?: keyof typeof STATUS_BADGE_CLASS_NAME,
) {
  return STATUS_BADGE_CLASS_NAME[status ?? "idle"];
}

function resolveRuntimeStatusResourceKey(
  status?: TeamWorkspaceResolvedRuntimeStatus,
): TeamWorkspaceOperationResourceKey {
  const normalized = status
    ? normalizeTeamWorkspaceRuntimeStatus(status)
    : "idle";

  switch (normalized) {
    case "queued":
      return "agentChat.teamWorkspace.runtimeStatus.queued";
    case "running":
      return "agentChat.teamWorkspace.runtimeStatus.running";
    case "completed":
      return "agentChat.teamWorkspace.runtimeStatus.completed";
    case "failed":
      return "agentChat.teamWorkspace.runtimeStatus.failed";
    case "aborted":
      return "agentChat.teamWorkspace.runtimeStatus.aborted";
    case "closed":
      return "agentChat.teamWorkspace.runtimeStatus.closed";
    case "idle":
    default:
      return "agentChat.teamWorkspace.runtimeStatus.idle";
  }
}

export function buildTeamWorkspaceOperationCopy(params: {
  locale?: string | null;
  translate: TeamWorkspaceOperationTranslate;
}): TeamWorkspaceOperationCopy {
  const formatTaskCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    closeTitle: params.translate(
      "agentChat.teamWorkspace.operations.title.close",
    ),
    closeCompletedTitle: params.translate(
      "agentChat.teamWorkspace.operations.title.closeCompleted",
    ),
    formatCloseCount: (count) =>
      params.translate(
        "agentChat.teamWorkspace.operations.control.closeCount",
        {
          formattedCount: formatTaskCount(count),
        },
      ),
    formatCloseCompleted: (count) =>
      params.translate(
        "agentChat.teamWorkspace.operations.control.closeCompleted",
        {
          formattedCount: formatTaskCount(count),
        },
      ),
    formatCloseOne: (sessionName) =>
      params.translate("agentChat.teamWorkspace.operations.control.closeOne", {
        sessionName,
      }),
    formatResumeCount: (count) =>
      params.translate(
        "agentChat.teamWorkspace.operations.control.resumeCount",
        {
          formattedCount: formatTaskCount(count),
        },
      ),
    formatResumeOne: (sessionName) =>
      params.translate("agentChat.teamWorkspace.operations.control.resumeOne", {
        sessionName,
      }),
    formatRuntimeStatus: (status) =>
      params.translate(resolveRuntimeStatusResourceKey(status)),
    formatWaitResolved: (sessionName, status) =>
      params.translate("agentChat.teamWorkspace.operations.wait.resolved", {
        sessionName,
        status,
      }),
    formatWaitTimedOut: (count) =>
      params.translate("agentChat.teamWorkspace.operations.wait.timedOut", {
        formattedCount: formatTaskCount(count),
      }),
    resumeTitle: params.translate(
      "agentChat.teamWorkspace.operations.title.resume",
    ),
    taskFallback: params.translate(
      "agentChat.teamWorkspace.operations.taskFallback",
    ),
    waitResolvedTitle: params.translate(
      "agentChat.teamWorkspace.operations.title.waitResolved",
    ),
    waitTimedOutTitle: params.translate(
      "agentChat.teamWorkspace.operations.title.waitTimedOut",
    ),
  };
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

export function formatOperationUpdatedAt(
  updatedAt: number | undefined,
  options: {
    locale?: string | null;
    now?: number;
    nowLabel: string;
  },
) {
  if (!updatedAt) {
    return options.nowLabel;
  }

  const diffMs = updatedAt - (options.now ?? Date.now());
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs < MINUTE_MS) {
    return options.nowLabel;
  }
  if (absDiffMs < HOUR_MS) {
    return formatLocaleRelativeTime(Math.round(diffMs / MINUTE_MS), "minute", {
      locale: options.locale,
      numeric: "auto",
      style: "narrow",
    });
  }
  if (absDiffMs < DAY_MS) {
    return formatLocaleRelativeTime(Math.round(diffMs / HOUR_MS), "hour", {
      locale: options.locale,
      numeric: "auto",
      style: "narrow",
    });
  }
  if (absDiffMs < MONTH_MS) {
    return formatLocaleRelativeTime(Math.round(diffMs / DAY_MS), "day", {
      locale: options.locale,
      numeric: "auto",
      style: "narrow",
    });
  }

  return formatDate(updatedAt, {
    locale: options.locale,
    month: "numeric",
    day: "numeric",
  });
}

function buildTeamWaitSummaryDisplay(params: {
  copy: TeamWorkspaceOperationCopy;
  summary: TeamWorkspaceWaitSummary;
  sessionNameById: Map<string, string>;
}) {
  if (params.summary.timedOut) {
    return {
      text: params.copy.formatWaitTimedOut(
        params.summary.awaitedSessionIds.length,
      ),
      badgeClassName: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  const resolvedName = params.summary.resolvedSessionId
    ? (params.sessionNameById.get(params.summary.resolvedSessionId) ??
      params.summary.resolvedSessionId)
    : params.copy.taskFallback;
  const normalizedStatus = params.summary.resolvedStatus
    ? normalizeTeamWorkspaceRuntimeStatus(params.summary.resolvedStatus)
    : undefined;

  return {
    text: params.copy.formatWaitResolved(
      resolvedName,
      params.copy.formatRuntimeStatus(params.summary.resolvedStatus),
    ),
    badgeClassName: resolveStatusBadgeClassName(normalizedStatus),
  };
}

function buildTeamControlSummaryDisplay(params: {
  copy: TeamWorkspaceOperationCopy;
  summary: TeamWorkspaceControlSummary;
  sessionNameById: Map<string, string>;
}) {
  const affectedCount = params.summary.affectedSessionIds.length;
  const firstAffectedId = params.summary.affectedSessionIds[0];
  const firstAffectedName = firstAffectedId
    ? (params.sessionNameById.get(firstAffectedId) ?? firstAffectedId)
    : params.copy.taskFallback;

  switch (params.summary.action) {
    case "resume":
      return {
        text:
          affectedCount > 1
            ? params.copy.formatResumeCount(affectedCount)
            : params.copy.formatResumeOne(firstAffectedName),
        badgeClassName: "border border-sky-200 bg-sky-50 text-sky-700",
      };
    case "close_completed":
      return {
        text: params.copy.formatCloseCompleted(affectedCount),
        badgeClassName: "border border-slate-200 bg-slate-100 text-slate-700",
      };
    case "close":
    default:
      return {
        text:
          affectedCount > 1
            ? params.copy.formatCloseCount(affectedCount)
            : params.copy.formatCloseOne(firstAffectedName),
        badgeClassName: "border border-slate-200 bg-slate-100 text-slate-700",
      };
  }
}

export function buildTeamOperationDisplayEntries(params: {
  copy: TeamWorkspaceOperationCopy;
  sessionNameById: Map<string, string>;
  teamWaitSummary?: TeamWorkspaceWaitSummary | null;
  teamControlSummary?: TeamWorkspaceControlSummary | null;
}): TeamOperationDisplayEntry[] {
  const entries: TeamOperationDisplayEntry[] = [];

  if (params.teamWaitSummary) {
    const display = buildTeamWaitSummaryDisplay({
      copy: params.copy,
      summary: params.teamWaitSummary,
      sessionNameById: params.sessionNameById,
    });
    entries.push({
      id: `wait-${params.teamWaitSummary.updatedAt}`,
      title: params.teamWaitSummary.timedOut
        ? params.copy.waitTimedOutTitle
        : params.copy.waitResolvedTitle,
      detail: display.text,
      badgeClassName: display.badgeClassName,
      updatedAt: params.teamWaitSummary.updatedAt,
      targetSessionId:
        params.teamWaitSummary.resolvedSessionId ??
        params.teamWaitSummary.awaitedSessionIds[0],
    });
  }

  if (params.teamControlSummary) {
    const display = buildTeamControlSummaryDisplay({
      copy: params.copy,
      summary: params.teamControlSummary,
      sessionNameById: params.sessionNameById,
    });
    const title = (() => {
      switch (params.teamControlSummary.action) {
        case "resume":
          return params.copy.resumeTitle;
        case "close_completed":
          return params.copy.closeCompletedTitle;
        case "close":
        default:
          return params.copy.closeTitle;
      }
    })();

    entries.push({
      id: `control-${params.teamControlSummary.action}-${params.teamControlSummary.updatedAt}`,
      title,
      detail: display.text,
      badgeClassName: display.badgeClassName,
      updatedAt: params.teamControlSummary.updatedAt,
      targetSessionId:
        params.teamControlSummary.affectedSessionIds[0] ??
        params.teamControlSummary.requestedSessionIds[0],
    });
  }

  return entries.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function buildVisibleTeamOperationState(params: {
  copy: TeamWorkspaceOperationCopy;
  railSessions: TeamWorkspaceOperationSessionSnapshot[];
  teamWaitSummary?: TeamWorkspaceWaitSummary | null;
  teamControlSummary?: TeamWorkspaceControlSummary | null;
}): TeamWorkspaceVisibleOperationState {
  const sessionNameById = new Map(
    params.railSessions.map((session) => [session.id, session.name]),
  );
  const visibleSessionIds = new Set(
    params.railSessions.map((session) => session.id),
  );

  const visibleTeamWaitSummary =
    params.teamWaitSummary &&
    params.teamWaitSummary.awaitedSessionIds.some((sessionId) =>
      sessionNameById.has(sessionId),
    )
      ? params.teamWaitSummary
      : null;

  const visibleTeamControlSummary =
    params.teamControlSummary &&
    [
      ...params.teamControlSummary.requestedSessionIds,
      ...params.teamControlSummary.affectedSessionIds,
    ].some((sessionId) => sessionNameById.has(sessionId))
      ? params.teamControlSummary
      : null;

  return {
    visibleTeamWaitSummary,
    visibleTeamControlSummary,
    entries: buildTeamOperationDisplayEntries({
      copy: params.copy,
      sessionNameById,
      teamWaitSummary: visibleTeamWaitSummary,
      teamControlSummary: visibleTeamControlSummary,
    }).filter(
      (entry) =>
        !entry.targetSessionId || visibleSessionIds.has(entry.targetSessionId),
    ),
  };
}
