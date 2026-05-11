import {
  AlertTriangle,
  Bot,
  Clock3,
  FileText,
  ListChecks,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../types";
import { sortThreadItems } from "../utils/threadTimelineView";
import { extractFileNameFromPath } from "../workspace/workspacePath";

interface CanvasSessionOverviewPanelProps {
  turns: AgentThreadTurn[];
  threadItems: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  queuedTurns?: QueuedTurnSnapshot[];
  isSending?: boolean;
  focusedItemId?: string | null;
}

type SessionStatusTone = "default" | "accent" | "success";
type AgentTranslate = TFunction<"agent", undefined>;

interface SessionActivityView {
  id: string;
  title: string;
  summary: string;
  timeLabel: string | null;
  statusLabel: string;
  tone: SessionStatusTone;
  icon: typeof Sparkles;
  iconClassName: string;
}

function shortenText(value?: string | null, maxLength = 120): string {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatTimeLabel(
  value: string | null | undefined,
  locale: string,
): string | null {
  if (!value) {
    return null;
  }

  const label = formatDate(value, {
    hour: "2-digit",
    locale,
    minute: "2-digit",
  });
  return label || null;
}

function resolveTurnStatusLabel(
  status: AgentThreadTurn["status"] | null | undefined,
  t: AgentTranslate,
): {
  label: string;
  tone: SessionStatusTone;
} {
  if (status === "running") {
    return {
      label: t("agentChat.sessionOverview.status.turn.running"),
      tone: "accent",
    };
  }
  if (status === "completed") {
    return {
      label: t("agentChat.sessionOverview.status.turn.completed"),
      tone: "success",
    };
  }
  if (status === "failed") {
    return {
      label: t("agentChat.sessionOverview.status.turn.failed"),
      tone: "default",
    };
  }
  if (status === "aborted") {
    return {
      label: t("agentChat.sessionOverview.status.turn.aborted"),
      tone: "default",
    };
  }
  return {
    label: t("agentChat.sessionOverview.status.turn.idle"),
    tone: "default",
  };
}

function resolveItemStatusLabel(
  item: AgentThreadItem,
  t: AgentTranslate,
): {
  label: string;
  tone: SessionStatusTone;
} {
  if (item.status === "in_progress") {
    return {
      label: t("agentChat.sessionOverview.status.item.inProgress"),
      tone: "accent",
    };
  }
  if (item.status === "failed") {
    return {
      label: t("agentChat.sessionOverview.status.item.failed"),
      tone: "default",
    };
  }
  return {
    label: t("agentChat.sessionOverview.status.item.completed"),
    tone: "success",
  };
}

function resolvePendingActionPreview(action: ActionRequired): string {
  const prompt = shortenText(action.prompt, 120);
  if (prompt) {
    return prompt;
  }

  const firstQuestion = action.questions?.[0];
  const questionText = shortenText(firstQuestion?.question, 120);
  if (questionText) {
    return questionText;
  }

  if (action.toolName?.trim()) {
    return action.toolName.trim();
  }

  return action.requestId;
}

function buildActivityView(
  item: AgentThreadItem,
  t: AgentTranslate,
  locale: string,
): SessionActivityView | null {
  const { label: statusLabel, tone } = resolveItemStatusLabel(item, t);
  const timeLabel = formatTimeLabel(
    item.updated_at || item.completed_at || item.started_at,
    locale,
  );

  switch (item.type) {
    case "tool_call":
      return {
        id: item.id,
        title:
          item.tool_name ||
          t("agentChat.sessionOverview.activity.toolCall.title"),
        summary:
          shortenText(item.error, 100) ||
          shortenText(
            typeof item.arguments === "string"
              ? item.arguments
              : JSON.stringify(item.arguments ?? {}, null, 2),
            100,
          ) ||
          t("agentChat.sessionOverview.activity.toolCall.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: Sparkles,
        iconClassName: "text-sky-600",
      };
    case "command_execution":
      return {
        id: item.id,
        title: "exec_command",
        summary:
          shortenText(item.command, 100) ||
          t("agentChat.sessionOverview.activity.command.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: ListChecks,
        iconClassName: "text-slate-600",
      };
    case "web_search":
      return {
        id: item.id,
        title: item.action?.trim() || "Web Search",
        summary:
          shortenText(item.query, 100) ||
          shortenText(item.output, 100) ||
          t("agentChat.sessionOverview.activity.webSearch.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: Search,
        iconClassName: "text-sky-600",
      };
    case "request_user_input":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.requestInput.title"),
        summary:
          shortenText(item.prompt, 100) ||
          shortenText(item.questions?.[0]?.question, 100) ||
          t("agentChat.sessionOverview.activity.requestInput.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: ShieldAlert,
        iconClassName: "text-amber-600",
      };
    case "approval_request":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.approval.title"),
        summary:
          shortenText(item.prompt, 100) ||
          shortenText(item.tool_name, 100) ||
          t("agentChat.sessionOverview.activity.approval.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: ShieldAlert,
        iconClassName: "text-amber-600",
      };
    case "file_artifact":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.fileArtifact.title"),
        summary:
          shortenText(extractFileNameFromPath(item.path) || item.path, 100) ||
          t("agentChat.sessionOverview.activity.fileArtifact.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: FileText,
        iconClassName: "text-emerald-600",
      };
    case "subagent_activity":
      return {
        id: item.id,
        title:
          item.title?.trim() ||
          t("agentChat.sessionOverview.activity.subagent.title"),
        summary:
          shortenText(item.summary, 100) ||
          shortenText(item.role, 100) ||
          shortenText(item.model, 100) ||
          t("agentChat.sessionOverview.activity.subagent.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: Bot,
        iconClassName: "text-sky-700",
      };
    case "warning":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.warning.title"),
        summary:
          shortenText(item.message, 100) ||
          t("agentChat.sessionOverview.activity.warning.summaryFallback"),
        timeLabel,
        statusLabel,
        tone: "default",
        icon: AlertTriangle,
        iconClassName: "text-amber-600",
      };
    case "error":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.error.title"),
        summary:
          shortenText(item.message, 100) ||
          t("agentChat.sessionOverview.activity.error.summaryFallback"),
        timeLabel,
        statusLabel,
        tone: "default",
        icon: AlertTriangle,
        iconClassName: "text-rose-600",
      };
    case "context_compaction":
      return {
        id: item.id,
        title:
          item.stage === "started"
            ? t("agentChat.sessionOverview.activity.compaction.started")
            : t("agentChat.sessionOverview.activity.compaction.completed"),
        summary:
          shortenText(item.detail, 100) ||
          shortenText(item.trigger, 100) ||
          t("agentChat.sessionOverview.activity.compaction.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: Clock3,
        iconClassName: "text-slate-500",
      };
    case "reasoning":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.reasoning.title"),
        summary:
          shortenText(item.summary?.join(" "), 100) ||
          shortenText(item.text, 100) ||
          t("agentChat.sessionOverview.activity.reasoning.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: Sparkles,
        iconClassName: "text-violet-600",
      };
    case "plan":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.plan.title"),
        summary:
          shortenText(item.text, 100) ||
          t("agentChat.sessionOverview.activity.plan.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: ListChecks,
        iconClassName: "text-slate-600",
      };
    case "turn_summary":
      return {
        id: item.id,
        title: t("agentChat.sessionOverview.activity.turnSummary.title"),
        summary:
          shortenText(item.text, 100) ||
          t("agentChat.sessionOverview.activity.turnSummary.summaryFallback"),
        timeLabel,
        statusLabel,
        tone,
        icon: ListChecks,
        iconClassName: "text-slate-600",
      };
    default:
      return null;
  }
}

export function CanvasSessionOverviewPanel({
  turns,
  threadItems,
  currentTurnId = null,
  pendingActions = [],
  queuedTurns = [],
  isSending = false,
  focusedItemId = null,
}: CanvasSessionOverviewPanelProps) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const sortedItems = sortThreadItems(threadItems).filter(
    (item) => item.type !== "user_message" && item.type !== "agent_message",
  );

  const currentTurn =
    turns.find((turn) => turn.id === currentTurnId) || turns.at(-1) || null;
  const turnStatus = resolveTurnStatusLabel(
    isSending ? "running" : currentTurn?.status,
    t,
  );
  const inProgressCount = sortedItems.filter(
    (item) => item.status === "in_progress",
  ).length;
  const recentActivity = sortedItems
    .map((item) => buildActivityView(item, t, locale))
    .filter((item): item is SessionActivityView => Boolean(item))
    .slice(-8)
    .reverse();
  const latestTurnPrompt =
    shortenText(currentTurn?.prompt_text, 160) ||
    t("agentChat.sessionOverview.latestPromptFallback");
  const latestTurnUpdatedAt = formatTimeLabel(
    currentTurn?.updated_at ||
      currentTurn?.completed_at ||
      currentTurn?.started_at,
    locale,
  );
  const focusedActivity =
    recentActivity.find((item) => item.id === focusedItemId) ||
    recentActivity[0] ||
    null;
  const summaryMetrics = useMemo(() => {
    const formattedInProgressCount = formatNumber(inProgressCount, { locale });
    const formattedTraceCount = formatNumber(sortedItems.length, { locale });
    const formattedPendingCount = formatNumber(pendingActions.length, {
      locale,
    });
    const formattedQueuedCount = formatNumber(queuedTurns.length, { locale });

    return {
      followUp:
        pendingActions.length > 0
          ? t("agentChat.sessionOverview.metrics.pending", {
              countLabel: formattedPendingCount,
            })
          : queuedTurns.length > 0
            ? t("agentChat.sessionOverview.metrics.queued", {
                countLabel: formattedQueuedCount,
              })
            : t("agentChat.sessionOverview.metrics.noFollowUp"),
      trace:
        inProgressCount > 0
          ? t("agentChat.sessionOverview.metrics.inProgress", {
              countLabel: formattedInProgressCount,
            })
          : t("agentChat.sessionOverview.metrics.traces", {
              countLabel: formattedTraceCount,
            }),
    };
  }, [
    inProgressCount,
    locale,
    pendingActions.length,
    queuedTurns.length,
    sortedItems.length,
    t,
  ]);

  return (
    <section
      data-testid="canvas-session-overview-panel"
      className="flex min-h-full flex-col gap-4"
    >
      <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-slate-950">
                {t("agentChat.sessionOverview.panel.title")}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  turnStatus.tone === "accent" &&
                    "border-sky-200 bg-sky-50 text-sky-700",
                  turnStatus.tone === "success" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  turnStatus.tone === "default" &&
                    "border-slate-200 bg-white text-slate-600",
                )}
              >
                {turnStatus.label}
              </Badge>
              {focusedActivity ? (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-slate-600"
                >
                  {t("agentChat.sessionOverview.panel.focusedBadge", {
                    title: focusedActivity.title,
                  })}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {t("agentChat.sessionOverview.panel.description")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {t("agentChat.sessionOverview.metrics.currentTurn", {
                  id:
                    currentTurn?.id ||
                    t("agentChat.sessionOverview.metrics.currentTurnMissing"),
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {summaryMetrics.trace}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {summaryMetrics.followUp}
              </span>
            </div>
          </div>

          <div className="grid min-w-[240px] gap-2 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-[11px] font-medium text-slate-500">
                {t("agentChat.sessionOverview.panel.updatedLabel")}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {latestTurnUpdatedAt ||
                  t("agentChat.sessionOverview.time.empty")}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">
                {t("agentChat.sessionOverview.panel.focusLabel")}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {focusedActivity?.title ||
                  t("agentChat.sessionOverview.panel.focusFallback")}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {focusedActivity?.summary || latestTurnPrompt}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.45fr),minmax(320px,0.9fr)]">
        <section className="rounded-[24px] border border-slate-200 bg-white">
          <div className="border-b border-slate-200/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">
              {t("agentChat.sessionOverview.timeline.title")}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              {t("agentChat.sessionOverview.timeline.description")}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {recentActivity.length > 0 ? (
              recentActivity.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 px-5 py-4 transition-colors",
                      focusedItemId === item.id && "bg-sky-50/80",
                    )}
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                      {item.tone === "accent" ? (
                        <Loader2
                          className={cn(
                            "h-4 w-4 animate-spin",
                            item.iconClassName,
                          )}
                        />
                      ) : (
                        <Icon className={cn("h-4 w-4", item.iconClassName)} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {item.title}
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            item.tone === "accent" && "bg-sky-50 text-sky-700",
                            item.tone === "success" &&
                              "bg-emerald-50 text-emerald-700",
                            item.tone === "default" &&
                              "bg-slate-100 text-slate-600",
                          )}
                        >
                          {item.statusLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">
                        {item.summary}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-400">
                      {item.timeLabel ||
                        t("agentChat.sessionOverview.time.empty")}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-6 text-sm leading-6 text-slate-500">
                {t("agentChat.sessionOverview.timeline.empty")}
              </div>
            )}
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          <section className="rounded-[24px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("agentChat.sessionOverview.pending.title")}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {t("agentChat.sessionOverview.pending.description")}
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              {pendingActions.length > 0 ? (
                pendingActions.slice(0, 4).map((action) => (
                  <div
                    key={action.requestId}
                    className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {action.actionType === "tool_confirmation"
                          ? t("agentChat.sessionOverview.pending.confirm")
                          : t("agentChat.sessionOverview.pending.input")}
                      </span>
                      <span className="text-[11px] text-amber-700/80">
                        {action.requestId}
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-amber-950">
                      {resolvePendingActionPreview(action)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                  {t("agentChat.sessionOverview.pending.empty")}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("agentChat.sessionOverview.queue.title")}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {t("agentChat.sessionOverview.queue.description")}
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              {queuedTurns.length > 0 ? (
                queuedTurns.slice(0, 4).map((item, index) => (
                  <div
                    key={item.queued_turn_id}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {t("agentChat.sessionOverview.queue.itemLabel", {
                          index: formatNumber(index + 1, { locale }),
                        })}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {item.image_count > 0
                          ? t("agentChat.sessionOverview.queue.imageCount", {
                              countLabel: formatNumber(item.image_count, {
                                locale,
                              }),
                            })
                          : t("agentChat.sessionOverview.queue.textInput")}
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-700">
                      {shortenText(
                        item.message_preview || item.message_text,
                        120,
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                  {t("agentChat.sessionOverview.queue.empty")}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
