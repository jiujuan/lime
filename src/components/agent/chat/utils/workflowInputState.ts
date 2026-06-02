import { useMemo } from "react";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import {
  buildWorkflowStepSnapshot,
  buildWorkflowSummaryText,
  formatWorkflowProgressLabel,
  type WorkflowPresentationCopy,
} from "./workflowStepPresentation";

export interface WorkflowGateState {
  key: string;
  title: string;
  status: "running" | "waiting" | "idle";
  description: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  status: StepStatus;
}

export interface WorkflowQuickAction {
  id: string;
  label: string;
  prompt: string;
}

export interface WorkflowInputStateParams {
  isWorkspaceVariant: boolean;
  workflowGate?: WorkflowGateState | null;
  workflowSteps?: WorkflowStep[];
  workflowRunState?: "idle" | "auto_running" | "await_user_decision";
  isSending: boolean;
  copy: WorkflowInputStateCopy;
}

export interface WorkflowInputState {
  workflowQuickActions: WorkflowQuickAction[];
  workflowQueueItems: WorkflowStep[];
  workflowActiveItem: WorkflowStep | null;
  workflowQueueTotalCount: number;
  workflowCompletedCount: number;
  workflowTotalCount: number;
  workflowProgressLabel: string;
  workflowSummaryLabel: string;
  renderWorkflowGeneratingPanel: boolean;
}

export interface WorkflowInputStateCopy extends WorkflowPresentationCopy {
  quickActions: {
    topicOptionsLabel: string;
    topicOptionsPrompt: string;
    topicChooseBLabel: string;
    topicChooseBPrompt: string;
    writeFastLabel: string;
    writeFastPrompt: string;
    writeCoachLabel: string;
    writeCoachPrompt: string;
    publishChecklistLabel: string;
    publishChecklistPrompt: string;
    publishNowLabel: string;
    publishNowPrompt: string;
    nextStepLabel: string;
    nextStepPrompt: string;
  };
}

function resolveWorkflowQuickActions(
  gateKey: string | undefined,
  copy: WorkflowInputStateCopy,
): WorkflowQuickAction[] {
  switch (gateKey) {
    case "topic_select":
      return [
        {
          id: "topic-options",
          label: copy.quickActions.topicOptionsLabel,
          prompt: copy.quickActions.topicOptionsPrompt,
        },
        {
          id: "topic-choose-b",
          label: copy.quickActions.topicChooseBLabel,
          prompt: copy.quickActions.topicChooseBPrompt,
        },
      ];
    case "write_mode":
      return [
        {
          id: "write-fast",
          label: copy.quickActions.writeFastLabel,
          prompt: copy.quickActions.writeFastPrompt,
        },
        {
          id: "write-coach",
          label: copy.quickActions.writeCoachLabel,
          prompt: copy.quickActions.writeCoachPrompt,
        },
      ];
    case "publish_confirm":
      return [
        {
          id: "publish-checklist",
          label: copy.quickActions.publishChecklistLabel,
          prompt: copy.quickActions.publishChecklistPrompt,
        },
        {
          id: "publish-now",
          label: copy.quickActions.publishNowLabel,
          prompt: copy.quickActions.publishNowPrompt,
        },
      ];
    default:
      return [
        {
          id: "next-step",
          label: copy.quickActions.nextStepLabel,
          prompt: copy.quickActions.nextStepPrompt,
        },
      ];
  }
}

export function buildWorkflowInputState({
  isWorkspaceVariant,
  workflowGate,
  workflowSteps = [],
  workflowRunState,
  isSending,
  copy,
}: WorkflowInputStateParams): WorkflowInputState {
  const workflowQuickActions = isWorkspaceVariant
    ? resolveWorkflowQuickActions(workflowGate?.key, copy)
    : [];

  const workflowStepSnapshot = isWorkspaceVariant
    ? buildWorkflowStepSnapshot(workflowSteps, 3)
    : null;

  const workflowActiveItem = workflowStepSnapshot?.leadingStep ?? null;

  const workflowQueueTotalCount = (() => {
    if (!isWorkspaceVariant) {
      return 0;
    }
    if (workflowStepSnapshot && workflowStepSnapshot.remainingCount > 0) {
      return workflowStepSnapshot.remainingCount;
    }
    return workflowGate ? 1 : 0;
  })();

  const workflowSummaryLabel = (() => {
    if (workflowActiveItem) {
      return buildWorkflowSummaryText({
        leadingStep: workflowActiveItem,
        remainingCount: workflowQueueTotalCount,
        copy,
      });
    }
    if (workflowGate?.status === "waiting") {
      return copy.summary.waitingDecision;
    }
    if (workflowGate?.status === "running") {
      return copy.summary.running;
    }
    return copy.summary.arranging;
  })();

  const workflowCompletedCount = workflowStepSnapshot?.completedCount ?? 0;
  const workflowTotalCount =
    workflowStepSnapshot?.totalCount ?? workflowSteps.length;
  const workflowProgressLabel = formatWorkflowProgressLabel({
    completedCount: workflowCompletedCount,
    totalCount: workflowTotalCount,
    copy,
  });

  const workflowQueueItems = (() => {
    if (!isWorkspaceVariant) {
      return [];
    }

    const visibleSteps = workflowStepSnapshot?.visibleQueueItems ?? [];

    if (visibleSteps.length > 0) {
      return visibleSteps;
    }

    if (workflowGate) {
      return [
        {
          id: `gate-${workflowGate.key}`,
          title: workflowGate.title,
          status:
            workflowGate.status === "waiting"
              ? ("pending" as StepStatus)
              : ("active" as StepStatus),
        },
      ];
    }

    return [];
  })();

  const renderWorkflowGeneratingPanel = isWorkspaceVariant
    ? workflowRunState
      ? workflowRunState === "auto_running"
      : isSending
    : false;

  return {
    workflowQuickActions,
    workflowQueueItems,
    workflowActiveItem,
    workflowQueueTotalCount,
    workflowCompletedCount,
    workflowTotalCount,
    workflowProgressLabel,
    workflowSummaryLabel,
    renderWorkflowGeneratingPanel,
  };
}

export function useWorkflowInputState(
  params: WorkflowInputStateParams,
): WorkflowInputState {
  const {
    isWorkspaceVariant,
    workflowGate,
    workflowSteps,
    workflowRunState,
    isSending,
    copy,
  } = params;

  return useMemo(
    () =>
      buildWorkflowInputState({
        isWorkspaceVariant,
        workflowGate,
        workflowSteps,
        workflowRunState,
        isSending,
        copy,
      }),
    [
      copy,
      isSending,
      isWorkspaceVariant,
      workflowGate,
      workflowRunState,
      workflowSteps,
    ],
  );
}
