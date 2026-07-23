import type { ThreadGoalStatus } from "@limecloud/app-server-client";

export const THREAD_GOAL_STATUS_LABEL_KEYS: Record<ThreadGoalStatus, string> = {
  active: "agentChat.threadGoal.status.active",
  blocked: "agentChat.threadGoal.status.blocked",
  budgetLimited: "agentChat.threadGoal.status.budgetLimited",
  complete: "agentChat.threadGoal.status.complete",
  paused: "agentChat.threadGoal.status.paused",
  usageLimited: "agentChat.threadGoal.status.usageLimited",
};

export const THREAD_GOAL_COPY = {
  actionClear: "agentChat.threadGoal.action.clear",
  actionComplete: "agentChat.threadGoal.action.complete",
  actionPause: "agentChat.threadGoal.action.pause",
  actionResume: "agentChat.threadGoal.action.resume",
  badgeEmpty: "agentChat.threadGoal.badge.empty",
  descriptionEmpty: "agentChat.threadGoal.description.empty",
  formObjectiveLabel: "agentChat.threadGoal.form.objectiveLabel",
  formObjectivePlaceholder: "agentChat.threadGoal.form.objectivePlaceholder",
  inlineCancel: "agentChat.threadGoal.inline.cancel",
  inlineDialogTitleEdit: "agentChat.threadGoal.inline.dialogTitle.edit",
  inlineEdit: "agentChat.threadGoal.inline.edit",
  inlineSave: "agentChat.threadGoal.inline.save",
  loading: "agentChat.toolCall.actionOverride.load.running",
  sectionTitle: "agentChat.threadGoal.sectionTitle",
  title: "agentChat.threadGoal.title",
  toastCleared: "agentChat.threadGoal.toast.cleared",
  toastCompleted: "agentChat.threadGoal.toast.completed",
  toastFailed: "agentChat.threadGoal.toast.failed",
  toastPaused: "agentChat.threadGoal.toast.paused",
  toastResumed: "agentChat.threadGoal.toast.resumed",
  toastSaved: "agentChat.threadGoal.toast.saved",
  tokenTotal: "agentChat.tokenUsage.total",
  validationObjectiveRequired:
    "agentChat.threadGoal.validation.objectiveRequired",
  updatedAt: "agentChat.threadGoal.updatedAt",
  wallTimeMinutes: "agentChat.taskPreview.duration.minutes",
  wallTimeMinutesSeconds: "agentChat.taskPreview.duration.minutesSeconds",
  wallTimeSeconds: "agentChat.taskPreview.duration.seconds",
} as const;
