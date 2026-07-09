import type { ActionRequired } from "../types";

export function selectPendingInputbarApprovalAction(
  pendingActions: readonly ActionRequired[] | undefined,
  submittedActionsInFlight: readonly ActionRequired[] | undefined = [],
): ActionRequired | null {
  if (!pendingActions?.length) {
    return null;
  }

  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((action) => action.requestId),
  );
  return (
    pendingActions.find(
      (action) =>
        action.actionType === "tool_confirmation" &&
        action.status !== "submitted" &&
        !submittedRequestIds.has(action.requestId),
    ) ?? null
  );
}
