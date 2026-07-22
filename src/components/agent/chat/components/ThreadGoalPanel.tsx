import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Clock3,
  Coins,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Modal, ModalBody, ModalFooter } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  clearThreadGoal,
  setThreadGoal,
  setThreadGoalStatus,
} from "@/lib/api/agentRuntime/threadGoalClient";
import { cn } from "@/lib/utils";
import type {
  ThreadGoal,
  ThreadGoalStatus,
} from "@limecloud/app-server-client";
import {
  THREAD_GOAL_COPY as COPY,
  THREAD_GOAL_STATUS_LABEL_KEYS,
} from "./threadGoalCopy";

type ThreadGoalAction = "clear" | "complete" | "pause" | "resume" | "set";

type ThreadGoalText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface ThreadGoalPanelProps {
  className?: string;
  runtimeBusy?: boolean;
  threadGoal?: ThreadGoal | null;
  threadGoalError?: unknown;
  threadGoalLoading?: boolean;
  threadId?: string | null;
  variant?: "detail" | "inline";
  onGoalChanged?: (goal: ThreadGoal | null) => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function formatGoalDuration(seconds: number, text: ThreadGoalText): string {
  const normalized = Math.max(0, Math.floor(seconds));
  if (normalized < 60) {
    return text(COPY.wallTimeSeconds, { seconds: normalized });
  }
  const minutes = Math.floor(normalized / 60);
  const remainingSeconds = normalized % 60;
  if (remainingSeconds > 0) {
    return text(COPY.wallTimeMinutesSeconds, {
      minutes,
      seconds: remainingSeconds,
    });
  }
  return text(COPY.wallTimeMinutes, { minutes });
}

function formatGoalTokens(
  count: number,
  locale: string,
  text: ThreadGoalText,
): string {
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(count);
  return text(COPY.tokenTotal, { count: formatted });
}

function formatGoalTimestamp(timestamp: number, locale: string): string {
  const date = new Date(timestamp * 1_000);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readStatusTone(status: ThreadGoalStatus): string {
  switch (status) {
    case "blocked":
      return "text-rose-700";
    case "budgetLimited":
    case "usageLimited":
      return "text-amber-700";
    case "paused":
      return "text-slate-600";
    case "complete":
      return "text-emerald-700";
    default:
      return "text-slate-900";
  }
}

function editedGoalStatus(status: ThreadGoalStatus): ThreadGoalStatus {
  return status === "budgetLimited" || status === "complete"
    ? "active"
    : status;
}

function canResumeGoal(status: ThreadGoalStatus): boolean {
  return (
    status === "paused" || status === "blocked" || status === "usageLimited"
  );
}

export function ThreadGoalPanel({
  className,
  runtimeBusy = false,
  threadGoal = null,
  threadGoalError = null,
  threadGoalLoading = false,
  threadId,
  variant = "detail",
  onGoalChanged,
}: ThreadGoalPanelProps) {
  const { t, i18n } = useTranslation("agent");
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(t(key as never, options as never)),
    [t],
  );
  const resolvedThreadId = threadId?.trim() || "";
  const identityMismatch = Boolean(
    threadGoal && threadGoal.threadId !== resolvedThreadId,
  );
  const canonicalGoal =
    threadGoal?.threadId === resolvedThreadId ? threadGoal : null;
  const [localGoal, setLocalGoal] = useState<ThreadGoal | null>(canonicalGoal);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [objectiveText, setObjectiveText] = useState("");
  const [activeAction, setActiveAction] = useState<ThreadGoalAction | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalGoal(canonicalGoal);
  }, [canonicalGoal, resolvedThreadId]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }
    setObjectiveText(localGoal?.objective ?? "");
    setErrorMessage(null);
  }, [dialogOpen, localGoal]);

  const trimmedObjectiveText = objectiveText.trim();
  const statusLabel = localGoal
    ? text(THREAD_GOAL_STATUS_LABEL_KEYS[localGoal.status])
    : null;
  const locale = i18n.resolvedLanguage || i18n.language || "en-US";
  const goalMetrics = useMemo(() => {
    if (!localGoal) {
      return null;
    }
    const tokensUsed = formatGoalTokens(localGoal.tokensUsed, locale, text);
    return {
      tokens:
        localGoal.tokenBudget === undefined || localGoal.tokenBudget === null
          ? tokensUsed
          : `${tokensUsed} / ${formatGoalTokens(localGoal.tokenBudget, locale, text)}`,
      wallTime: formatGoalDuration(localGoal.timeUsedSeconds, text),
      updatedAt: text(COPY.updatedAt, {
        value: formatGoalTimestamp(localGoal.updatedAt, locale),
      }),
    };
  }, [localGoal, locale, text]);
  const busy = activeAction !== null;
  const loadErrorMessage = threadGoalError
    ? getErrorMessage(threadGoalError, text(COPY.toastFailed))
    : null;

  const runAction = useCallback(
    async (
      action: ThreadGoalAction,
      callback: () => Promise<ThreadGoal | null>,
      successKey: string,
    ): Promise<boolean> => {
      if (!resolvedThreadId || activeAction) {
        return false;
      }
      setActiveAction(action);
      setErrorMessage(null);
      try {
        const nextGoal = await callback();
        setLocalGoal(nextGoal);
        onGoalChanged?.(nextGoal);
        toast.success(text(successKey));
        return true;
      } catch (error) {
        const message = getErrorMessage(error, text(COPY.toastFailed));
        setErrorMessage(message);
        toast.error(message);
        return false;
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, onGoalChanged, resolvedThreadId, text],
  );

  const handleSave = useCallback(async () => {
    if (!trimmedObjectiveText) {
      setErrorMessage(text(COPY.validationObjectiveRequired));
      return;
    }
    const saved = await runAction(
      "set",
      () =>
        setThreadGoal({
          threadId: resolvedThreadId,
          objective: trimmedObjectiveText,
          status: localGoal ? editedGoalStatus(localGoal.status) : "active",
        }),
      COPY.toastSaved,
    );
    if (saved) {
      setDialogOpen(false);
    }
  }, [localGoal, resolvedThreadId, runAction, text, trimmedObjectiveText]);

  const handleStatusUpdate = useCallback(
    async (
      status: ThreadGoalStatus,
      action: Extract<ThreadGoalAction, "pause" | "resume">,
      successKey: string,
    ) => {
      await runAction(
        action,
        () => setThreadGoalStatus(resolvedThreadId, status),
        successKey,
      );
    },
    [resolvedThreadId, runAction],
  );

  const handleClear = useCallback(async () => {
    await runAction(
      "clear",
      async () => {
        await clearThreadGoal(resolvedThreadId);
        return null;
      },
      COPY.toastCleared,
    );
  }, [resolvedThreadId, runAction]);

  const handleComplete = useCallback(async () => {
    await runAction(
      "complete",
      () => setThreadGoalStatus(resolvedThreadId, "complete"),
      COPY.toastCompleted,
    );
  }, [resolvedThreadId, runAction]);

  if (!resolvedThreadId || identityMismatch) {
    return null;
  }

  if (variant === "inline" && !localGoal) {
    return null;
  }

  if (!localGoal && threadGoalLoading) {
    return (
      <div
        className={cn(
          "flex min-h-20 items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500",
          className,
        )}
        data-testid="thread-goal-loading"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {text(COPY.loading)}
      </div>
    );
  }

  if (!localGoal && loadErrorMessage) {
    return (
      <div
        className={cn(
          "rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800",
          className,
        )}
        data-testid="thread-goal-load-error"
      >
        {loadErrorMessage}
      </div>
    );
  }

  if (!localGoal) {
    return (
      <div
        className={cn(
          "rounded-lg border border-slate-200 bg-white p-3",
          className,
        )}
        data-testid="thread-goal-empty"
        data-thread-id={resolvedThreadId}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Target className="h-4 w-4 text-slate-500" />
          {text(COPY.title)}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {text(COPY.descriptionEmpty)}
        </p>
        <Textarea
          value={objectiveText}
          onChange={(event) => setObjectiveText(event.target.value)}
          placeholder={text(COPY.formObjectivePlaceholder)}
          aria-label={text(COPY.formObjectiveLabel)}
          className="mt-3 min-h-[88px] rounded-lg border-slate-300 bg-white text-sm"
          data-testid="thread-goal-create-input"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {errorMessage ? (
            <span className="text-xs text-rose-700">{errorMessage}</span>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg px-3"
            disabled={!trimmedObjectiveText || busy}
            data-testid="thread-goal-create"
            onClick={() => void handleSave()}
          >
            {activeAction === "set" ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Target className="mr-2 h-3.5 w-3.5" />
            )}
            {text(COPY.inlineSave)}
          </Button>
        </div>
      </div>
    );
  }

  const actionButtons = (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title={text(COPY.inlineEdit)}
        aria-label={text(COPY.inlineEdit)}
        disabled={busy}
        data-testid="thread-goal-edit"
        onClick={() => setDialogOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {localGoal.status === "active" ? (
        <button
          type="button"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title={text(COPY.actionPause)}
          aria-label={text(COPY.actionPause)}
          disabled={busy}
          data-testid="thread-goal-pause"
          onClick={() =>
            void handleStatusUpdate("paused", "pause", COPY.toastPaused)
          }
        >
          {activeAction === "pause" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PauseCircle className="h-3.5 w-3.5" />
          )}
        </button>
      ) : canResumeGoal(localGoal.status) ? (
        <button
          type="button"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title={text(COPY.actionResume)}
          aria-label={text(COPY.actionResume)}
          disabled={busy || runtimeBusy}
          data-testid="thread-goal-resume"
          onClick={() =>
            void handleStatusUpdate("active", "resume", COPY.toastResumed)
          }
        >
          {activeAction === "resume" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
      {localGoal.status !== "complete" ? (
        <button
          type="button"
          className="rounded-full p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
          title={text(COPY.actionComplete)}
          aria-label={text(COPY.actionComplete)}
          disabled={busy || runtimeBusy}
          data-testid="thread-goal-complete"
          onClick={() => void handleComplete()}
        >
          {activeAction === "complete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
        title={text(COPY.actionClear)}
        aria-label={text(COPY.actionClear)}
        disabled={busy}
        data-testid="thread-goal-clear"
        onClick={() => void handleClear()}
      >
        {activeAction === "clear" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );

  return (
    <>
      {variant === "inline" ? (
        <div
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm shadow-slate-950/5",
            className,
          )}
          data-testid="thread-goal-inline-panel"
          data-thread-id={resolvedThreadId}
          aria-busy={threadGoalLoading || busy}
        >
          <Target className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 font-semibold",
                readStatusTone(localGoal.status),
              )}
            >
              {statusLabel}
            </span>
            <span
              className="truncate text-slate-500"
              title={localGoal.objective}
            >
              {localGoal.objective}
            </span>
            {goalMetrics ? (
              <span className="shrink-0 text-slate-400">
                · {goalMetrics.tokens}
              </span>
            ) : null}
          </div>
          {actionButtons}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border border-slate-200 bg-white p-3",
            className,
          )}
          data-testid="thread-goal-panel"
          data-thread-id={resolvedThreadId}
          aria-busy={threadGoalLoading || busy}
        >
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-950">
                  {text(COPY.title)}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    readStatusTone(localGoal.status),
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {localGoal.objective}
              </p>
              {goalMetrics ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span
                    className="inline-flex items-center gap-1"
                    data-testid="thread-goal-tokens"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {goalMetrics.tokens}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    data-testid="thread-goal-wall-time"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    {goalMetrics.wallTime}
                  </span>
                  <span data-testid="thread-goal-updated-at">
                    {goalMetrics.updatedAt}
                  </span>
                </div>
              ) : null}
            </div>
            {actionButtons}
          </div>
          {errorMessage ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              {errorMessage}
            </div>
          ) : null}
          {loadErrorMessage ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              {loadErrorMessage}
            </div>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="max-w-md"
      >
        <ModalBody className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-950">
              {text(COPY.inlineDialogTitleEdit)}
            </h2>
          </div>
          <Textarea
            value={objectiveText}
            onChange={(event) => setObjectiveText(event.target.value)}
            placeholder={text(COPY.formObjectivePlaceholder)}
            aria-label={text(COPY.formObjectiveLabel)}
            className="min-h-[168px] rounded-lg border-sky-300 bg-white text-sm"
            data-testid="thread-goal-objective-input"
          />
          {errorMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              {errorMessage}
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter className="gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="secondary"
            className="h-8 rounded-lg px-4"
            onClick={() => setDialogOpen(false)}
          >
            {text(COPY.inlineCancel)}
          </Button>
          <Button
            type="button"
            className="h-8 rounded-lg px-4"
            disabled={!trimmedObjectiveText || busy}
            data-testid="thread-goal-save"
            onClick={() => void handleSave()}
          >
            {activeAction === "set" ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {text(COPY.inlineSave)}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
