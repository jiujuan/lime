import React from "react";
import {
  Loader2,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ManagedObjective } from "@/lib/api/agentRuntime";
import { ManagedObjectiveAuditSummary } from "./ManagedObjectiveAuditSummary";
import {
  MANAGED_OBJECTIVE_COPY as COPY,
  type ManagedObjectiveAction,
  type ManagedObjectivePanelText,
} from "./managedObjectivePanelModel";

interface ManagedObjectiveCurrentViewProps {
  activeAction: ManagedObjectiveAction | null;
  busy: boolean;
  canAudit: boolean;
  canContinue: boolean;
  objective: ManagedObjective;
  objectiveUpdatedLabel: string | null;
  runtimeBusy: boolean;
  text: ManagedObjectivePanelText;
  onAudit: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onResume: () => void | Promise<void>;
}

export const ManagedObjectiveCurrentView: React.FC<
  ManagedObjectiveCurrentViewProps
> = ({
  activeAction,
  busy,
  canAudit,
  canContinue,
  objective,
  objectiveUpdatedLabel,
  runtimeBusy,
  text,
  onAudit,
  onClear,
  onContinue,
  onPause,
  onResume,
}) => (
  <div className="mt-3 space-y-3">
    <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
      <div className="text-sm font-medium leading-6 text-slate-950">
        {objective.objective_text}
      </div>
      {objective.success_criteria.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
          {objective.success_criteria.map((criterion, index) => (
            <li key={`${criterion}-${index}`}>{criterion}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {text(COPY.criteriaEmpty)}
        </p>
      )}
      {objective.blocker_reason ? (
        <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-xs leading-5 text-rose-800">
          {text(COPY.blockerReason, {
            reason: objective.blocker_reason,
          })}
        </div>
      ) : null}
      {objectiveUpdatedLabel ? (
        <div className="mt-2 text-[11px] text-slate-500">
          {text(COPY.updatedAt, { value: objectiveUpdatedLabel })}
        </div>
      ) : null}
    </div>

    {runtimeBusy &&
    objective.status !== "paused" &&
    objective.status !== "completed" &&
    objective.status !== "failed" ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        {text(COPY.runtimeBusy)}
      </div>
    ) : null}

    <div className="flex flex-wrap gap-2">
      {objective.status === "active" ? (
        <Button
          type="button"
          size="sm"
          onClick={() => void onContinue()}
          disabled={!canContinue || busy}
          className="h-8 rounded-full bg-slate-950 text-white hover:bg-slate-800"
          data-testid="managed-objective-continue"
        >
          {activeAction === "continue" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="mr-2 h-3.5 w-3.5" />
          )}
          {text(COPY.actionContinue)}
        </Button>
      ) : null}

      {objective.status !== "paused" &&
      objective.status !== "completed" &&
      objective.status !== "failed" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onAudit()}
          disabled={!canAudit || busy}
          className="h-8 rounded-full border-sky-300 bg-white text-sky-700 hover:bg-sky-50"
          data-testid="managed-objective-audit"
        >
          {activeAction === "audit" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
          )}
          {text(COPY.actionComplete)}
        </Button>
      ) : null}

      {objective.status === "active" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onPause()}
          disabled={busy}
          className="h-8 rounded-full border-slate-300 bg-white"
        >
          {activeAction === "pause" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PauseCircle className="mr-2 h-3.5 w-3.5" />
          )}
          {text(COPY.actionPause)}
        </Button>
      ) : null}

      {objective.status === "paused" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onResume()}
          disabled={busy}
          className="h-8 rounded-full border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
        >
          {activeAction === "resume" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="mr-2 h-3.5 w-3.5" />
          )}
          {text(COPY.actionResume)}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onClear()}
        disabled={busy}
        className="h-8 rounded-full border-slate-300 bg-white text-slate-700"
        data-testid="managed-objective-clear"
      >
        {activeAction === "clear" ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="mr-2 h-3.5 w-3.5" />
        )}
        {text(COPY.actionClear)}
      </Button>
    </div>

    <ManagedObjectiveAuditSummary objective={objective} />
  </div>
);
