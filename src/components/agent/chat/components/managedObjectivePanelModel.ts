import type { ManagedObjectiveStatus } from "@/lib/api/agentRuntime";

export type ManagedObjectiveAction =
  | "clear"
  | "audit"
  | "continue"
  | "pause"
  | "resume"
  | "set";

export type ManagedObjectivePanelText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export const MANAGED_OBJECTIVE_STATUS_TONE: Record<
  ManagedObjectiveStatus,
  string
> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  verifying: "border-sky-200 bg-sky-50 text-sky-700",
  needs_input: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
  budget_limited: "border-amber-200 bg-amber-50 text-amber-700",
  paused: "border-slate-200 bg-slate-50 text-slate-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export const MANAGED_OBJECTIVE_STATUS_LABEL_KEYS: Record<
  ManagedObjectiveStatus,
  string
> = {
  active: "agentChat.managedObjective.status.active",
  verifying: "agentChat.managedObjective.status.verifying",
  needs_input: "agentChat.managedObjective.status.needs_input",
  blocked: "agentChat.managedObjective.status.blocked",
  budget_limited: "agentChat.managedObjective.status.budget_limited",
  paused: "agentChat.managedObjective.status.paused",
  completed: "agentChat.managedObjective.status.completed",
  failed: "agentChat.managedObjective.status.failed",
};

export const MANAGED_OBJECTIVE_COPY = {
  actionClear: "agentChat.managedObjective.action.clear",
  actionComplete: "agentChat.managedObjective.action.complete",
  actionContinue: "agentChat.managedObjective.action.continue",
  actionPause: "agentChat.managedObjective.action.pause",
  actionResume: "agentChat.managedObjective.action.resume",
  actionSave: "agentChat.managedObjective.action.save",
  blockerReason: "agentChat.managedObjective.blockerReason",
  criteriaEmpty: "agentChat.managedObjective.criteria.empty",
  descriptionActive: "agentChat.managedObjective.description.active",
  descriptionEmpty: "agentChat.managedObjective.description.empty",
  formCriteriaHint: "agentChat.managedObjective.form.criteriaHint",
  formCriteriaLabel: "agentChat.managedObjective.form.criteriaLabel",
  formCriteriaPlaceholder:
    "agentChat.managedObjective.form.criteriaPlaceholder",
  formObjectiveLabel: "agentChat.managedObjective.form.objectiveLabel",
  formObjectivePlaceholder:
    "agentChat.managedObjective.form.objectivePlaceholder",
  runtimeBusy: "agentChat.managedObjective.runtimeBusy",
  title: "agentChat.managedObjective.title",
  toastCleared: "agentChat.managedObjective.toast.cleared",
  toastCompleted: "agentChat.managedObjective.toast.completed",
  toastContinued: "agentChat.managedObjective.toast.continued",
  toastFailed: "agentChat.managedObjective.toast.failed",
  toastPaused: "agentChat.managedObjective.toast.paused",
  toastResumed: "agentChat.managedObjective.toast.resumed",
  toastSaved: "agentChat.managedObjective.toast.saved",
  updatedAt: "agentChat.managedObjective.updatedAt",
  validationObjectiveRequired:
    "agentChat.managedObjective.validation.objectiveRequired",
} as const;

export function splitManagedObjectiveSuccessCriteria(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
