import type { WorkflowInputStateCopy } from "../../utils/workflowInputState";

export type InputbarWorkflowCopyKey =
  | "agentChat.inputbar.workflow.status.error"
  | "agentChat.inputbar.workflow.status.pending"
  | "agentChat.inputbar.workflow.status.active"
  | "agentChat.inputbar.workflow.status.completed"
  | "agentChat.inputbar.workflow.status.skipped"
  | "agentChat.inputbar.workflow.status.waitingDecision"
  | "agentChat.inputbar.workflow.status.autoRunning"
  | "agentChat.inputbar.workflow.status.ready"
  | "agentChat.inputbar.workflow.summary.currentProgress"
  | "agentChat.inputbar.workflow.summary.defaultActiveTitle"
  | "agentChat.inputbar.workflow.summary.defaultGateTitle"
  | "agentChat.inputbar.workflow.summary.completed"
  | "agentChat.inputbar.workflow.summary.waitingDecision"
  | "agentChat.inputbar.workflow.summary.running"
  | "agentChat.inputbar.workflow.summary.arranging"
  | "agentChat.inputbar.workflow.summary.errorWithTrailing"
  | "agentChat.inputbar.workflow.summary.errorLast"
  | "agentChat.inputbar.workflow.summary.pendingWithTrailing"
  | "agentChat.inputbar.workflow.summary.pendingLast"
  | "agentChat.inputbar.workflow.summary.activeWithTrailing"
  | "agentChat.inputbar.workflow.summary.activeLast"
  | "agentChat.inputbar.workflow.progress.waitingStart"
  | "agentChat.inputbar.workflow.progress.completed"
  | "agentChat.inputbar.workflow.action.stopGeneration"
  | "agentChat.inputbar.workflow.queue.title"
  | "agentChat.inputbar.workflow.queue.expand"
  | "agentChat.inputbar.workflow.queue.collapse"
  | "agentChat.inputbar.workflow.queue.hiddenSuffix"
  | "agentChat.inputbar.workflow.queue.placeholderTitle"
  | "agentChat.inputbar.workflow.queue.itemMetaWithProgress"
  | "agentChat.inputbar.workflow.quickAction.topicOptions.label"
  | "agentChat.inputbar.workflow.quickAction.topicOptions.prompt"
  | "agentChat.inputbar.workflow.quickAction.topicChooseB.label"
  | "agentChat.inputbar.workflow.quickAction.topicChooseB.prompt"
  | "agentChat.inputbar.workflow.quickAction.writeFast.label"
  | "agentChat.inputbar.workflow.quickAction.writeFast.prompt"
  | "agentChat.inputbar.workflow.quickAction.writeCoach.label"
  | "agentChat.inputbar.workflow.quickAction.writeCoach.prompt"
  | "agentChat.inputbar.workflow.quickAction.publishChecklist.label"
  | "agentChat.inputbar.workflow.quickAction.publishChecklist.prompt"
  | "agentChat.inputbar.workflow.quickAction.publishNow.label"
  | "agentChat.inputbar.workflow.quickAction.publishNow.prompt"
  | "agentChat.inputbar.workflow.quickAction.nextStep.label"
  | "agentChat.inputbar.workflow.quickAction.nextStep.prompt";

type InputbarWorkflowCopyValue = number | string;

export type InputbarWorkflowCopyTranslate = (
  key: InputbarWorkflowCopyKey,
  values?: Record<string, InputbarWorkflowCopyValue>,
) => string;

export interface InputbarWorkflowPanelCopy {
  status: {
    error: string;
    pending: string;
    active: string;
    completed: string;
    skipped: string;
    waitingDecision: string;
    autoRunning: string;
    ready: string;
  };
  summary: {
    currentProgress: string;
    defaultActiveTitle: string;
    defaultGateTitle: string;
  };
  action: {
    stopGeneration: string;
  };
  queue: {
    title: string;
    expand: string;
    collapse: string;
    hiddenSuffix: (progressLabel: string, count: number) => string;
    placeholderTitle: string;
    itemMetaWithProgress: (
      status: string,
      completed: number,
      total: number,
    ) => string;
  };
}

