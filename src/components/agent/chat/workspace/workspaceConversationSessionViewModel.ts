import type { TFunction } from "i18next";
import type { AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime/sessionTypes";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import type {
  CanvasWorkbenchSessionView,
  CanvasWorkbenchSummaryStat,
  CanvasWorkbenchUtilityView,
} from "../components/CanvasWorkbenchLayout";

type AgentTranslate = TFunction<"agent", undefined>;

export interface SessionStatusBadge {
  label: string;
  tone: "default" | "accent" | "success";
}

export interface SessionRuntimeProjectionState {
  key: string;
  sessionId: string;
  firstMessageId: string;
  lastMessageId: string;
  ready: boolean;
}

export interface SessionRuntimeProjectionIdentity {
  key: string;
  sessionId: string;
  firstMessageId: string;
  lastMessageId: string;
  lastTurnId: string;
  lastItemId: string;
}

export interface SessionRuntimeProjectionStatus {
  alreadyReady: boolean;
  appendOnlyMessageUpdate: boolean;
  shouldDefer: boolean;
  ready: boolean;
  shouldUseDeferredProjection: boolean;
}

interface IdentifiableItem {
  id?: string | null;
}

export function buildSessionRuntimeProjectionIdentity({
  sessionId,
  messages,
  turns,
  threadItems,
}: {
  sessionId?: string | null;
  messages: readonly IdentifiableItem[];
  turns: readonly IdentifiableItem[];
  threadItems: readonly IdentifiableItem[];
}): SessionRuntimeProjectionIdentity {
  const resolvedSessionId = sessionId ?? "no-session";
  const firstMessageId = messages[0]?.id ?? "no-first-message";
  const lastMessageId = messages[messages.length - 1]?.id ?? "no-last-message";
  const lastTurnId = turns[turns.length - 1]?.id ?? "no-last-turn";
  const lastItemId = threadItems[threadItems.length - 1]?.id ?? "no-last-item";

  return {
    key: [
      resolvedSessionId,
      firstMessageId,
      lastMessageId,
      lastTurnId,
      lastItemId,
    ].join("|"),
    sessionId: resolvedSessionId,
    firstMessageId,
    lastMessageId,
    lastTurnId,
    lastItemId,
  };
}

export function shouldConsiderSessionRuntimeProjectionDeferral({
  isRestoringSession,
  isSending,
  focusedTimelineItemId,
  pendingA2UIForm,
  messageCount,
  turnCount,
  threadItemCount,
  messageThreshold,
  turnThreshold,
  threadItemThreshold,
}: {
  isRestoringSession: boolean;
  isSending: boolean;
  focusedTimelineItemId?: string | null;
  pendingA2UIForm?: unknown;
  messageCount: number;
  turnCount: number;
  threadItemCount: number;
  messageThreshold: number;
  turnThreshold: number;
  threadItemThreshold: number;
}): boolean {
  const hasHeavySessionRuntimeProjection =
    messageCount >= messageThreshold ||
    turnCount >= turnThreshold ||
    threadItemCount >= threadItemThreshold;

  return (
    isRestoringSession &&
    !isSending &&
    !focusedTimelineItemId &&
    !pendingA2UIForm &&
    hasHeavySessionRuntimeProjection
  );
}

export function resolveSessionRuntimeProjectionStatus({
  currentState,
  identity,
  shouldConsiderDeferring,
}: {
  currentState: SessionRuntimeProjectionState;
  identity: SessionRuntimeProjectionIdentity;
  shouldConsiderDeferring: boolean;
}): SessionRuntimeProjectionStatus {
  const alreadyReady = currentState.key === identity.key && currentState.ready;
  const appendOnlyMessageUpdate =
    currentState.key !== identity.key &&
    currentState.sessionId === identity.sessionId &&
    currentState.firstMessageId === identity.firstMessageId &&
    currentState.lastMessageId !== identity.lastMessageId;
  const shouldDefer =
    shouldConsiderDeferring && !alreadyReady && !appendOnlyMessageUpdate;
  const ready =
    currentState.key === identity.key ? currentState.ready : !shouldDefer;

  return {
    alreadyReady,
    appendOnlyMessageUpdate,
    shouldDefer,
    ready,
    shouldUseDeferredProjection: shouldDefer && !ready,
  };
}

export function buildSessionRuntimeProjectionState(params: {
  key: string;
  sessionId: string;
  firstMessageId: string;
  lastMessageId: string;
  ready: boolean;
}): SessionRuntimeProjectionState {
  return params;
}

