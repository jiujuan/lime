import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import { isAuxiliaryAgentSessionId } from "@/lib/api/agentRuntime/sessionIdentity";
import { resolveSidebarSessionTitle } from "./sidebarSessionFormatting";

export function buildSidebarSessionRequestLimit(
  visibleCount: number,
  pageSize: number,
): number {
  const normalizedVisibleCount = Math.max(visibleCount, pageSize);
  return normalizedVisibleCount + 1;
}

export function splitSidebarSessionResult(params: {
  sessions: AsterSessionInfo[];
  visibleCount: number;
  pageSize: number;
}): {
  sessions: AsterSessionInfo[];
  hasMore: boolean;
} {
  const { sessions, visibleCount, pageSize } = params;
  const targetCount = Math.max(visibleCount, pageSize);
  return {
    sessions: sessions.slice(0, targetCount),
    hasMore: sessions.length > targetCount,
  };
}

export function hasCachedSidebarSessionEntry(
  sessions: AsterSessionInfo[],
  sessionId?: string | null,
): boolean {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) {
    return false;
  }

  return sessions.some((session) => session.id === normalizedSessionId);
}

export function sortSidebarSessions(
  sessions: AsterSessionInfo[],
): AsterSessionInfo[] {
  return sessions
    .filter((session) => !isAuxiliaryAgentSessionId(session.id))
    .sort((left, right) => {
      if (left.updated_at !== right.updated_at) {
        return right.updated_at - left.updated_at;
      }

      if (left.created_at !== right.created_at) {
        return right.created_at - left.created_at;
      }

      return left.id.localeCompare(right.id);
    });
}

export function buildVisibleSidebarSessions(params: {
  sessions: AsterSessionInfo[];
  currentSessionId?: string | null;
  limit: number;
}): AsterSessionInfo[] {
  const { sessions, currentSessionId, limit } = params;
  if (limit <= 0) {
    return [];
  }

  if (sessions.length <= limit) {
    return sessions;
  }

  const visibleSessions = sessions.slice(0, limit);
  const normalizedCurrentSessionId = currentSessionId?.trim();
  if (
    !normalizedCurrentSessionId ||
    visibleSessions.some((session) => session.id === normalizedCurrentSessionId)
  ) {
    return visibleSessions;
  }

  const currentSession = sessions.find(
    (session) => session.id === normalizedCurrentSessionId,
  );
  if (!currentSession) {
    return visibleSessions;
  }

  return [...visibleSessions.slice(0, Math.max(limit - 1, 0)), currentSession];
}

export function normalizeSidebarSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesSidebarSessionTitle(
  session: AsterSessionInfo,
  normalizedQuery: string,
  fallbackTitle: string,
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return normalizeSidebarSearchText(
    resolveSidebarSessionTitle(session, fallbackTitle),
  ).includes(normalizedQuery);
}
