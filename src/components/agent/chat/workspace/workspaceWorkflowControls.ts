import type {
  AppServerWorkflowCancelParams,
  AppServerWorkflowRespondParams,
  AppServerWorkflowRetryParams,
} from "@/lib/api/appServerTypes";
import type {
  WorkspaceWorkflowAction,
  WorkspaceWorkflowRun,
} from "./workspaceWorkflowReadModel";

export type WorkspaceWorkflowControlKind = "cancel" | "retry" | "respond";

export interface WorkspaceWorkflowControlItem {
  id: string;
  kind: WorkspaceWorkflowControlKind;
  workflowRunId: string;
  stepId: string | null;
  requestId: string | null;
  actionType: AppServerWorkflowRespondParams["actionType"];
  labelKey: string;
  ariaLabelKey: string;
  tone: "default" | "warning" | "primary";
}

type WorkflowControlParams =
  | AppServerWorkflowCancelParams
  | AppServerWorkflowRetryParams
  | AppServerWorkflowRespondParams;

const CANCELABLE_STATUSES = new Set([
  "accepted",
  "active",
  "pending",
  "preparing",
  "queued",
  "retrying",
  "running",
  "waiting",
  "waiting_action",
  "waitingaction",
]);

const FAILED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "error",
  "failed",
  "failure",
  "timeout",
]);

export function buildWorkspaceWorkflowControlItems(
  workflowRuns: readonly WorkspaceWorkflowRun[],
): WorkspaceWorkflowControlItem[] {
  const run = workflowRuns[0];
  if (!run) {
    return [];
  }

  const items: WorkspaceWorkflowControlItem[] = [];
  const responseTarget = resolveWorkflowResponseTarget(run);
  if (responseTarget) {
    items.push({
      id: `workflow-${run.workflowRunId}-respond-${responseTarget.stepId ?? "run"}`,
      kind: "respond",
      workflowRunId: run.workflowRunId,
      stepId: responseTarget.stepId,
      requestId: responseTarget.requestId,
      actionType: responseTarget.actionType,
      labelKey: "generalWorkbench.workflow.control.respond",
      ariaLabelKey: "generalWorkbench.workflow.control.respondAria",
      tone: "primary",
    });
  }

  const retryStep = resolveWorkflowRetryStep(run);
  if (retryStep) {
    items.push({
      id: `workflow-${run.workflowRunId}-retry-${retryStep.id ?? "run"}`,
      kind: "retry",
      workflowRunId: run.workflowRunId,
      stepId: retryStep.id,
      requestId: null,
      actionType: null,
      labelKey: "generalWorkbench.workflow.control.retry",
      ariaLabelKey: "generalWorkbench.workflow.control.retryAria",
      tone: "warning",
    });
  }

  const cancelStep = resolveWorkflowCancelStep(run);
  if (cancelStep) {
    items.push({
      id: `workflow-${run.workflowRunId}-cancel-${cancelStep.id ?? "run"}`,
      kind: "cancel",
      workflowRunId: run.workflowRunId,
      stepId: cancelStep.id,
      requestId: null,
      actionType: null,
      labelKey: "generalWorkbench.workflow.control.cancel",
      ariaLabelKey: "generalWorkbench.workflow.control.cancelAria",
      tone: "default",
    });
  }

  return items;
}

export function buildWorkspaceWorkflowControlParams(
  item: WorkspaceWorkflowControlItem,
  sessionId: string,
): WorkflowControlParams {
  if (item.kind === "cancel") {
    return buildWorkspaceWorkflowCancelParams(item, sessionId);
  }
  if (item.kind === "retry") {
    return buildWorkspaceWorkflowRetryParams(item, sessionId);
  }
  return buildWorkspaceWorkflowRespondParams(item, sessionId);
}

export function buildWorkspaceWorkflowCancelParams(
  item: WorkspaceWorkflowControlItem,
  sessionId: string,
): AppServerWorkflowCancelParams {
  const base = {
    sessionId,
    workflowRunId: item.workflowRunId,
    stepId: item.stepId,
  };

  return {
    ...base,
    reasonCode: "user_cancelled_from_general_workbench",
    reason: "Canceled from General Workbench workflow controls.",
  };
}

