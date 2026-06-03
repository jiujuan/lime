import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import { formatDate, formatRelativeTime } from "@/i18n/format";
import { isAssistantRuntimeErrorDisplayText } from "@/components/agent/chat/utils/messageDisplaySanitizer";

export interface SidebarSessionMetaOptions {
  locale?: string | null;
  formatArchived?: (time: string) => string;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

function formatSidebarSessionTime(
  updatedAt: number,
  locale?: string | null,
): string {
  const timestampMs = updatedAt * SECOND_MS;
  const diffMs = timestampMs - Date.now();
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs < MINUTE_MS) {
    return formatRelativeTime(0, "second", {
      locale,
      numeric: "auto",
      style: "narrow",
    });
  }

  if (absDiffMs < HOUR_MS) {
    return formatRelativeTime(Math.round(diffMs / MINUTE_MS), "minute", {
      locale,
      numeric: "auto",
      style: "narrow",
    });
  }

  if (absDiffMs < DAY_MS) {
    return formatRelativeTime(Math.round(diffMs / HOUR_MS), "hour", {
      locale,
      numeric: "auto",
      style: "narrow",
    });
  }

  if (absDiffMs < MONTH_MS) {
    return formatRelativeTime(Math.round(diffMs / DAY_MS), "day", {
      locale,
      numeric: "auto",
      style: "narrow",
    });
  }

  return formatDate(timestampMs, {
    locale,
    month: "numeric",
    day: "numeric",
  });
}

export function formatSidebarSessionMeta(
  session: AsterSessionInfo,
  options: SidebarSessionMetaOptions = {},
): string {
  if (typeof session.archived_at === "number" && session.archived_at > 0) {
    const archivedTime = formatSidebarSessionTime(
      session.archived_at,
      options.locale,
    );
    return options.formatArchived?.(archivedTime) ?? archivedTime;
  }

  return formatSidebarSessionTime(session.updated_at, options.locale);
}

export function resolveSidebarSessionTitle(
  session: AsterSessionInfo,
  fallbackTitle: string,
): string {
  const title = session.name?.trim() || "";
  if (
    isAssistantRuntimeErrorDisplayText(title, {
      allowTruncatedTitle: true,
    })
  ) {
    return fallbackTitle;
  }
  return title || fallbackTitle;
}
