import type { ActionRequired } from "../types";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasPlanApprovalMetadata(action: ActionRequired): boolean {
  const governance = action.governance as unknown;
  const metadataCandidates = [
    action.scope,
    action.arguments,
    governance,
  ].filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );

  return metadataCandidates.some((record) =>
    [
      "plan_approval_request",
      "planApprovalRequest",
      "plan_approval",
      "planApproval",
      "proposed_plan",
      "proposedPlan",
    ].some((key) => key in record),
  );
}

function textLooksLikePlanApproval(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("实施此计划") ||
    normalized.includes("执行此计划") ||
    normalized.includes("确认计划") ||
    normalized.includes("approve this plan") ||
    normalized.includes("implement this plan") ||
    normalized.includes("proceed with this plan") ||
    normalized.includes("proceed with the plan") ||
    normalized.includes("continue with this plan")
  );
}

export function isPlanComposerDecision(action: ActionRequired): boolean {
  if (action.status && action.status !== "pending") {
    return false;
  }
  if (action.actionType !== "ask_user" && action.actionType !== "elicitation") {
    return false;
  }
  if (hasPlanApprovalMetadata(action)) {
    return true;
  }

  const prompt = normalizeText(action.prompt);
  if (textLooksLikePlanApproval(prompt)) {
    return true;
  }

  return (action.questions ?? []).some((question) =>
    [question.question, question.header].some((value) =>
      textLooksLikePlanApproval(normalizeText(value)),
    ),
  );
}

export function selectLatestPlanComposerDecision(
  pendingActions: readonly ActionRequired[] | undefined,
  submittedActionsInFlight: readonly ActionRequired[] | undefined = [],
): ActionRequired | null {
  if (!pendingActions?.length) {
    return null;
  }

  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((action) => action.requestId),
  );
  for (let index = pendingActions.length - 1; index >= 0; index -= 1) {
    const action = pendingActions[index];
    if (
      action &&
      !submittedRequestIds.has(action.requestId) &&
      isPlanComposerDecision(action)
    ) {
      return action;
    }
  }
  return null;
}

export function filterPlanComposerDecisionFromPendingActions(
  pendingActions: readonly ActionRequired[] | undefined,
  selectedAction: ActionRequired | null,
): ActionRequired[] | undefined {
  if (!pendingActions || !selectedAction) {
    return pendingActions ? [...pendingActions] : pendingActions;
  }
  return pendingActions.filter(
    (action) => action.requestId !== selectedAction.requestId,
  );
}
