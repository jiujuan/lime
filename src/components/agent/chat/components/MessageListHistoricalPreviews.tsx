import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentThreadItem } from "../types";
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
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
        {content}
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
    className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800"
  >
    {content}
  </div>
);

export const HistoricalTimelinePreview: React.FC<{
  items: AgentThreadItem[];
  placement: "leading" | "trailing" | "default";
  detailsDeferred?: boolean;
  onExpand: () => void;
}> = ({ items, placement, detailsDeferred = false, onExpand }) => {
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
          countLabel: formatHistoricalContentLength(
            summary.thinkingStepsCount,
          ),
        })
      : null,
    summary.artifactStepsCount > 0
      ? t("agentChat.messageList.historicalTimeline.artifactSteps", {
          countLabel: formatHistoricalContentLength(
            summary.artifactStepsCount,
          ),
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

  return (
    <button
      type="button"
      data-testid={`message-list-historical-timeline-preview:${placement}`}
      className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-left text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100/80"
      onClick={onExpand}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-800">
          {t("agentChat.messageList.historicalTimeline.title")}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {metaText}
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
        {t("agentChat.messageList.historicalTimeline.expand")}
      </span>
    </button>
  );
};
