import type {
  AppServerWorkflowCancelParams,
  AppServerWorkflowRespondParams,
  AppServerWorkflowRetryParams,
} from "@/lib/api/appServerTypes";
import type {
  WorkspaceWorkflowAction,
  WorkspaceWorkflowRun,
  WorkspaceWorkflowStep,
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
  "waiting_permission",
]);

const RETRYABLE_STATUSES = new Set([
  "canceled",
  "cancelled",
  "error",
  "failed",
  "failure",
  "skip",
  "skipped",
  "timeout",
]);

interface WorkflowResponseTarget {
  stepId: string | null;
  requestId: string | null;
  actionType: AppServerWorkflowRespondParams["actionType"];
}

export function buildWorkspaceWorkflowControlItems(
  workflowRuns: readonly WorkspaceWorkflowRun[],
): WorkspaceWorkflowControlItem[] {
  const run = workflowRuns[0];
  if (!run) {
    return [];
  }

  const items: WorkspaceWorkflowControlItem[] = [];
  for (const responseTarget of resolveWorkflowResponseTargets(run)) {
    const respondCopy = workflowRespondCopyKeys(responseTarget.actionType);
    items.push({
      id: `workflow-${run.workflowRunId}-respond-${responseTarget.stepId ?? "run"}-${responseTarget.requestId ?? "request"}`,
      kind: "respond",
      workflowRunId: run.workflowRunId,
      stepId: responseTarget.stepId,
      requestId: responseTarget.requestId,
      actionType: responseTarget.actionType,
      labelKey: respondCopy.labelKey,
      ariaLabelKey: respondCopy.ariaLabelKey,
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

function resolveWorkflowResponseTargets(
  run: WorkspaceWorkflowRun,
): WorkflowResponseTarget[] {
  const targets: WorkflowResponseTarget[] = [];
  const seen = new Set<string>();

  for (const action of run.actions) {
    if (!isRespondWorkflowAction(action)) {
      continue;
    }
    pushUniqueResponseTarget(
      targets,
      seen,
      {
        stepId: action.stepId,
        requestId: action.requestId,
        actionType: normalizeActionType(
          action.agentActionType ?? action.actionType,
        ),
      },
    );
  }

  for (const step of run.steps) {
    if (!isWaitingStepWithResponse(step)) {
      continue;
    }
    pushUniqueResponseTarget(
      targets,
      seen,
      {
        stepId: step.id,
        requestId: step.requestId,
        actionType: normalizeActionType(step.agentActionType),
      },
    );
  }

  return targets;
}

function resolveWorkflowRetryStep(
  run: WorkspaceWorkflowRun,
): { id: string | null } | null {
  if (!isWorkflowFailed(run)) {
    return null;
  }
  const failedStep = run.steps.find((step) =>
    RETRYABLE_STATUSES.has(normalizeStatus(step.status)),
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
  if (RETRYABLE_STATUSES.has(runStatus)) {
    return true;
  }
  return run.steps.some((step) =>
    RETRYABLE_STATUSES.has(normalizeStatus(step.status)),
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

function isWaitingStepWithResponse(step: WorkspaceWorkflowStep): boolean {
  return (
    isWorkflowWaitingStatus(step.status) &&
    Boolean(step.requestId || step.agentActionType)
  );
}

function isWorkflowWaitingStatus(value?: string | null): boolean {
  const status = normalizeStatus(value);
  return (
    status === "waiting" ||
    status === "waiting_action" ||
    status === "waitingaction" ||
    status === "waiting_permission"
  );
}

function pushUniqueResponseTarget(
  targets: WorkflowResponseTarget[],
  seen: Set<string>,
  target: WorkflowResponseTarget,
): void {
  if (!target.requestId && !target.stepId) {
    return;
  }
  const key = `${target.stepId ?? ""}:${target.requestId ?? ""}:${target.actionType ?? ""}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  targets.push(target);
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

function workflowRespondCopyKeys(
  actionType: AppServerWorkflowRespondParams["actionType"],
): Pick<WorkspaceWorkflowControlItem, "labelKey" | "ariaLabelKey"> {
  if (actionType === "tool_confirmation") {
    return {
      labelKey: "generalWorkbench.workflow.control.respondToolConfirmation",
      ariaLabelKey:
        "generalWorkbench.workflow.control.respondToolConfirmationAria",
    };
  }
  if (actionType === "elicitation") {
    return {
      labelKey: "generalWorkbench.workflow.control.respondElicitation",
      ariaLabelKey: "generalWorkbench.workflow.control.respondElicitationAria",
    };
  }
  return {
    labelKey: "generalWorkbench.workflow.control.respond",
    ariaLabelKey: "generalWorkbench.workflow.control.respondAria",
  };
}

function normalizeStatus(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
