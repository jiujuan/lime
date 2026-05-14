import React from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { LIME_BRAND_LOGO_SRC, LIME_BRAND_NAME } from "@/lib/branding";

function formatContentLength(value: number): string {
  return formatNumber(value);
}

interface PersistedHistoryWindowProps {
  loadedMessages: number;
  totalMessages: number;
  isLoadingFull?: boolean;
  error?: string | null;
  onLoadFullHistory?: () => void | Promise<void>;
}

export function PersistedHistoryWindow({
  loadedMessages,
  totalMessages,
  isLoadingFull = false,
  error = null,
  onLoadFullHistory,
}: PersistedHistoryWindowProps) {
  const { t } = useTranslation("agent");

  return (
    <div
      data-testid="message-list-persisted-history-window"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600"
    >
      <div className="min-w-0 flex-1">
        {t("agentChat.messageList.history.persistedSummary", {
          loaded: formatContentLength(loadedMessages),
          total: formatContentLength(totalMessages),
        })}
        {error ? <span className="ml-2 text-red-600">{error}</span> : null}
      </div>
      <button
        type="button"
        data-testid="message-list-load-full-history"
        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoadingFull || !onLoadFullHistory}
        onClick={() => {
          void onLoadFullHistory?.();
        }}
      >
        {isLoadingFull
          ? t("agentChat.messageList.history.loadingMore")
          : t("agentChat.messageList.history.loadMore")}
      </button>
    </div>
  );
}

interface HistoryWindowProps {
  hiddenHistoryCount: number;
  isRestoredHistoryWindow: boolean;
  renderedMessagesCount: number;
  onExpandAllHistory: () => void;
}

export function HistoryWindow({
  hiddenHistoryCount,
  isRestoredHistoryWindow,
  renderedMessagesCount,
  onExpandAllHistory,
}: HistoryWindowProps) {
  const { t } = useTranslation("agent");

  return (
    <div
      data-testid="message-list-history-window"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600"
    >
      <div className="min-w-0 flex-1">
        {t(
          isRestoredHistoryWindow
            ? "agentChat.messageList.history.windowSummaryRestored"
            : "agentChat.messageList.history.windowSummaryDeferred",
          {
            loaded: formatContentLength(renderedMessagesCount),
            hidden: formatContentLength(hiddenHistoryCount),
          },
        )}
      </div>
      <button
        type="button"
        data-testid="message-list-expand-history"
        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        onClick={onExpandAllHistory}
      >
        {t("agentChat.messageList.history.expandEarlier")}
      </button>
    </div>
  );
}

export function RestoringSessionEmptyState() {
  const { t } = useTranslation("agent");

  return (
    <div
      className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground"
      data-testid="message-list-restoring-session"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/80 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <div className="space-y-1 text-center">
        <p className="text-lg font-medium text-foreground">
          {t("agentChat.messageList.restoring.title")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("agentChat.messageList.restoring.description")}
        </p>
      </div>
    </div>
  );
}

export function TaskCenterEmptyState() {
  const { t } = useTranslation("agent");

  return (
    <div className="flex min-h-[24rem] items-center justify-center py-8">
      <section
        data-testid="message-list-empty-task-center"
        className="w-full max-w-[760px] rounded-[30px] border border-slate-200/80 bg-white px-6 py-7 text-left shadow-sm shadow-slate-950/5 md:px-8 md:py-8"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-slate-200/80 bg-slate-50/80">
            <img
              src={LIME_BRAND_LOGO_SRC}
              alt={LIME_BRAND_NAME}
              className="h-7 w-7 opacity-80"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {t("agentChat.messageList.taskCenterEmpty.badge")}
            </span>

            <div className="mt-4 space-y-2">
              <h2 className="text-[32px] font-semibold tracking-tight text-slate-900 md:text-[36px]">
                {t("agentChat.messageList.taskCenterEmpty.title")}
              </h2>
              <p className="max-w-[48rem] text-[15px] leading-7 text-slate-600">
                {t("agentChat.messageList.taskCenterEmpty.description")}
              </p>
              <p className="text-sm leading-7 text-slate-500">
                {t("agentChat.messageList.taskCenterEmpty.helper")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
            {t("agentChat.messageList.taskCenterEmpty.chip.pending")}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
            {t("agentChat.messageList.taskCenterEmpty.chip.organized")}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-500">
            {t("agentChat.messageList.taskCenterEmpty.chip.restore")}
          </span>
        </div>
      </section>
    </div>
  );
}

export function DefaultConversationEmptyState() {
  const { t } = useTranslation("agent");

  return (
    <div className="flex h-64 flex-col items-center justify-center text-muted-foreground opacity-50">
      <img
        src={LIME_BRAND_LOGO_SRC}
        alt={LIME_BRAND_NAME}
        className="mb-4 h-12 w-12 opacity-20"
      />
      <p className="text-lg font-medium">
        {t("agentChat.messageList.empty.defaultTitle")}
      </p>
    </div>
  );
}
