import type { ManagedObjectiveStatus } from "@/lib/api/agentRuntime/sessionTypes";

export const MANAGED_OBJECTIVE_AUTOMATION_STATUS_TONE: Record<
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
