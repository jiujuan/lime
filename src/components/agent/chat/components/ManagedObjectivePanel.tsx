import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  auditAgentRuntimeObjective,
  clearAgentRuntimeObjective,
  continueAgentRuntimeObjective,
  setAgentRuntimeObjective,
  updateAgentRuntimeObjectiveStatus,
  type ManagedObjective,
  type ManagedObjectiveStatus,
} from "@/lib/api/agentRuntime";
import { cn } from "@/lib/utils";
import { ManagedObjectiveCurrentView } from "./ManagedObjectiveCurrentView";
import { ManagedObjectiveEmptyForm } from "./ManagedObjectiveEmptyForm";
import {
  MANAGED_OBJECTIVE_COPY as COPY,
  MANAGED_OBJECTIVE_STATUS_LABEL_KEYS,
  MANAGED_OBJECTIVE_STATUS_TONE,
  splitManagedObjectiveSuccessCriteria,
  type ManagedObjectiveAction,
} from "./managedObjectivePanelModel";

interface ManagedObjectivePanelProps {
  sessionId?: string | null;
  workspaceId?: string | null;
  objective?: ManagedObjective | null;
  runtimeBusy?: boolean;
  onObjectiveChanged?: () => void | Promise<void>;
  className?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export const ManagedObjectivePanel: React.FC<ManagedObjectivePanelProps> = ({
  sessionId,
  workspaceId = null,
  objective = null,
  runtimeBusy = false,
  onObjectiveChanged,
  className,
}) => {
  const { t, i18n } = useTranslation("agent");
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(t(key as never, options as never)),
    [t],
  );
  const [localObjective, setLocalObjective] = useState<ManagedObjective | null>(
    objective,
  );
  const [objectiveText, setObjectiveText] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [activeAction, setActiveAction] =
    useState<ManagedObjectiveAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalObjective(objective ?? null);
  }, [objective]);

  const resolvedSessionId = sessionId?.trim() || "";
  const trimmedObjectiveText = objectiveText.trim();
  const successCriteria = useMemo(
    () => splitManagedObjectiveSuccessCriteria(criteriaText),
    [criteriaText],
  );
  const objectiveUpdatedLabel = useMemo(() => {
    if (!localObjective?.updated_at) {
      return null;
    }
    const date = new Date(localObjective.updated_at);
    if (Number.isNaN(date.getTime())) {
      return localObjective.updated_at;
    }
    return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }, [i18n.language, i18n.resolvedLanguage, localObjective?.updated_at]);

  const statusLabel = localObjective
    ? text(MANAGED_OBJECTIVE_STATUS_LABEL_KEYS[localObjective.status])
    : null;
  const canContinue =
    Boolean(localObjective) &&
    localObjective?.status === "active" &&
    !runtimeBusy;
  const canAudit =
    Boolean(localObjective) &&
    !runtimeBusy &&
    localObjective?.status !== "paused" &&
    localObjective?.status !== "completed" &&
    localObjective?.status !== "failed";
  const busy = activeAction !== null;

  const refreshAfterChange = useCallback(
    async (nextObjective: ManagedObjective | null) => {
      setLocalObjective(nextObjective);
      await onObjectiveChanged?.();
    },
    [onObjectiveChanged],
  );

  const runAction = useCallback(
    async (
      action: ManagedObjectiveAction,
      callback: () => Promise<ManagedObjective | null>,
      successKey: string,
    ): Promise<boolean> => {
      if (!resolvedSessionId || activeAction) {
        return false;
      }
      setActiveAction(action);
      setErrorMessage(null);
      try {
        const nextObjective = await callback();
        await refreshAfterChange(nextObjective);
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
    [activeAction, refreshAfterChange, resolvedSessionId, text],
  );

  const handleSetObjective = useCallback(async () => {
    if (!trimmedObjectiveText) {
      setErrorMessage(text(COPY.validationObjectiveRequired));
      return;
    }
    const saved = await runAction(
      "set",
      async () =>
        setAgentRuntimeObjective({
          sessionId: resolvedSessionId,
          workspaceId,
          objectiveText: trimmedObjectiveText,
          successCriteria,
        }),
      COPY.toastSaved,
    );
    if (saved) {
      setObjectiveText("");
      setCriteriaText("");
    }
  }, [
    resolvedSessionId,
    runAction,
    successCriteria,
    text,
    trimmedObjectiveText,
    workspaceId,
  ]);

  const handleUpdateStatus = useCallback(
    async (
      status: ManagedObjectiveStatus,
      action: ManagedObjectiveAction,
      successKey: string,
    ) => {
      await runAction(
        action,
        async () =>
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

  const handleAudit = useCallback(async () => {
    await runAction(
      "audit",
      async () => auditAgentRuntimeObjective({ sessionId: resolvedSessionId }),
      COPY.toastCompleted,
    );
  }, [resolvedSessionId, runAction]);

  const handlePause = useCallback(async () => {
    await handleUpdateStatus("paused", "pause", COPY.toastPaused);
  }, [handleUpdateStatus]);

  const handleResume = useCallback(async () => {
    await handleUpdateStatus("active", "resume", COPY.toastResumed);
  }, [handleUpdateStatus]);

  if (!resolvedSessionId) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3",
        className,
      )}
      data-testid="managed-objective-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-950">
            <Target className="h-4 w-4" />
            <span>{text(COPY.title)}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {text(
              localObjective ? COPY.descriptionActive : COPY.descriptionEmpty,
            )}
          </p>
        </div>
        {localObjective && statusLabel ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 bg-white",
              MANAGED_OBJECTIVE_STATUS_TONE[localObjective.status],
            )}
          >
            {statusLabel}
          </Badge>
        ) : null}
      </div>

      {localObjective ? (
        <ManagedObjectiveCurrentView
          activeAction={activeAction}
          busy={busy}
          canAudit={canAudit}
          canContinue={canContinue}
          objective={localObjective}
          objectiveUpdatedLabel={objectiveUpdatedLabel}
          runtimeBusy={runtimeBusy}
          text={text}
          onAudit={handleAudit}
          onClear={handleClear}
          onContinue={handleContinue}
          onPause={handlePause}
          onResume={handleResume}
        />
      ) : (
        <ManagedObjectiveEmptyForm
          activeAction={activeAction}
          busy={busy}
          criteriaText={criteriaText}
          objectiveText={objectiveText}
          text={text}
          trimmedObjectiveText={trimmedObjectiveText}
          onCriteriaTextChange={setCriteriaText}
          onObjectiveTextChange={setObjectiveText}
          onSave={handleSetObjective}
        />
      )}

      {errorMessage ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
};