export function buildInputbarWorkflowPanelCopy(
  translate: InputbarWorkflowCopyTranslate,
): InputbarWorkflowPanelCopy {
  return {
    status: {
      error: translate("agentChat.inputbar.workflow.status.error"),
      pending: translate("agentChat.inputbar.workflow.status.pending"),
      active: translate("agentChat.inputbar.workflow.status.active"),
      completed: translate("agentChat.inputbar.workflow.status.completed"),
      skipped: translate("agentChat.inputbar.workflow.status.skipped"),
      waitingDecision: translate(
        "agentChat.inputbar.workflow.status.waitingDecision",
      ),
      autoRunning: translate(
        "agentChat.inputbar.workflow.status.autoRunning",
      ),
      ready: translate("agentChat.inputbar.workflow.status.ready"),
    },
    summary: {
      currentProgress: translate(
        "agentChat.inputbar.workflow.summary.currentProgress",
      ),
      defaultActiveTitle: translate(
        "agentChat.inputbar.workflow.summary.defaultActiveTitle",
      ),
      defaultGateTitle: translate(
        "agentChat.inputbar.workflow.summary.defaultGateTitle",
      ),
    },
    action: {
      stopGeneration: translate(
        "agentChat.inputbar.workflow.action.stopGeneration",
      ),
    },
    queue: {
      title: translate("agentChat.inputbar.workflow.queue.title"),
      expand: translate("agentChat.inputbar.workflow.queue.expand"),
      collapse: translate("agentChat.inputbar.workflow.queue.collapse"),
      hiddenSuffix: (progressLabel, count) =>
        translate("agentChat.inputbar.workflow.queue.hiddenSuffix", {
          progressLabel,
          count,
        }),
      placeholderTitle: translate(
        "agentChat.inputbar.workflow.queue.placeholderTitle",
      ),
      itemMetaWithProgress: (status, completed, total) =>
        translate("agentChat.inputbar.workflow.queue.itemMetaWithProgress", {
          status,
          completed,
          total,
        }),
    },
  };
}

export function buildInputbarWorkflowStateCopy(
  translate: InputbarWorkflowCopyTranslate,
): WorkflowInputStateCopy {
  return {
    quickActions: {
      topicOptionsLabel: translate(
        "agentChat.inputbar.workflow.quickAction.topicOptions.label",
      ),
      topicOptionsPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.topicOptions.prompt",
      ),
      topicChooseBLabel: translate(
        "agentChat.inputbar.workflow.quickAction.topicChooseB.label",
      ),
      topicChooseBPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.topicChooseB.prompt",
      ),
      writeFastLabel: translate(
        "agentChat.inputbar.workflow.quickAction.writeFast.label",
      ),
      writeFastPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.writeFast.prompt",
      ),
      writeCoachLabel: translate(
        "agentChat.inputbar.workflow.quickAction.writeCoach.label",
      ),
      writeCoachPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.writeCoach.prompt",
      ),
      publishChecklistLabel: translate(
        "agentChat.inputbar.workflow.quickAction.publishChecklist.label",
      ),
      publishChecklistPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.publishChecklist.prompt",
      ),
      publishNowLabel: translate(
        "agentChat.inputbar.workflow.quickAction.publishNow.label",
      ),
      publishNowPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.publishNow.prompt",
      ),
      nextStepLabel: translate(
        "agentChat.inputbar.workflow.quickAction.nextStep.label",
      ),
      nextStepPrompt: translate(
        "agentChat.inputbar.workflow.quickAction.nextStep.prompt",
      ),
    },
    summary: {
      completed: translate("agentChat.inputbar.workflow.summary.completed"),
      waitingDecision: translate(
        "agentChat.inputbar.workflow.summary.waitingDecision",
      ),
      running: translate("agentChat.inputbar.workflow.summary.running"),
      arranging: translate("agentChat.inputbar.workflow.summary.arranging"),
      errorWithTrailing: (count) =>
        translate("agentChat.inputbar.workflow.summary.errorWithTrailing", {
          count,
        }),
      errorLast: translate("agentChat.inputbar.workflow.summary.errorLast"),
      pendingWithTrailing: (count) =>
        translate("agentChat.inputbar.workflow.summary.pendingWithTrailing", {
          count,
        }),
      pendingLast: translate("agentChat.inputbar.workflow.summary.pendingLast"),
      activeWithTrailing: (count) =>
        translate("agentChat.inputbar.workflow.summary.activeWithTrailing", {
          count,
        }),
      activeLast: translate("agentChat.inputbar.workflow.summary.activeLast"),
    },
    progress: {
      waitingStart: translate(
        "agentChat.inputbar.workflow.progress.waitingStart",
      ),
      completed: (completed, total) =>
        translate("agentChat.inputbar.workflow.progress.completed", {
          completed,
          total,
        }),
    },
  };
}
