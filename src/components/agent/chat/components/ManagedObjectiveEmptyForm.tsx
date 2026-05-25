import React from "react";
import { Loader2, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MANAGED_OBJECTIVE_COPY as COPY,
  type ManagedObjectiveAction,
  type ManagedObjectivePanelText,
} from "./managedObjectivePanelModel";

interface ManagedObjectiveEmptyFormProps {
  activeAction: ManagedObjectiveAction | null;
  busy: boolean;
  criteriaText: string;
  objectiveText: string;
  text: ManagedObjectivePanelText;
  trimmedObjectiveText: string;
  onCriteriaTextChange: (value: string) => void;
  onObjectiveTextChange: (value: string) => void;
  onSave: () => void | Promise<void>;
}

export const ManagedObjectiveEmptyForm: React.FC<
  ManagedObjectiveEmptyFormProps
> = ({
  activeAction,
  busy,
  criteriaText,
  objectiveText,
  text,
  trimmedObjectiveText,
  onCriteriaTextChange,
  onObjectiveTextChange,
  onSave,
}) => (
  <div className="mt-3 space-y-3">
    <Textarea
      value={objectiveText}
      onChange={(event) => onObjectiveTextChange(event.target.value)}
      placeholder={text(COPY.formObjectivePlaceholder)}
      aria-label={text(COPY.formObjectiveLabel)}
      className="min-h-[76px] rounded-xl border-emerald-200 bg-white text-sm"
      data-testid="managed-objective-objective-input"
    />
    <Textarea
      value={criteriaText}
      onChange={(event) => onCriteriaTextChange(event.target.value)}
      placeholder={text(COPY.formCriteriaPlaceholder)}
      aria-label={text(COPY.formCriteriaLabel)}
      className="min-h-[68px] rounded-xl border-emerald-100 bg-white text-sm"
      data-testid="managed-objective-criteria-input"
    />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-emerald-900">
        {text(COPY.formCriteriaHint)}
      </span>
      <Button
        type="button"
        size="sm"
        onClick={() => void onSave()}
        disabled={!trimmedObjectiveText || busy}
        className="h-8 rounded-full bg-slate-950 text-white hover:bg-slate-800"
        data-testid="managed-objective-save"
      >
        {activeAction === "set" ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Target className="mr-2 h-3.5 w-3.5" />
        )}
        {text(COPY.actionSave)}
      </Button>
    </div>
  </div>
);