export function resolveNextSessionRuntimeProjectionState(
  current: SessionRuntimeProjectionState,
  next: SessionRuntimeProjectionState,
): SessionRuntimeProjectionState {
  return current.key === next.key &&
    current.sessionId === next.sessionId &&
    current.firstMessageId === next.firstMessageId &&
    current.lastMessageId === next.lastMessageId &&
    current.ready === next.ready
    ? current
    : next;
}

export function shortenSessionText(
  value?: string | null,
  maxLength = 120,
): string {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function resolveSessionStatusBadge(
  status?: AgentThreadTurn["status"] | null,
  t?: AgentTranslate,
): SessionStatusBadge {
  if (status === "running") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.running") ?? "执行中",
      tone: "accent",
    };
  }
  if (status === "completed") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.completed") ?? "已完成",
      tone: "success",
    };
  }
  if (status === "failed") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.failed") ?? "失败",
      tone: "default",
    };
  }
  if (
    status === "aborted" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "interrupted"
  ) {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.aborted") ?? "已中断",
      tone: "default",
    };
  }
  return {
    label: t?.("agentChat.sessionOverview.status.turn.idle") ?? "空闲",
    tone: "default",
  };
}

export function buildQuotedReplyText({
  content,
  input,
}: {
  content: string;
  input: string;
}): string | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }

  const quotedBlock = `${normalized
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}\n\n`;

  return input.trim() ? `${input.trimEnd()}\n\n${quotedBlock}` : quotedBlock;
}

export interface SessionRuntimeCounters {
  outputItemCount: number;
  failedOutputItemCount: number;
  inProgressItemCount: number;
  generatedFileCount: number;
  hasRuntimeFileChanges: boolean;
  hasRuntimeOutputs: boolean;
  shouldUseRuntimeWorkbench: boolean;
  shouldExposeSessionProgress: boolean;
}

export function buildSessionRuntimeCountersFromCodingProjection({
  codingView,
  fileCheckpointSummary,
  pendingActionCount,
}: {
  codingView: CodingWorkbenchView;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  pendingActionCount: number;
}): SessionRuntimeCounters {
  const outputItemCount =
    codingView.commands.length +
    codingView.tests.length +
    codingView.actions.length +
    codingView.diagnostics.length;
  const failedOutputItemCount =
    codingView.commands.filter((command) => command.status === "failed")
      .length +
    codingView.tests.filter((test) => test.status === "failed").length +
    codingView.diagnostics.length;
  const inProgressItemCount =
    codingView.commands.filter((command) => command.status === "running")
      .length +
    codingView.tests.filter((test) => test.status === "running").length +
    codingView.changes.filter(
      (change) => change.status === "running" || change.status === "pending",
    ).length;
  const generatedFileCount =
    codingView.changes.length || codingView.files.length;
  const hasRuntimeFileChanges =
    (fileCheckpointSummary?.count ?? 0) > 0 || codingView.changes.length > 0;
  const hasRuntimeOutputs = outputItemCount > 0;
  const shouldUseRuntimeWorkbench =
    hasRuntimeFileChanges ||
    hasRuntimeOutputs ||
    inProgressItemCount > 0 ||
    codingView.mainObject.status === "running" ||
    codingView.mainObject.status === "blocked";

  return {
    outputItemCount,
    failedOutputItemCount,
    inProgressItemCount,
    generatedFileCount,
    hasRuntimeFileChanges,
    hasRuntimeOutputs,
    shouldUseRuntimeWorkbench,
    shouldExposeSessionProgress:
      inProgressItemCount > 0 ||
      pendingActionCount > 0 ||
      codingView.mainObject.status === "running" ||
      codingView.mainObject.status === "blocked",
  };
}

export interface SessionRuntimeCountLabels {
  inProgressItemCountLabel: string;
  generatedFileCountLabel: string;
  pendingActionCountLabel: string;
}

