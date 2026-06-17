import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
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
  clearAgentRuntimeObjective,
  continueAgentRuntimeObjective,
  getAgentRuntimeObjective,
  setAgentRuntimeObjective,
  updateAgentRuntimeObjectiveStatus,
  type ManagedObjective,
  type ManagedObjectiveStatus,
} from "@/lib/api/agentRuntime";
import { cn } from "@/lib/utils";
import {
  MANAGED_OBJECTIVE_COPY as COPY,
  MANAGED_OBJECTIVE_STATUS_LABEL_KEYS,
  type ManagedObjectiveAction,
} from "../../managedObjectivePanelModel";

interface InputbarObjectiveInlinePanelProps {
  runtimeBusy?: boolean;
  sessionId: string;
  workspaceId?: string | null;
  onObjectiveLoaded?: (objective: ManagedObjective | null) => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function formatElapsed(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) {
    return null;
  }
  const updatedTime = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedTime)) {
    return null;
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedTime) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  return `${Math.floor(elapsedHours / 24)}d`;
}

function readStatusTone(status: ManagedObjectiveStatus): string {
  switch (status) {
    case "blocked":
    case "failed":
      return "text-rose-700";
    case "needs_input":
    case "budget_limited":
      return "text-amber-700";
    case "paused":
      return "text-slate-600";
    default:
      return "text-slate-900";
  }
}

