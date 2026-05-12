import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import agentSourceResource from "@/i18n/resources/zh-CN/agent.json";
import {
  buildTeamWorkspaceActivityEntryFromThreadItem,
  buildTeamWorkspaceSessionFingerprint,
  mergeSessionActivityEntries,
  type TeamWorkspaceActivityEntry,
  type TeamWorkspaceRuntimeStatus,
} from "../teamWorkspaceRuntime";

type ActivityPreviewResourceKey =
  | "agentChat.teamWorkspace.activityPreview.error.historyReadFailed"
  | "agentChat.teamWorkspace.activityPreview.error.syncFailed"
  | "agentChat.teamWorkspace.activityPreview.line"
  | "agentChat.teamWorkspace.activityPreview.messageTitle.error"
  | "agentChat.teamWorkspace.activityPreview.messageTitle.output"
  | "agentChat.teamWorkspace.activityPreview.messageTitle.reply"
  | "agentChat.teamWorkspace.activityPreview.status.completed"
  | "agentChat.teamWorkspace.activityPreview.status.error"
  | "agentChat.teamWorkspace.activityPreview.status.failed"
  | "agentChat.teamWorkspace.activityPreview.status.inProgress"
  | "agentChat.teamWorkspace.activityPreview.status.message"
  | "agentChat.teamWorkspace.activityPreview.status.warning";

export type ActivityPreviewTranslate = (
  key: ActivityPreviewResourceKey,
  options?: Record<string, unknown>,
) => string;

type AgentSourceResourceKey = keyof typeof agentSourceResource;

function interpolateActivityPreviewSourceTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateActivityPreviewSourceKey(
  key: ActivityPreviewResourceKey,
  values?: Record<string, unknown>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateActivityPreviewSourceTemplate(template, values);
}

type ActivityPreviewMessageTitleKind = "error" | "output" | "reply";
type ActivityPreviewStatusKind =
  | "completed"
  | "error"
  | "failed"
  | "inProgress"
  | "message"
  | "warning";

export interface ActivityPreviewCopy {
  formatPreviewLine: (title: string, detail: string) => string;
  getMessageTitle: (kind: ActivityPreviewMessageTitleKind) => string;
  getStatusLabel: (kind: ActivityPreviewStatusKind) => string;
  historyReadFailed: string;
  syncFailed: string;
}

function resolveActivityPreviewStatusKey(
  kind: ActivityPreviewStatusKind,
): ActivityPreviewResourceKey {
  return `agentChat.teamWorkspace.activityPreview.status.${kind}` as ActivityPreviewResourceKey;
}

function resolveActivityPreviewMessageTitleKey(
  kind: ActivityPreviewMessageTitleKind,
): ActivityPreviewResourceKey {
  return `agentChat.teamWorkspace.activityPreview.messageTitle.${kind}` as ActivityPreviewResourceKey;
}

export function buildActivityPreviewCopy(params: {
  translate: ActivityPreviewTranslate;
}): ActivityPreviewCopy {
  return {
    formatPreviewLine: (title, detail) =>
      params.translate("agentChat.teamWorkspace.activityPreview.line", {
        detail,
        title,
      }),
    getMessageTitle: (kind) =>
      params.translate(resolveActivityPreviewMessageTitleKey(kind)),
    getStatusLabel: (kind) =>
      params.translate(resolveActivityPreviewStatusKey(kind)),
    historyReadFailed: params.translate(
      "agentChat.teamWorkspace.activityPreview.error.historyReadFailed",
    ),
    syncFailed: params.translate(
      "agentChat.teamWorkspace.activityPreview.error.syncFailed",
    ),
  };
}

const SOURCE_ACTIVITY_PREVIEW_COPY = buildActivityPreviewCopy({
  translate: translateActivityPreviewSourceKey,
});

export interface SessionActivityPreviewState {
  preview: string | null;
  entries: TeamWorkspaceActivityEntry[];
  status: "loading" | "ready" | "error";
  errorMessage?: string;
  fingerprint?: string;
  refreshVersion?: number;
  syncedAt?: number;
}

export interface ActivityPreviewSession {
  id: string;
  sessionType?: string;
  runtimeStatus?: TeamWorkspaceRuntimeStatus;
  latestTurnStatus?: TeamWorkspaceRuntimeStatus;
}