export function buildSessionSummaryStats({
  t,
  currentSessionStatus,
  counters,
  labels,
  pendingActionCount,
}: {
  t: AgentTranslate;
  currentSessionStatus: SessionStatusBadge;
  counters: SessionRuntimeCounters;
  labels: SessionRuntimeCountLabels;
  pendingActionCount: number;
}): CanvasWorkbenchSummaryStat[] {
  return [
    {
      key: "session-status",
      label: t("agentChat.workspaceSession.summary.status.label"),
      value: currentSessionStatus.label,
      detail: t("agentChat.workspaceSession.summary.status.detail"),
      tone: currentSessionStatus.tone,
    },
    {
      key: "session-generated-files",
      label: t("agentChat.workspaceSession.summary.outputs.label"),
      value:
        counters.inProgressItemCount > 0
          ? t("agentChat.workspaceSession.summary.outputs.value.inProgress", {
              countLabel: labels.inProgressItemCountLabel,
            })
          : counters.generatedFileCount > 0
            ? t("agentChat.workspaceSession.summary.outputs.value.files", {
                countLabel: labels.generatedFileCountLabel,
              })
            : t("agentChat.workspaceSession.summary.outputs.value.empty"),
      detail:
        counters.inProgressItemCount > 0
          ? t("agentChat.workspaceSession.summary.outputs.detail.inProgress")
          : counters.generatedFileCount > 0
            ? t("agentChat.workspaceSession.summary.outputs.detail.files")
            : t("agentChat.workspaceSession.summary.outputs.detail.empty"),
      tone: counters.inProgressItemCount > 0 ? "accent" : "default",
    },
    {
      key: "session-follow-up",
      label:
        pendingActionCount > 0
          ? t("agentChat.workspaceSession.summary.next.label.pending")
          : t("agentChat.workspaceSession.summary.next.label.idle"),
      value:
        pendingActionCount > 0
          ? t("agentChat.workspaceSession.summary.next.value.pending", {
              countLabel: labels.pendingActionCountLabel,
            })
          : t("agentChat.workspaceSession.summary.next.value.idle"),
      detail:
        pendingActionCount > 0
          ? t("agentChat.workspaceSession.summary.next.detail.pending")
          : t("agentChat.workspaceSession.summary.next.detail.idle"),
      tone: pendingActionCount > 0 ? "accent" : "default",
    },
  ];
}

export function buildSessionHeaderViewModel({
  t,
  currentSessionTurn,
  currentSessionStatus,
  counters,
  labels,
  pendingActionCount,
}: {
  t: AgentTranslate;
  currentSessionTurn: AgentThreadTurn | null;
  currentSessionStatus: SessionStatusBadge;
  counters: SessionRuntimeCounters;
  labels: SessionRuntimeCountLabels;
  pendingActionCount: number;
}): Omit<CanvasWorkbenchSessionView, "renderPanel"> | null {
  if (!counters.shouldExposeSessionProgress) {
    return null;
  }

  return {
    eyebrow: t("agentChat.workspaceSession.eyebrow"),
    title: t("agentChat.workspaceSession.title"),
    tabLabel: t("agentChat.workspaceSession.tabLabel"),
    tabBadge:
      counters.inProgressItemCount > 0
        ? t("agentChat.workspaceSession.badge.inProgress", {
            countLabel: labels.inProgressItemCountLabel,
          })
        : undefined,
    tabBadgeTone: counters.inProgressItemCount > 0 ? "sky" : "slate",
    subtitle: currentSessionTurn
      ? t("agentChat.workspaceSession.subtitle.current", {
          prompt:
            shortenSessionText(currentSessionTurn.prompt_text, 160) ||
            t("agentChat.sessionOverview.latestPromptFallback"),
        })
      : t("agentChat.workspaceSession.subtitle.empty"),
    summaryStats: buildSessionSummaryStats({
      t,
      currentSessionStatus,
      counters,
      labels,
      pendingActionCount,
    }),
    badges: [
      {
        key: "session-status",
        label: currentSessionStatus.label,
        tone: currentSessionStatus.tone,
      },
      {
        key: "session-generated-files",
        label:
          counters.inProgressItemCount > 0
            ? t("agentChat.workspaceSession.badge.inProgress", {
                countLabel: labels.inProgressItemCountLabel,
              })
            : t("agentChat.workspaceSession.badge.files", {
                countLabel: labels.generatedFileCountLabel,
              }),
        tone: counters.inProgressItemCount > 0 ? "accent" : "default",
      },
      ...(pendingActionCount > 0
        ? [
            {
              key: "session-pending-actions",
              label: t("agentChat.workspaceSession.badge.pending", {
                countLabel: labels.pendingActionCountLabel,
              }),
              tone: "accent" as const,
            },
          ]
        : []),
    ],
  };
}

export function buildOutputHeaderViewModel({
  t,
  counters,
}: {
  t: AgentTranslate;
  counters: SessionRuntimeCounters;
}): Omit<CanvasWorkbenchUtilityView, "renderPanel"> {
  return {
    enabled: counters.shouldUseRuntimeWorkbench,
    tabLabel: t("agentChat.workspaceSession.outputView.tabLabel"),
    title: t("agentChat.workspaceSession.outputView.title"),
    subtitle: t("agentChat.workspaceSession.outputView.subtitle"),
    tabBadge:
      counters.outputItemCount > 0
        ? counters.outputItemCount > 99
          ? "99+"
          : `${counters.outputItemCount}`
        : undefined,
    tabBadgeTone:
      counters.failedOutputItemCount > 0
        ? "rose"
        : counters.outputItemCount > 0
          ? "sky"
          : "slate",
  };
}