export function InputbarObjectiveInlinePanel({
  runtimeBusy,
  sessionId,
  workspaceId,
  onObjectiveLoaded,
}: InputbarObjectiveInlinePanelProps) {
  const { t } = useTranslation("agent");
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(t(key as never, options as never)),
    [t],
  );
  const [objective, setObjective] = useState<ManagedObjective | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [objectiveText, setObjectiveText] = useState("");
  const [activeAction, setActiveAction] =
    useState<ManagedObjectiveAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedSessionId = sessionId.trim();
  const trimmedObjectiveText = objectiveText.trim();
  const statusLabel = objective
    ? text(
        objective.status === "blocked"
          ? COPY.inlineStatusBlocked
          : objective.status === "paused"
            ? COPY.inlineStatusPaused
            : MANAGED_OBJECTIVE_STATUS_LABEL_KEYS[objective.status],
      )
    : null;
  const elapsedLabel = useMemo(
    () => formatElapsed(objective?.updated_at),
    [objective?.updated_at],
  );
  const busy = activeAction !== null;

  const refreshObjective = useCallback(async () => {
    setLoading(true);
    try {
      const nextObjective = await getAgentRuntimeObjective(resolvedSessionId);
      setObjective(nextObjective);
      onObjectiveLoaded?.(nextObjective);
    } catch (error) {
      console.warn("[InputbarObjectiveInlinePanel] 加载追求目标失败:", error);
      setObjective(null);
      onObjectiveLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [onObjectiveLoaded, resolvedSessionId]);

  useEffect(() => {
    if (!resolvedSessionId) {
      setLoading(false);
      return;
    }
    void refreshObjective();
  }, [refreshObjective, resolvedSessionId]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }
    setObjectiveText(objective?.objective_text ?? "");
    setErrorMessage(null);
  }, [dialogOpen, objective]);

  const runAction = useCallback(
    async (
      action: ManagedObjectiveAction,
      callback: () => Promise<ManagedObjective | null>,
      successKey: string,
    ) => {
      if (!resolvedSessionId || activeAction) {
        return false;
      }
      setActiveAction(action);
      setErrorMessage(null);
      try {
        const nextObjective = await callback();
        setObjective(nextObjective);
        onObjectiveLoaded?.(nextObjective);
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
    [activeAction, onObjectiveLoaded, resolvedSessionId, text],
  );

  const handleSave = useCallback(async () => {
    if (!trimmedObjectiveText) {
      setErrorMessage(text(COPY.validationObjectiveRequired));
      return;
    }
    const saved = await runAction(
      "set",
      () =>
        setAgentRuntimeObjective({
          sessionId: resolvedSessionId,
          workspaceId,
          objectiveText: trimmedObjectiveText,
          successCriteria: objective?.success_criteria ?? [],
        }),
      COPY.toastSaved,
    );
    if (saved) {
      setDialogOpen(false);
    }
  }, [
    resolvedSessionId,
    objective?.success_criteria,
    runAction,
    text,
    trimmedObjectiveText,
    workspaceId,
  ]);

  const handleStatusUpdate = useCallback(
    async (
      status: ManagedObjectiveStatus,
      action: ManagedObjectiveAction,
      successKey: string,
    ) => {
      await runAction(
        action,
        () =>
          updateAgentRuntimeObjectiveStatus({
            sessionId: resolvedSessionId,
            status,
          }),
        successKey,
      );
    },
    [resolvedSessionId, runAction],
  );

  const handleClear = useCallback(async () => {
    await runAction(
      "clear",
      async () => {
        await clearAgentRuntimeObjective({ sessionId: resolvedSessionId });
        return null;
      },
      COPY.toastCleared,
    );
  }, [resolvedSessionId, runAction]);

  const handleContinue = useCallback(async () => {
    await runAction(
      "continue",
      async () => {
        const result = await continueAgentRuntimeObjective({
          sessionId: resolvedSessionId,
        });
        return result.objective;
      },
      COPY.toastContinued,
    );
  }, [resolvedSessionId, runAction]);

  if (!resolvedSessionId || (loading && !objective)) {
    return null;
  }

  return (
    <>
      {objective ? (
        <div
          className="flex min-h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm shadow-slate-950/5"
          data-testid="inputbar-objective-inline-panel"
          data-session-id={resolvedSessionId}
          data-workspace-id={workspaceId ?? ""}
          aria-busy={loading || busy}
        >
          <Target className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 font-semibold",
                readStatusTone(objective.status),
              )}
              data-testid="inputbar-objective-inline-status"
            >
              {statusLabel}
            </span>
            <span
              className="truncate text-slate-500"
              data-testid="inputbar-objective-inline-text"
              title={objective.objective_text}
            >
              {objective.objective_text}
            </span>
            {elapsedLabel ? (
              <span
                className="shrink-0 text-slate-400"
                data-testid="inputbar-objective-inline-elapsed"
              >
                · {elapsedLabel}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={text(COPY.inlineEdit)}
              aria-label={text(COPY.inlineEdit)}
              data-testid="inputbar-objective-inline-edit"
              onClick={() => setDialogOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {objective.status === "paused" ? (
              <button
                type="button"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={text(COPY.actionResume)}
                aria-label={text(COPY.actionResume)}
                disabled={busy}
                data-testid="inputbar-objective-inline-resume"
                onClick={() =>
                  void handleStatusUpdate(
                    "active",
                    "resume",
                    COPY.toastResumed,
                  )
                }
              >
                {activeAction === "resume" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={text(COPY.actionContinue)}
                aria-label={text(COPY.actionContinue)}
                disabled={busy || runtimeBusy}
                data-testid="inputbar-objective-inline-continue"
                onClick={() => void handleContinue()}
              >
                {activeAction === "continue" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
              title={text(COPY.actionClear)}
              aria-label={text(COPY.actionClear)}
              disabled={busy}
              data-testid="inputbar-objective-inline-clear"
              onClick={() => void handleClear()}
            >
              {activeAction === "clear" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="max-w-md"
      >
        <ModalBody className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-950">
              {text(objective ? COPY.inlineDialogTitleEdit : COPY.title)}
            </h2>
          </div>
          <Textarea
            value={objectiveText}
            onChange={(event) => setObjectiveText(event.target.value)}
            placeholder={text(COPY.formObjectivePlaceholder)}
            aria-label={text(COPY.formObjectiveLabel)}
            className="min-h-[168px] rounded-xl border-sky-300 bg-white text-sm"
            data-testid="inputbar-objective-dialog-objective-input"
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
            className="h-8 rounded-xl px-4"
            onClick={() => setDialogOpen(false)}
          >
            {text(COPY.inlineCancel)}
          </Button>
          <Button
            type="button"
            className="h-8 rounded-xl px-4"
            disabled={!trimmedObjectiveText || busy}
            data-testid="inputbar-objective-dialog-save"
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
