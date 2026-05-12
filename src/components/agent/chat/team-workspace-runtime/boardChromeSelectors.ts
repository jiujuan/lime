import {
  formatDate,
  formatNumber,
  formatRelativeTime as formatLocaleRelativeTime,
} from "@/i18n/format";
import agentSourceResource from "@/i18n/resources/zh-CN/agent.json";
import type { TeamWorkspaceRuntimeStatus } from "../teamWorkspaceRuntime";

type TeamWorkspaceBoardChromeResourceKey =
  | "agentChat.teamWorkspace.boardChrome.chip.completed"
  | "agentChat.teamWorkspace.boardChrome.chip.focus"
  | "agentChat.teamWorkspace.boardChrome.chip.updatedAt"
  | "agentChat.teamWorkspace.boardChrome.chip.waitable"
  | "agentChat.teamWorkspace.boardChrome.headline.completed"
  | "agentChat.teamWorkspace.boardChrome.headline.completedCount"
  | "agentChat.teamWorkspace.boardChrome.headline.connectedCount"
  | "agentChat.teamWorkspace.boardChrome.headline.empty"
  | "agentChat.teamWorkspace.boardChrome.headline.parentOverviewFallback"
  | "agentChat.teamWorkspace.boardChrome.headline.queued"
  | "agentChat.teamWorkspace.boardChrome.headline.queuedCount"
  | "agentChat.teamWorkspace.boardChrome.headline.retry"
  | "agentChat.teamWorkspace.boardChrome.headline.retryCount"
  | "agentChat.teamWorkspace.boardChrome.headline.running"
  | "agentChat.teamWorkspace.boardChrome.headline.runningCount"
  | "agentChat.teamWorkspace.boardChrome.headline.runningWithQueued"
  | "agentChat.teamWorkspace.boardChrome.headline.surfaceTitle"
  | "agentChat.teamWorkspace.boardChrome.hint.childSingle"
  | "agentChat.teamWorkspace.boardChrome.hint.childWithSiblings"
  | "agentChat.teamWorkspace.boardChrome.hint.empty"
  | "agentChat.teamWorkspace.boardChrome.hint.runtime"
  | "agentChat.teamWorkspace.boardChrome.statusSummary"
  | "agentChat.teamWorkspace.canvasLane.updatedNow"
  | "agentChat.teamWorkspace.overview.selectedSession.waitingTitle"
  | "agentChat.teamWorkspace.runtimeStatus.aborted"
  | "agentChat.teamWorkspace.runtimeStatus.closed"
  | "agentChat.teamWorkspace.runtimeStatus.completed"
  | "agentChat.teamWorkspace.runtimeStatus.failed"
  | "agentChat.teamWorkspace.runtimeStatus.idle"
  | "agentChat.teamWorkspace.runtimeStatus.queued"
  | "agentChat.teamWorkspace.runtimeStatus.running"
  | "agentChat.teamWorkspace.selectedSession.header.currentTaskBadge";

export type TeamWorkspaceBoardChromeTranslate = (
  key: TeamWorkspaceBoardChromeResourceKey,
  options?: Record<string, unknown>,
) => string;

type AgentSourceResourceKey = keyof typeof agentSourceResource;

function interpolateBoardChromeSourceTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateBoardChromeSourceKey(
  key: TeamWorkspaceBoardChromeResourceKey,
  values?: Record<string, unknown>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateBoardChromeSourceTemplate(template, values);
}

function resolveRuntimeStatusResourceKey(
  status?: TeamWorkspaceRuntimeStatus,
): TeamWorkspaceBoardChromeResourceKey {
  return `agentChat.teamWorkspace.runtimeStatus.${status ?? "idle"}` as TeamWorkspaceBoardChromeResourceKey;
}

