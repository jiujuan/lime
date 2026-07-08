import {
  buildWorkflowStepSnapshot,
  buildWorkflowSummaryText,
  formatWorkflowProgressLabel,
  getWorkflowStatusLabel,
} from "../utils/workflowStepPresentation";
import type {
  GeneralWorkbenchWorkflowCurrentProjection,
  GeneralWorkbenchWorkflowPanelTranslate,
  GeneralWorkbenchWorkflowQueueItemProjection,
  GeneralWorkbenchWorkflowStepInput,
} from "./generalWorkbenchWorkflowPanelTypes";

export function countCompletedWorkflowSteps(
  workflowSteps: GeneralWorkbenchWorkflowStepInput[],
): number {
  return workflowSteps.filter((step) => step.status === "completed").length;
}

export function calculateWorkflowProgressPercent({
  completedSteps,
  totalSteps,
}: {
  completedSteps: number;
  totalSteps: number;
}): number {
  return totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
}

export function clampWorkflowProgressPercent(progressPercent: number): number {
  return Math.max(0, Math.min(100, progressPercent));
}

export function buildGeneralWorkbenchWorkflowQueueItemProjections({
  steps,
  t,
}: {
  steps: GeneralWorkbenchWorkflowStepInput[];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchWorkflowQueueItemProjection[] {
  return steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    status: step.status,
    indexLabel: t("generalWorkbench.workflow.queue.item", {
      index: index + 1,
    }),
    statusLabel: getWorkflowStatusLabel(step.status),
  }));
}

export function buildGeneralWorkbenchWorkflowCurrentProjection({
  workflowSteps,
  completedSteps,
  progressPercent,
  visibleQueueLimit = 3,
  t,
}: {
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  completedSteps: number;
  progressPercent: number;
  visibleQueueLimit?: number;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchWorkflowCurrentProjection {
  const workflowSnapshot = buildWorkflowStepSnapshot(
    workflowSteps,
    visibleQueueLimit,
  );
  const currentWorkflowStep = workflowSnapshot.leadingStep;
  const currentStepStatus = currentWorkflowStep?.status ?? "completed";
  const remainingSteps = workflowSnapshot.remainingCount;
  const visibleQueueSteps = workflowSnapshot.visibleQueueItems.filter(
    (step) => step.id !== currentWorkflowStep?.id,
  );
  const queueItems = buildGeneralWorkbenchWorkflowQueueItemProjections({
    steps: visibleQueueSteps,
    t,
  });
  const hiddenQueueCount = Math.max(
    workflowSnapshot.openSteps.length - 1 - visibleQueueSteps.length,
    0,
  );
  const completedWorkflowSteps = workflowSnapshot.completedCount;
  const workflowSummaryText = buildWorkflowSummaryText({
    leadingStep: currentWorkflowStep,
    remainingCount: remainingSteps,
    emptyLabel:
      workflowSteps.length > 0
        ? t("generalWorkbench.workflow.current.completedTitle")
        : t("generalWorkbench.workflow.current.emptyTitle"),
  });
  const progressBarPercent = clampWorkflowProgressPercent(progressPercent);

  return {
    currentWorkflowStep,
    currentStepTitle:
      currentWorkflowStep?.title ||
      t("generalWorkbench.workflow.current.completedTitle"),
    currentStepIconStatus: currentWorkflowStep?.status ?? "active",
    currentStepStatus,
    currentStepStatusLabel: getWorkflowStatusLabel(currentStepStatus),
    remainingSteps,
    visibleQueueSteps,
    queueItems,
    hiddenQueueCount,
    completedWorkflowSteps,
    workflowSummaryText,
    workflowProgressLabel: formatWorkflowProgressLabel({
      completedCount: completedSteps,
      totalCount: workflowSteps.length,
    }),
    remainingText:
      remainingSteps > 0
        ? t("generalWorkbench.workflow.current.remaining", {
            count: remainingSteps,
          })
        : t("generalWorkbench.workflow.current.allCompleted"),
    progressBarPercent,
    progressPercentLabel: `${Math.round(progressBarPercent)}%`,
    queueHeaderText:
      visibleQueueSteps.length === 0
        ? null
        : hiddenQueueCount > 0
          ? t("generalWorkbench.workflow.queue.hiddenCount", {
              visible: visibleQueueSteps.length,
              hidden: hiddenQueueCount,
            })
          : t("generalWorkbench.workflow.queue.pendingCount", {
              count: visibleQueueSteps.length,
            }),
    completedCountText:
      completedWorkflowSteps > 0
        ? t("generalWorkbench.workflow.completed.count", {
            count: completedWorkflowSteps,
          })
        : null,
    completedHintText:
      completedWorkflowSteps > 0
        ? remainingSteps > 0
          ? t("generalWorkbench.workflow.completed.collapsedWithRemaining")
          : t("generalWorkbench.workflow.completed.allDoneHint")
        : null,
  };
}