export interface SelectedSessionActivityState {
  previewState: SessionActivityPreviewState | null;
  entries: TeamWorkspaceActivityEntry[];
  previewText: string | null;
  supportsPreview: boolean;
  activityId: string | null;
  fingerprint: string | null;
  refreshVersion: number;
  shouldPoll: boolean;
}

export interface StaleSessionActivityTarget {
  sessionId: string;
  fingerprint: string;
  refreshVersion: number;
}

const ACTIVITY_PREVIEW_MAX_LENGTH = 360;
const ACTIVITY_TIMELINE_DETAIL_MAX_LENGTH = 220;

function normalizeActivityPreviewText(
  value?: string | null,
  maxLength = ACTIVITY_PREVIEW_MAX_LENGTH,
): string | null {
  const normalized = value
    ?.replace(/\r\n/g, "\n")
    .split("\0")
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function buildActivityPreviewLine(
  label: string,
  value?: string | null,
  copy: ActivityPreviewCopy = SOURCE_ACTIVITY_PREVIEW_COPY,
): string | null {
  const normalized = normalizeActivityPreviewText(value);
  if (!normalized) {
    return null;
  }
  return copy.formatPreviewLine(label, normalized);
}

function resolveActivityEntryStatusMeta(
  item: AgentThreadItem | { type: "message_fallback" },
  status?: AgentThreadItem["status"],
  copy: ActivityPreviewCopy = SOURCE_ACTIVITY_PREVIEW_COPY,
) {
  if (item.type === "error") {
    return {
      label: copy.getStatusLabel("error"),
      badgeClassName: "border border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (item.type === "warning") {
    return {
      label: copy.getStatusLabel("warning"),
      badgeClassName: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  switch (status) {
    case "in_progress":
      return {
        label: copy.getStatusLabel("inProgress"),
        badgeClassName: "border border-sky-200 bg-sky-50 text-sky-700",
      };
    case "failed":
      return {
        label: copy.getStatusLabel("failed"),
        badgeClassName: "border border-rose-200 bg-rose-50 text-rose-700",
      };
    case "completed":
      return {
        label: copy.getStatusLabel("completed"),
        badgeClassName:
          "border border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    default:
      return {
        label: copy.getStatusLabel("message"),
        badgeClassName: "border border-slate-200 bg-slate-50 text-slate-600",
      };
  }
}

export function buildActivityPreviewFromEntry(
  entry?: TeamWorkspaceActivityEntry | null,
  copy: ActivityPreviewCopy = SOURCE_ACTIVITY_PREVIEW_COPY,
) {
  if (!entry) {
    return null;
  }

  return buildActivityPreviewLine(entry.title, entry.detail, copy);
}

function extractMessageActivityEntries(
  detail: AsterSessionDetail,
  copy: ActivityPreviewCopy = SOURCE_ACTIVITY_PREVIEW_COPY,
): TeamWorkspaceActivityEntry[] {
  const reversedMessages = [...detail.messages].sort(
    (left, right) => right.timestamp - left.timestamp,
  );

  for (const message of reversedMessages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const content of message.content) {
      const title =
        content.type === "tool_response"
          ? content.error
            ? copy.getMessageTitle("error")
            : content.output
              ? copy.getMessageTitle("output")
              : copy.getMessageTitle("reply")
          : copy.getMessageTitle("reply");
      const previewSource =
        content.type === "tool_response"
          ? content.error || content.output
          : content.type === "text" || content.type === "thinking"
            ? content.text
            : undefined;
      const detailText = normalizeActivityPreviewText(
        previewSource,
        ACTIVITY_TIMELINE_DETAIL_MAX_LENGTH,
      );

      if (detailText) {
        const statusMeta = resolveActivityEntryStatusMeta(
          { type: "message_fallback" },
          undefined,
          copy,
        );
        return [
          {
            id: `message-${message.id ?? message.timestamp}`,
            title,
            detail: detailText,
            statusLabel: statusMeta.label,
            badgeClassName: statusMeta.badgeClassName,
            sourceType: "message_fallback",
            sourceLabel: "message history",
          },
        ];
      }
    }
  }

  return [];
}

export function extractSessionActivitySnapshot(
  detail: AsterSessionDetail,
  activityTimelineEntryLimit: number,
  options?: {
    copy?: ActivityPreviewCopy;
  },
): {
  preview: string | null;
  entries: TeamWorkspaceActivityEntry[];
} {
  const copy = options?.copy ?? SOURCE_ACTIVITY_PREVIEW_COPY;
  const orderedItems = [...(detail.items ?? [])].sort(
    (left, right) => right.sequence - left.sequence,
  );
  const entries: TeamWorkspaceActivityEntry[] = [];

  for (const item of orderedItems) {
    const entry = buildTeamWorkspaceActivityEntryFromThreadItem(item);
    if (entry) {
      entries.push(entry);
    }
    if (entries.length >= activityTimelineEntryLimit) {
      break;
    }
  }

  if (entries.length > 0) {
    return {
      preview: buildActivityPreviewFromEntry(entries[0], copy),
      entries,
    };
  }

  const messageEntries = extractMessageActivityEntries(detail, copy);
  return {
    preview: buildActivityPreviewFromEntry(messageEntries[0], copy),
    entries: messageEntries,
  };
}

export function shouldPollSessionActivity(
  session?: ActivityPreviewSession | null,
) {
  const runtimeStatus = session?.runtimeStatus;
  const latestTurnStatus = session?.latestTurnStatus;
  return (
    runtimeStatus === "running" ||
    runtimeStatus === "queued" ||
    latestTurnStatus === "running" ||
    latestTurnStatus === "queued"
  );
}

export function buildSessionActivityFingerprint(
  session?: ActivityPreviewSession | null,
) {
  return buildTeamWorkspaceSessionFingerprint(session);
}

export function buildSelectedSessionActivityState(params: {
  selectedSession?: ActivityPreviewSession | null;
  selectedBaseSession?: ActivityPreviewSession | null;
  liveActivityBySessionId?: Record<string, TeamWorkspaceActivityEntry[]>;
  previewBySessionId?: Record<string, SessionActivityPreviewState>;
  activityRefreshVersionBySessionId?: Record<string, number>;
  activityTimelineEntryLimit: number;
  copy?: ActivityPreviewCopy;
}): SelectedSessionActivityState {
  const copy = params.copy ?? SOURCE_ACTIVITY_PREVIEW_COPY;
  const selectedSession = params.selectedSession ?? null;
  const previewState = selectedSession
    ? (params.previewBySessionId?.[selectedSession.id] ?? null)
    : null;
  const entries = selectedSession
    ? mergeSessionActivityEntries(
        params.liveActivityBySessionId?.[selectedSession.id],
        previewState?.entries,
        params.activityTimelineEntryLimit,
      )
    : [];
  const previewText =
    buildActivityPreviewFromEntry(entries[0], copy) ??
    previewState?.preview ??
    null;
  const supportsPreview = Boolean(
    selectedSession && selectedSession.sessionType !== "user",
  );
  const activityId = supportsPreview ? (selectedSession?.id ?? null) : null;
  const fingerprint = supportsPreview
    ? buildSessionActivityFingerprint(params.selectedBaseSession)
    : null;
  const refreshVersion = activityId
    ? (params.activityRefreshVersionBySessionId?.[activityId] ?? 0)
    : 0;

  return {
    previewState,
    entries,
    previewText,
    supportsPreview,
    activityId,
    fingerprint,
    refreshVersion,
    shouldPoll: supportsPreview && shouldPollSessionActivity(selectedSession),
  };
}

export function buildPreviewableRailSessionsSyncKey(params: {
  sessions: ActivityPreviewSession[];
  activityRefreshVersionBySessionId?: Record<string, number>;
}) {
  return params.sessions
    .map((session) => {
      const fingerprint = buildSessionActivityFingerprint(session);
      const refreshVersion =
        params.activityRefreshVersionBySessionId?.[session.id] ?? 0;
      return `${session.id}:${fingerprint}:${refreshVersion}`;
    })
    .join("|");
}

export function collectStaleSessionActivityTargets(params: {
  sessions: ActivityPreviewSession[];
  previewBySessionId?: Record<string, SessionActivityPreviewState>;
  activityRefreshVersionBySessionId?: Record<string, number>;
}): StaleSessionActivityTarget[] {
  return params.sessions
    .map((session) => {
      const fingerprint = buildSessionActivityFingerprint(session);
      const cachedPreview = params.previewBySessionId?.[session.id];
      const refreshVersion =
        params.activityRefreshVersionBySessionId?.[session.id] ?? 0;

      if (
        cachedPreview?.fingerprint === fingerprint &&
        (cachedPreview?.refreshVersion ?? 0) >= refreshVersion
      ) {
        return null;
      }

      return {
        sessionId: session.id,
        fingerprint,
        refreshVersion,
      };
    })
    .filter(Boolean) as StaleSessionActivityTarget[];
}