function formatBoardChromeUpdatedAt(params: {
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
    return formatLocaleRelativeTime(-Math.floor(diff / minute), "minute", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < day) {
    return formatLocaleRelativeTime(-Math.floor(diff / hour), "hour", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < week) {
    return formatLocaleRelativeTime(-Math.floor(diff / day), "day", {
      locale: params.locale,
      numeric: "auto",
    });
  }
  if (diff < month) {
    return formatLocaleRelativeTime(-Math.floor(diff / week), "week", {
      locale: params.locale,
      numeric: "auto",
    });
  }

  return formatDate(timestamp, { locale: params.locale });
}

export interface TeamWorkspaceBoardChromeCopy {
  completedHeadline: string;
  currentTask: string;
  emptyHeadline: string;
  formatCompletedChipCount: (count: number) => string;
  formatCompletedHeadline: (count: number) => string;
  formatConnectedHeadline: (count: number) => string;
  formatFocusChip: (name: string) => string;
  formatQueuedHeadline: (count: number) => string;
  formatRetryHeadline: (count: number) => string;
  formatRunningHeadline: (count: number) => string;
  formatRunningWithQueuedHeadline: (
    runningCount: number,
    queuedCount: number,
  ) => string;
  formatSiblingHint: (count: number) => string;
  formatStatusSummary: (statusLabel: string, count: number) => string;
  formatUpdatedAtChip: (updatedAt?: number) => string;
  formatWaitableChipCount: (count: number) => string;
  getRuntimeStatusLabel: (status?: TeamWorkspaceRuntimeStatus) => string;
  parentOverviewFallback: string;
  queuedHeadline: string;
  retryHeadline: string;
  runningHeadline: string;
  surfaceTitle: string;
  childSingleHint: string;
  emptyHint: string;
  runtimeHint: string;
  waitingFocus: string;
}

export function buildTeamWorkspaceBoardChromeCopy(params: {
  locale?: string | null;
  translate: TeamWorkspaceBoardChromeTranslate;
}): TeamWorkspaceBoardChromeCopy {
  const formatCount = (count: number) =>
    formatNumber(count, { locale: params.locale });

  return {
    completedHeadline: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.completed",
    ),
    currentTask: params.translate(
      "agentChat.teamWorkspace.selectedSession.header.currentTaskBadge",
    ),
    emptyHeadline: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.empty",
    ),
    formatCompletedChipCount: (count) =>
      params.translate("agentChat.teamWorkspace.boardChrome.chip.completed", {
        formattedCount: formatCount(count),
      }),
    formatCompletedHeadline: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.completedCount",
        { formattedCount: formatCount(count) },
      ),
    formatConnectedHeadline: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.connectedCount",
        { formattedCount: formatCount(count) },
      ),
    formatFocusChip: (name) =>
      params.translate("agentChat.teamWorkspace.boardChrome.chip.focus", {
        name,
      }),
    formatQueuedHeadline: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.queuedCount",
        { formattedCount: formatCount(count) },
      ),
    formatRetryHeadline: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.retryCount",
        { formattedCount: formatCount(count) },
      ),
    formatRunningHeadline: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.runningCount",
        { formattedCount: formatCount(count) },
      ),
    formatRunningWithQueuedHeadline: (runningCount, queuedCount) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.headline.runningWithQueued",
        {
          queuedCount: formatCount(queuedCount),
          runningCount: formatCount(runningCount),
        },
      ),
    formatSiblingHint: (count) =>
      params.translate(
        "agentChat.teamWorkspace.boardChrome.hint.childWithSiblings",
        {
          formattedCount: formatCount(count),
        },
      ),
    formatStatusSummary: (statusLabel, count) =>
      params.translate("agentChat.teamWorkspace.boardChrome.statusSummary", {
        formattedCount: formatCount(count),
        status: statusLabel,
      }),
    formatUpdatedAtChip: (updatedAt) =>
      params.translate("agentChat.teamWorkspace.boardChrome.chip.updatedAt", {
        updatedAt: formatBoardChromeUpdatedAt({
          locale: params.locale,
          updatedAt,
          updatedNow: params.translate(
            "agentChat.teamWorkspace.canvasLane.updatedNow",
          ),
        }),
      }),
    formatWaitableChipCount: (count) =>
      params.translate("agentChat.teamWorkspace.boardChrome.chip.waitable", {
        formattedCount: formatCount(count),
      }),
    getRuntimeStatusLabel: (status) =>
      params.translate(resolveRuntimeStatusResourceKey(status)),
    parentOverviewFallback: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.parentOverviewFallback",
    ),
    queuedHeadline: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.queued",
    ),
    retryHeadline: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.retry",
    ),
    runningHeadline: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.running",
    ),
    surfaceTitle: params.translate(
      "agentChat.teamWorkspace.boardChrome.headline.surfaceTitle",
    ),
    childSingleHint: params.translate(
      "agentChat.teamWorkspace.boardChrome.hint.childSingle",
    ),
    emptyHint: params.translate(
      "agentChat.teamWorkspace.boardChrome.hint.empty",
    ),
    runtimeHint: params.translate(
      "agentChat.teamWorkspace.boardChrome.hint.runtime",
    ),
    waitingFocus: params.translate(
      "agentChat.teamWorkspace.overview.selectedSession.waitingTitle",
    ),
  };
}

