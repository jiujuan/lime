import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { AgentThreadItem } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  formatHistoricalContentLength,
  summarizeHistoricalTimelineItems,
} from "./messageListHistoricalPreviewText";

interface HistoricalAssistantMessagePreviewProps {
  content: string;
  contentLength: number;
  variant: "compact" | "long";
  onExpand: () => void;
}

export function HistoricalAssistantMessagePreview({
  content,
  contentLength,
  variant,
  onExpand,
}: HistoricalAssistantMessagePreviewProps) {
  const { t } = useTranslation("agent");
  const isLong = variant === "long";
  const noticeKey = isLong
    ? "agentChat.messageList.historicalAssistantPreview.longNotice"
    : "agentChat.messageList.historicalAssistantPreview.compactNotice";

  return (
    <div
      data-testid={
        isLong
          ? "message-list-long-history-preview"
          : "message-list-historical-assistant-preview"
      }
      data-preview-variant={variant}
      className="space-y-3"
    >
      <div className="break-words text-[15px] leading-7 text-slate-800">
        <MarkdownRenderer
          content={content}
          renderMode="light"
          renderA2UIInline={false}
          readOnlyA2UI={true}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
        <span>
          {t(noticeKey, {
            countLabel: formatHistoricalContentLength(contentLength),
          })}
        </span>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          onClick={onExpand}
        >
          {t("agentChat.messageList.historicalAssistantPreview.expandFull")}
        </button>
      </div>
    </div>
  );
}

export const HistoricalMarkdownHydrationPreview: React.FC<{
  content: string;
}> = ({ content }) => (
  <div
    data-testid="message-list-historical-markdown-preview"
    className="break-words text-[15px] leading-7 text-slate-800"
  >
    <MarkdownRenderer
      content={content}
      renderMode="light"
      renderA2UIInline={false}
      readOnlyA2UI={true}
    />
  </div>
);

export const HistoricalTimelinePreview: React.FC<{
  items: AgentThreadItem[];
  placement: "leading" | "trailing" | "default";
  detailsDeferred?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  onExpand: () => void;
}> = ({
  items,
  placement,
  detailsDeferred = false,
  startedAt,
  completedAt,
  onExpand,
}) => {
  const { t } = useTranslation("agent");
  const summary = useMemo(
    () => summarizeHistoricalTimelineItems(items),
    [items],
  );

  if (summary.stepsCount <= 0 && !detailsDeferred) {
    return null;
  }
  const metaParts = [
    summary.toolStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.toolSteps", {
          countLabel: formatHistoricalContentLength(summary.toolStepsCount),
        })
      : null,
    summary.thinkingStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.thinkingSteps", {
          countLabel: formatHistoricalContentLength(summary.thinkingStepsCount),
        })
      : null,
    summary.artifactStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.artifactSteps", {
          countLabel: formatHistoricalContentLength(summary.artifactStepsCount),
        })
      : null,
  ].filter((part): part is string => Boolean(part));
  const summaryMetaText =
    metaParts.length > 0
      ? metaParts.join(t("agentChat.messageList.historicalTimeline.separator"))
      : t("agentChat.messageList.historicalTimeline.foldedMeta");
  const metaText =
    summary.stepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.meta", {
          stepCountLabel: formatHistoricalContentLength(summary.stepsCount),
          meta: summaryMetaText,
        })
      : t("agentChat.messageList.historicalTimeline.deferredMeta");
  const startedAtMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const completedAtMs = completedAt
    ? new Date(completedAt).getTime()
    : Number.NaN;
  const durationMs =
    Number.isFinite(startedAtMs) &&
    Number.isFinite(completedAtMs) &&
    completedAtMs >= startedAtMs
      ? completedAtMs - startedAtMs
      : null;
  const durationLabel = (() => {
    if (durationMs === null) {
      return null;
    }
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  })();
  const title = durationLabel
    ? t("agentChat.messageList.historicalTimeline.titleWithDuration", {
        duration: durationLabel,
      })
    : t("agentChat.messageList.historicalTimeline.title");

  return (
    <button
      type="button"
      data-testid={`message-list-historical-timeline-preview:${placement}`}
      className="group flex w-full items-center gap-1.5 border-b border-slate-200 py-2 text-left text-sm text-slate-500 transition-colors hover:text-slate-800"
      onClick={onExpand}
      aria-label={`${title}. ${metaText}`}
    >
      <span className="font-medium">{title}</span>
      <ChevronRight
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
};