export function buildWorkspaceWorkflowRetryParams(
  item: WorkspaceWorkflowControlItem,
  sessionId: string,
): AppServerWorkflowRetryParams {
  const base = {
    sessionId,
    workflowRunId: item.workflowRunId,
    stepId: item.stepId,
  };

  return {
    ...base,
    reasonCode: "user_retry_from_general_workbench",
    reason: "Retried from General Workbench workflow controls.",
  };
}

export function buildWorkspaceWorkflowRespondParams(
  item: WorkspaceWorkflowControlItem,
  sessionId: string,
): AppServerWorkflowRespondParams {
  const base = {
    sessionId,
    workflowRunId: item.workflowRunId,
    stepId: item.stepId,
  };

  return {
    ...base,
    requestId: item.requestId,
    actionType: item.actionType ?? "ask_user",
    confirmed: true,
    response: {
      decision: "confirmed",
      source: "general_workbench_sidebar",
    },
  };
}

function resolveWorkflowResponseTarget(run: WorkspaceWorkflowRun): {
  stepId: string | null;
  requestId: string | null;
  actionType: AppServerWorkflowRespondParams["actionType"];
} | null {
  const action =
    run.actions.find(isRespondWorkflowAction) ??
    run.actions.find((item) => Boolean(item.requestId || item.stepId));
  if (action) {
    return {
      stepId: action.stepId,
      requestId: action.requestId,
      actionType: normalizeActionType(action.agentActionType),
    };
  }

  const waitingStep = run.steps.find((step) => {
    const status = normalizeStatus(step.status);
    return (
      (status === "waiting" ||
        status === "waiting_action" ||
        status === "waitingaction") &&
      Boolean(step.requestId || step.agentActionType)
    );
  });

  if (!waitingStep) {
    return null;
  }

  return {
    stepId: waitingStep.id,
    requestId: waitingStep.requestId,
    actionType: normalizeActionType(waitingStep.agentActionType),
  };
}

function resolveWorkflowRetryStep(
  run: WorkspaceWorkflowRun,
): { id: string | null } | null {
  if (!isWorkflowFailed(run)) {
    return null;
  }
  const failedStep = run.steps.find((step) =>
    FAILED_STATUSES.has(normalizeStatus(step.status)),
  );
  return failedStep ? { id: failedStep.id } : { id: null };
}

function resolveWorkflowCancelStep(
  run: WorkspaceWorkflowRun,
): { id: string | null } | null {
  if (!isWorkflowCancelable(run)) {
    return null;
  }
  const activeStep = run.steps.find((step) =>
    CANCELABLE_STATUSES.has(normalizeStatus(step.status)),
  );
  return activeStep ? { id: activeStep.id } : { id: null };
}

function isWorkflowCancelable(run: WorkspaceWorkflowRun): boolean {
  const runStatus = normalizeStatus(run.status);
  if (CANCELABLE_STATUSES.has(runStatus)) {
    return true;
  }
  return run.steps.some((step) =>
    CANCELABLE_STATUSES.has(normalizeStatus(step.status)),
  );
}

function isWorkflowFailed(run: WorkspaceWorkflowRun): boolean {
  const runStatus = normalizeStatus(run.status);
  if (FAILED_STATUSES.has(runStatus)) {
    return true;
  }
  return run.steps.some((step) =>
    FAILED_STATUSES.has(normalizeStatus(step.status)),
  );
}

function isRespondWorkflowAction(action: WorkspaceWorkflowAction): boolean {
  const actionType = normalizeStatus(action.actionType);
  return (
    actionType === "respond" ||
    actionType === "confirm" ||
    actionType === "approve" ||
    actionType === "answer" ||
    actionType === "ask_user" ||
    actionType === "elicitation" ||
    actionType === "tool_confirmation"
  );
}

function normalizeActionType(
  value?: string | null,
): AppServerWorkflowRespondParams["actionType"] {
  const normalized = normalizeStatus(value);
  if (
    normalized === "ask_user" ||
    normalized === "elicitation" ||
    normalized === "tool_confirmation"
  ) {
    return normalized;
  }
  return "ask_user";
}

function normalizeStatus(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