const SOURCE_TEAM_WORKSPACE_BOARD_CHROME_COPY =
  buildTeamWorkspaceBoardChromeCopy({
    locale: "zh-CN",
    translate: translateBoardChromeSourceKey,
  });

export interface TeamWorkspaceBoardChromeSession {
  name: string;
  runtimeStatus?: TeamWorkspaceRuntimeStatus;
  updatedAt?: number;
  isCurrent?: boolean;
}

export interface TeamWorkspaceBoardChromeChip {
  key: string;
  text: string;
  tone: "summary" | "muted" | "status";
  status?: TeamWorkspaceRuntimeStatus;
}

export interface TeamWorkspaceBoardStatusSummaryBadge {
  key: string;
  text: string;
  status?: TeamWorkspaceRuntimeStatus;
}

export interface TeamWorkspaceBoardChromeDisplayState {
  boardHeadline: string;
  boardHint: string;
  compactBoardHeadline: string;
  compactToolbarChips: TeamWorkspaceBoardChromeChip[];
  statusSummaryBadges: TeamWorkspaceBoardStatusSummaryBadge[];
}

function buildBoardHeadline(params: {
  copy: TeamWorkspaceBoardChromeCopy;
  hasRuntimeSessions: boolean;
  isChildSession: boolean;
  parentSessionName?: string | null;
  statusSummary: Record<string, number>;
  totalTeamSessions: number;
}) {
  const {
    copy,
    hasRuntimeSessions,
    isChildSession,
    parentSessionName,
    statusSummary,
    totalTeamSessions,
  } = params;
  const runningCount = statusSummary.running ?? 0;
  const queuedCount = statusSummary.queued ?? 0;
  const completedCount = statusSummary.completed ?? 0;
  const retryCount = (statusSummary.failed ?? 0) + (statusSummary.aborted ?? 0);

  if (isChildSession) {
    return parentSessionName?.trim() || copy.parentOverviewFallback;
  }
  if (!hasRuntimeSessions) {
    return copy.emptyHeadline;
  }
  if (runningCount > 0) {
    if (queuedCount > 0) {
      return copy.formatRunningWithQueuedHeadline(runningCount, queuedCount);
    }
    return totalTeamSessions > 1
      ? copy.formatRunningHeadline(runningCount)
      : copy.runningHeadline;
  }
  if (queuedCount > 0) {
    return totalTeamSessions > 1
      ? copy.formatQueuedHeadline(queuedCount)
      : copy.queuedHeadline;
  }
  if (completedCount > 0 && completedCount === totalTeamSessions) {
    return totalTeamSessions > 1
      ? copy.formatCompletedHeadline(completedCount)
      : copy.completedHeadline;
  }
  if (retryCount > 0 && retryCount === totalTeamSessions) {
    return totalTeamSessions > 1
      ? copy.formatRetryHeadline(retryCount)
      : copy.retryHeadline;
  }
  return totalTeamSessions > 0
    ? copy.formatConnectedHeadline(totalTeamSessions)
    : copy.surfaceTitle;
}

