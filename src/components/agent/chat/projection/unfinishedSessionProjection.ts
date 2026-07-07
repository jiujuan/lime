import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import {
  hasRunningSessionOverviewActivity,
  type ThreadReadActivityOptions,
} from "./threadReadActivity";

export type AgentUnfinishedSessionStatus =
  | "running"
  | "queued"
  | "waitingAction";

export interface AgentUnfinishedSessionProjection {
  sessionId: string;
  title: string;
  preview: string;
  actionLabel: string;
  status: AgentUnfinishedSessionStatus;
  latestTurnStatus?: string;
  activeTurnId?: string;
  queuedTurnCount: number;
  updatedAt: Date;
}

const TERMINAL_THREAD_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "aborted",
]);

function normalizeRuntimeStatus(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) {
    return null;
  }
  if (
    normalized === "waiting_action" ||
    normalized === "waitingaction" ||
    normalized === "waiting_request" ||
    normalized === "waitingrequest" ||
    normalized === "waiting_input" ||
    normalized === "needs_input" ||
    normalized === "action_required"
  ) {
    return "waitingAction";
  }
  if (normalized === "cancelled") {
    return "canceled";
  }
  if (normalized === "in_progress" || normalized === "processing") {
    return "running";
  }
  return normalized;
}

function timestampToDate(value?: number): Date {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return new Date(0);
  }
  const millis = Math.abs(value) >= 1_000_000_000_000 ? value : value * 1000;
  return new Date(millis);
}

function resolveUnfinishedStatus(
  session: AsterSessionInfo,
  options: ThreadReadActivityOptions = {},
): AgentUnfinishedSessionStatus | null {
  const threadStatus = normalizeRuntimeStatus(session.thread_status);
  const latestTurnStatus = normalizeRuntimeStatus(session.latest_turn_status);
  if (threadStatus && TERMINAL_THREAD_STATUSES.has(threadStatus)) {
    return null;
  }

  if (threadStatus === "waitingAction" || latestTurnStatus === "waitingAction") {
    return "waitingAction";
  }

  if (latestTurnStatus && TERMINAL_THREAD_STATUSES.has(latestTurnStatus)) {
    return null;
  }

  const queuedTurnCount =
    typeof session.queued_turn_count === "number" &&
    Number.isFinite(session.queued_turn_count)
      ? Math.max(0, session.queued_turn_count)
      : 0;
  if (queuedTurnCount > 0 || latestTurnStatus === "queued") {
    return "queued";
  }

  if (hasRunningSessionOverviewActivity(session, options)) {
    return "running";
  }

  return null;
}

function resolveUnfinishedPreview(
  status: AgentUnfinishedSessionStatus,
): string {
  switch (status) {
    case "waitingAction":
      return "等待你确认后继续。";
    case "queued":
      return "仍有排队中的请求。";
    case "running":
      return "正在继续输出。";
  }
}

function resolveUnfinishedActionLabel(
  status: AgentUnfinishedSessionStatus,
): string {
  switch (status) {
    case "waitingAction":
      return "继续确认";
    case "queued":
      return "查看队列";
    case "running":
      return "查看输出";
  }
}

export function resolveUnfinishedSessionProjection(
  session: AsterSessionInfo,
  options: ThreadReadActivityOptions = {},
): AgentUnfinishedSessionProjection | null {
  const sessionId = session.id?.trim();
  if (!sessionId) {
    return null;
  }

  const status = resolveUnfinishedStatus(session, options);
  if (!status) {
    return null;
  }

  const updatedAt = timestampToDate(session.updated_at ?? session.created_at);
  if (updatedAt.getTime() <= 0) {
    return null;
  }

  const title = session.name?.trim() || "未命名对话";
  const activeTurnId = session.active_turn_id?.trim() || undefined;
  const queuedTurnCount =
    typeof session.queued_turn_count === "number" &&
    Number.isFinite(session.queued_turn_count)
      ? Math.max(0, session.queued_turn_count)
      : 0;

  return {
    sessionId,
    title,
    preview: resolveUnfinishedPreview(status),
    actionLabel: resolveUnfinishedActionLabel(status),
    status,
    latestTurnStatus:
      normalizeRuntimeStatus(session.latest_turn_status) ?? undefined,
    activeTurnId,
    queuedTurnCount,
    updatedAt,
  };
}

export function selectMostRecentUnfinishedSessionProjection(
  sessions: AsterSessionInfo[],
  options: ThreadReadActivityOptions = {},
): AgentUnfinishedSessionProjection | null {
  const candidates = sessions
    .map((session) => resolveUnfinishedSessionProjection(session, options))
    .filter(
      (projection): projection is AgentUnfinishedSessionProjection =>
        projection !== null,
    )
    .sort((left, right) => {
      const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return right.sessionId.localeCompare(left.sessionId);
    });

  return candidates[0] ?? null;
}