function buildBoardHint(params: {
  copy: TeamWorkspaceBoardChromeCopy;
  hasRuntimeSessions: boolean;
  isChildSession: boolean;
  siblingCount: number;
}) {
  const { copy, hasRuntimeSessions, isChildSession, siblingCount } = params;

  if (isChildSession) {
    return siblingCount > 0
      ? copy.formatSiblingHint(siblingCount)
      : copy.childSingleHint;
  }
  if (!hasRuntimeSessions) {
    return copy.emptyHint;
  }
  return copy.runtimeHint;
}

export function buildTeamWorkspaceBoardChromeDisplayState(params: {
  hasRuntimeSessions: boolean;
  runtimeFormationTitle?: string | null;
  runtimeFormationHint?: string | null;
  isChildSession: boolean;
  parentSessionName?: string | null;
  totalTeamSessions: number;
  siblingCount: number;
  selectedSession?: TeamWorkspaceBoardChromeSession | null;
  zoom: number;
  canWaitAnyActiveTeamSession: boolean;
  waitableCount: number;
  canCloseCompletedTeamSessions: boolean;
  completedCount: number;
  statusSummary: Record<string, number>;
  copy?: TeamWorkspaceBoardChromeCopy;
}): TeamWorkspaceBoardChromeDisplayState {
  const copy = params.copy ?? SOURCE_TEAM_WORKSPACE_BOARD_CHROME_COPY;
  const boardHeadline =
    !params.hasRuntimeSessions && params.runtimeFormationTitle
      ? params.runtimeFormationTitle
      : buildBoardHeadline({
          copy,
          hasRuntimeSessions: params.hasRuntimeSessions,
          isChildSession: params.isChildSession,
          parentSessionName: params.parentSessionName,
          statusSummary: params.statusSummary,
          totalTeamSessions: params.totalTeamSessions,
        });
  const boardHint =
    !params.hasRuntimeSessions && params.runtimeFormationHint
      ? params.runtimeFormationHint
      : buildBoardHint({
          copy,
          hasRuntimeSessions: params.hasRuntimeSessions,
          isChildSession: params.isChildSession,
          siblingCount: params.siblingCount,
        });
  const compactToolbarChips: TeamWorkspaceBoardChromeChip[] = [
    {
      key: "focus",
      text: params.selectedSession
        ? copy.formatFocusChip(params.selectedSession.name)
        : copy.waitingFocus,
      tone: "summary",
    },
    ...(params.selectedSession?.runtimeStatus
      ? [
          {
            key: "status",
            text: copy.getRuntimeStatusLabel(
              params.selectedSession.runtimeStatus,
            ),
            tone: "status" as const,
            status: params.selectedSession.runtimeStatus,
          },
        ]
      : []),
    ...(params.selectedSession
      ? [
          {
            key: "updated-at",
            text: copy.formatUpdatedAtChip(params.selectedSession.updatedAt),
            tone: "muted" as const,
          },
        ]
      : []),
    ...(params.selectedSession?.isCurrent
      ? [
          {
            key: "current",
            text: copy.currentTask,
            tone: "muted" as const,
          },
        ]
      : []),
    ...(params.canWaitAnyActiveTeamSession
      ? [
          {
            key: "waitable",
            text: copy.formatWaitableChipCount(params.waitableCount),
            tone: "muted" as const,
          },
        ]
      : []),
    ...(params.canCloseCompletedTeamSessions
      ? [
          {
            key: "completed",
            text: copy.formatCompletedChipCount(params.completedCount),
            tone: "muted" as const,
          },
        ]
      : []),
  ];

  return {
    boardHeadline,
    boardHint,
    compactBoardHeadline: boardHeadline,
    compactToolbarChips,
    statusSummaryBadges: Object.entries(params.statusSummary)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => {
        const normalizedStatus =
          status === "idle"
            ? undefined
            : (status as TeamWorkspaceRuntimeStatus);

        return {
          key: status,
          text: copy.formatStatusSummary(
            copy.getRuntimeStatusLabel(normalizedStatus),
            count,
          ),
          status: normalizedStatus,
        };
      }),
  };
}
