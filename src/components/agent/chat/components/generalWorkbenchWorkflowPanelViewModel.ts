import type { TFunction } from "i18next";
import type { AgentRun } from "@/lib/api/executionRun";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type {
  TopicBranchItem,
  TopicBranchStatus,
} from "../hooks/useTopicBranchBoard";
import type { SidebarActivityLog } from "../hooks/useThemeContextWorkspace";
import {
  buildWorkflowStepSnapshot,
  buildWorkflowSummaryText,
  formatWorkflowProgressLabel,
  getWorkflowStatusLabel,
} from "../utils/workflowStepPresentation";
import {
  buildCuratedTaskFollowUpDescription,
  buildCuratedTaskLaunchPrompt,
  findCuratedTaskTemplateById,
  resolveCuratedTaskFollowUpActionTarget,
} from "../utils/curatedTaskTemplates";
import { buildCuratedTaskLaunchInputPrefillFromReferenceEntries } from "../utils/curatedTaskReferenceSelection";
import {
  buildReviewFeedbackProjection,
  buildReviewFeedbackProjectionCopy,
  type ReviewFeedbackProjection,
} from "../utils/reviewFeedbackProjection";
import type { CuratedTaskRecommendationSignal } from "../utils/curatedTaskRecommendationSignals";
import {
  buildSceneAppExecutionCuratedTaskFollowUpAction,
  buildSceneAppExecutionReviewPrefillHighlights,
  buildSceneAppExecutionReviewPrefillSnapshot,
  type SceneAppExecutionReviewPrefillSnapshot,
} from "../utils/sceneAppCuratedTaskReference";
import type { GeneralWorkbenchFollowUpActionPayload } from "./generalWorkbenchSidebarContract";
import {
  buildGeneralWorkbenchActivityLogGroups,
  buildGeneralWorkbenchCreationTaskGroups,
  formatGeneralWorkbenchRunMetadata,
  formatGeneralWorkbenchStagesLabel,
  parseGeneralWorkbenchRunMetadataSummary,
  type GeneralWorkbenchCreationTaskGroup,
  type GeneralWorkbenchCreationTaskEvent,
  type GeneralWorkbenchActivityLogGroup,
  type GeneralWorkbenchRunMetadataSummary,
} from "./generalWorkbenchWorkflowData";

export type GeneralWorkbenchWorkflowPanelTranslate = TFunction<
  "agent",
  undefined
>;

export interface GeneralWorkbenchWorkflowStepInput {
  id: string;
  title: string;
  status: StepStatus;
}

export interface GeneralWorkbenchWorkflowPanelViewModel {
  completedSteps: number;
  progressPercent: number;
  groupedActivityLogs: ReturnType<
    typeof buildGeneralWorkbenchActivityLogGroups
  >;
  groupedCreationTaskEvents: ReturnType<
    typeof buildGeneralWorkbenchCreationTaskGroups
  >;
  activeRunStagesLabel: string | null;
  runMetadataText: string;
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
}

export interface GeneralWorkbenchWorkflowCurrentProjection {
  currentWorkflowStep: GeneralWorkbenchWorkflowStepInput | null;
  currentStepTitle: string;
  currentStepIconStatus: StepStatus;
  currentStepStatus: StepStatus;
  currentStepStatusLabel: string;
  remainingSteps: number;
  visibleQueueSteps: GeneralWorkbenchWorkflowStepInput[];
  queueItems: GeneralWorkbenchWorkflowQueueItemProjection[];
  hiddenQueueCount: number;
  completedWorkflowSteps: number;
  workflowSummaryText: string;
  workflowProgressLabel: string;
  remainingText: string;
  progressBarPercent: number;
  progressPercentLabel: string;
  queueHeaderText: string | null;
  completedCountText: string | null;
  completedHintText: string | null;
}

export interface GeneralWorkbenchWorkflowQueueItemProjection {
  id: string;
  title: string;
  status: StepStatus;
  indexLabel: string;
  statusLabel: string;
}

export interface GeneralWorkbenchBranchSectionProjection {
  sectionTitle: string;
  createLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  sortedBranchItems: TopicBranchItem[];
  itemProjections: GeneralWorkbenchBranchItemProjection[];
  currentBranchItem: TopicBranchItem | null;
  secondaryBranchCount: number;
  summaryText: string;
  emptyText: string;
}

export interface GeneralWorkbenchBranchItemProjection {
  id: string;
  title: string;
  status: TopicBranchStatus;
  isCurrent: boolean;
  statusLabel: string;
  metaText: string;
  deleteAriaLabel: string | null;
  hintText: string | null;
  actionItems: Array<{
    kind: "primary" | "secondary";
    status: TopicBranchStatus;
    label: string;
  }>;
  item: TopicBranchItem;
}

export interface GeneralWorkbenchActivityLogProjection {
  key: string;
  status: GeneralWorkbenchActivityLogGroup["status"];
  statusLabel: string;
  title: string;
  timeLabel: string;
  sourceLabel: string | null;
  gateLabel: string | null;
  stepCountLabel: string | null;
  artifactCountLabel: string | null;
  summary: string | null;
  runId: string | null;
  runLabel: string | null;
  runAction: GeneralWorkbenchActivityRunAction | null;
  artifactPaths: string[];
  artifactActions: GeneralWorkbenchActivityArtifactActionGroup[];
  sessionId: string | null;
  steps: Array<{
    id: string;
    name: string;
    timeLabel: string;
    summary: string | null;
  }>;
}

export interface GeneralWorkbenchActivitySectionProjection {
  emptyText: string;
  loadingText: string;
  runDetailTitle: string;
  logs: GeneralWorkbenchActivityLogProjection[];
}

export interface GeneralWorkbenchActivityRunAction {
  runId: string;
  label: string;
}

export type GeneralWorkbenchActivityArtifactActionKind = "reveal" | "open";

export interface GeneralWorkbenchActivityArtifactActionItem {
  kind: GeneralWorkbenchActivityArtifactActionKind;
  label: string;
  ariaLabel: string;
  targetPath: string;
}

export interface GeneralWorkbenchActivityArtifactActionGroup {
  path: string;
  sessionId: string | null;
  actions: GeneralWorkbenchActivityArtifactActionItem[];
}

export interface GeneralWorkbenchRunDetailProjection {
  id: string;
  status: AgentRun["status"];
  statusLabel: string;
  sourceLabel: string;
  badges: string[];
  summary: string;
  detailRows: GeneralWorkbenchRunDetailFactRow[];
  actions: GeneralWorkbenchRunDetailActionItem[];
  artifactPaths: string[];
  artifacts: GeneralWorkbenchRunDetailArtifactProjection[];
}

export interface GeneralWorkbenchRunDetailFactRow {
  key: string;
  label: string;
  value: string;
}

export type GeneralWorkbenchRunDetailActionKind = "copy_id" | "copy_raw";

export interface GeneralWorkbenchRunDetailActionItem {
  kind: GeneralWorkbenchRunDetailActionKind;
  label: string;
  ariaLabel: string;
  copyTarget: string;
}

export type GeneralWorkbenchRunDetailArtifactActionKind =
  | "copy"
  | "reveal"
  | "open";

export interface GeneralWorkbenchRunDetailArtifactActionItem {
  kind: GeneralWorkbenchRunDetailArtifactActionKind;
  label: string;
  ariaLabel: string;
  targetPath: string;
}

export interface GeneralWorkbenchRunDetailArtifactProjection {
  path: string;
  actions: GeneralWorkbenchRunDetailArtifactActionItem[];
}

export interface GeneralWorkbenchFollowUpProjection {
  reviewFeedbackProjection: ReviewFeedbackProjection | null;
  reviewFeedbackFollowUpActionPayload: GeneralWorkbenchFollowUpActionPayload | null;
  sceneAppReviewBaselineSnapshot: SceneAppExecutionReviewPrefillSnapshot | null;
  sceneAppReviewBaselineHighlights: string[];
  curatedTaskFollowUpHintText: string | null;
  shouldShowFollowUpHint: boolean;
}

export interface GeneralWorkbenchCuratedTaskFollowUpActionItem {
  action: string;
  ariaLabel: string;
  payload: GeneralWorkbenchFollowUpActionPayload;
}

export interface GeneralWorkbenchCreationTaskGroupProjection {
  key: string;
  label: string;
  countLabel: string;
  latestTimeLabel: string;
  tasks: Array<{
    key: string;
    title: string;
    timeLabel: string;
    path: string;
    copyTarget: string;
    copyAriaLabel: string;
  }>;
}

export interface GeneralWorkbenchCreationTaskSectionProjection {
  emptyText: string;
  copyLabel: string;
  groups: GeneralWorkbenchCreationTaskGroupProjection[];
}

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

export function buildCreationTaskSectionSummary(params: {
  groups: GeneralWorkbenchCreationTaskGroup[];
  totalCount: number;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): {
  title: string;
  meta: string;
} {
  const { groups, totalCount, t } = params;
  if (totalCount <= 0 || groups.length === 0) {
    return {
      title: t("generalWorkbench.workflow.outputs.summary.emptyTitle"),
      meta: t("generalWorkbench.workflow.outputs.summary.emptyMeta"),
    };
  }

  const latestGroup = groups[0];
  const latestTime =
    latestGroup.latestTimeLabel ||
    t("generalWorkbench.workflow.outputs.summary.latestTimeFallback");
  return {
    title: t("generalWorkbench.workflow.outputs.summary.latestTitle", {
      label: latestGroup.label,
    }),
    meta: t("generalWorkbench.workflow.outputs.summary.meta", {
      time: latestTime,
      count: totalCount,
      groupCount: groups.length,
    }),
  };
}

export function formatCreationTaskCountLabel(
  count: number,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return t("generalWorkbench.workflow.outputs.summary.countLabel", { count });
}

export function buildWorkflowResultHandoffText(params: {
  branchSectionTitle: string;
  hasRecordedOutputs: boolean;
  resultDestination?: string | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string {
  const { branchSectionTitle, hasRecordedOutputs, resultDestination, t } =
    params;
  const normalizedResultDestination = resultDestination?.trim() || null;
  if (normalizedResultDestination) {
    return t("generalWorkbench.workflow.handoff.withDestination", {
      destination: normalizedResultDestination,
      branchTitle: branchSectionTitle,
    });
  }
  return hasRecordedOutputs
    ? t("generalWorkbench.workflow.handoff.defaultContinuing", {
        branchTitle: branchSectionTitle,
      })
    : t("generalWorkbench.workflow.handoff.defaultInitial", {
        branchTitle: branchSectionTitle,
      });
}

export function buildCuratedTaskFollowUpHintText(
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"],
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string | null {
  if (!curatedTask) {
    return null;
  }

  const followUpSummary = buildCuratedTaskFollowUpDescription(
    {
      followUpActions: curatedTask.followUpActions,
    },
    {
      limit: 2,
      prefix: "",
    },
  );

  if (followUpSummary) {
    return curatedTask.taskTitle
      ? t("generalWorkbench.workflow.followUp.hint.withTaskAndSummary", {
          title: curatedTask.taskTitle,
          summary: followUpSummary,
        })
      : t("generalWorkbench.workflow.followUp.hint.summaryOnly", {
          summary: followUpSummary,
        });
  }

  if (curatedTask.taskTitle) {
    return t("generalWorkbench.workflow.followUp.hint.taskOnly", {
      title: curatedTask.taskTitle,
    });
  }

  return null;
}

export function selectLatestReviewFeedbackSignal(
  signals: CuratedTaskRecommendationSignal[],
): CuratedTaskRecommendationSignal | null {
  return (
    signals
      .filter((signal) => signal.source === "review_feedback")
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
  );
}

export function listVisibleCuratedTaskFollowUpActions(
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"],
  limit = 2,
): string[] {
  if (!curatedTask) {
    return [];
  }

  return Array.from(
    new Set(
      curatedTask.followUpActions
        .map((action) => action.trim())
        .filter((action) => action.length > 0),
    ),
  ).slice(0, Math.max(0, limit));
}

export function buildCuratedTaskFollowUpActionItems({
  curatedTask,
  t,
}: {
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchCuratedTaskFollowUpActionItem[] {
  return listVisibleCuratedTaskFollowUpActions(curatedTask)
    .map((action) => {
      const payload = buildCuratedTaskFollowUpActionPayload({
        action,
        curatedTask,
        t,
      });
      if (!payload) {
        return null;
      }

      return {
        action,
        ariaLabel: t("generalWorkbench.workflow.followUp.applyAria", {
          action,
        }),
        payload,
      };
    })
    .filter(
      (
        item,
      ): item is GeneralWorkbenchCuratedTaskFollowUpActionItem =>
        Boolean(item),
    );
}

function buildCuratedTaskFollowUpPrompt(params: {
  action: string;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string {
  const normalizedAction = params.action.trim();
  if (!normalizedAction) {
    return "";
  }

  const taskTitle = params.curatedTask?.taskTitle?.trim();
  if (taskTitle) {
    return params.t("generalWorkbench.workflow.followUp.prompt.withTask", {
      title: taskTitle,
      action: normalizedAction,
    });
  }
  return params.t("generalWorkbench.workflow.followUp.prompt.current", {
    action: normalizedAction,
  });
}

function buildCuratedTaskFollowUpBannerMessage(params: {
  action: string;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  targetTask?: { title: string } | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string | undefined {
  const normalizedAction = params.action.trim();
  if (!normalizedAction) {
    return undefined;
  }

  const targetTaskTitle = params.targetTask?.title?.trim();
  if (targetTaskTitle) {
    return params.t("generalWorkbench.workflow.followUp.banner.withTarget", {
      title: targetTaskTitle,
    });
  }

  const currentTaskTitle = params.curatedTask?.taskTitle?.trim();
  if (currentTaskTitle) {
    return params.t(
      "generalWorkbench.workflow.followUp.banner.withCurrentTask",
      {
        action: normalizedAction,
        title: currentTaskTitle,
      },
    );
  }

  return params.t("generalWorkbench.workflow.followUp.banner.current", {
    action: normalizedAction,
  });
}

export function buildCuratedTaskFollowUpActionPayload(params: {
  action: string;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchFollowUpActionPayload | null {
  const normalizedAction = params.action.trim();
  if (!normalizedAction) {
    return null;
  }

  const currentTaskId = params.curatedTask?.taskId?.trim();
  const currentTaskTitle = params.curatedTask?.taskTitle?.trim();
  const mappedTarget = resolveCuratedTaskFollowUpActionTarget({
    taskId: currentTaskId,
    action: normalizedAction,
  });
  const targetTask = mappedTarget?.task ?? null;
  const referenceEntries = params.curatedTask?.referenceEntries;
  const referenceMemoryIds = params.curatedTask?.referenceMemoryIds;
  const launchInputValues = targetTask
    ? buildCuratedTaskLaunchInputPrefillFromReferenceEntries({
        taskId: targetTask.id,
        inputValues: params.curatedTask?.launchInputValues,
        referenceEntries,
      })
    : params.curatedTask?.launchInputValues;
  const targetPrompt = targetTask
    ? buildCuratedTaskLaunchPrompt({
        task: targetTask,
        inputValues: launchInputValues ?? {},
        referenceEntries,
      }).trim()
    : "";
  const prompt =
    targetTask && targetPrompt
      ? [mappedTarget?.promptHint?.trim(), targetPrompt]
          .filter((segment): segment is string => Boolean(segment))
          .join("\n\n")
      : buildCuratedTaskFollowUpPrompt({
          action: normalizedAction,
          curatedTask: params.curatedTask,
          t: params.t,
        });
  if (!prompt) {
    return null;
  }

  const capabilityRoute =
    (targetTask?.id && targetTask.title.trim()) ||
    (currentTaskId && currentTaskTitle)
      ? {
          kind: "curated_task" as const,
          taskId: targetTask?.id ?? currentTaskId!,
          taskTitle: targetTask?.title.trim() || currentTaskTitle!,
          prompt,
          ...(launchInputValues
            ? {
                launchInputValues,
              }
            : {}),
          ...(referenceMemoryIds
            ? {
                referenceMemoryIds,
              }
            : {}),
          ...(referenceEntries
            ? {
                referenceEntries,
              }
            : {}),
        }
      : undefined;

  return {
    prompt,
    bannerMessage: buildCuratedTaskFollowUpBannerMessage({
      action: normalizedAction,
      curatedTask: params.curatedTask,
      targetTask,
      t: params.t,
    }),
    ...(capabilityRoute
      ? {
          capabilityRoute,
        }
      : {}),
  };
}

export function buildReviewFeedbackFollowUpActionPayload(params: {
  projection: ReviewFeedbackProjection;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchFollowUpActionPayload | null {
  const primarySuggestedTask = params.projection.suggestedTasks[0];
  if (!primarySuggestedTask) {
    return null;
  }

  const referenceEntries = params.curatedTask?.referenceEntries;
  const referenceMemoryIds = params.curatedTask?.referenceMemoryIds;
  const launchInputValues = params.curatedTask?.launchInputValues;
  const sceneAppPayload = buildSceneAppExecutionCuratedTaskFollowUpAction({
    taskId: primarySuggestedTask.taskId,
    inputValues: launchInputValues,
    referenceEntries,
  });
  if (sceneAppPayload) {
    return sceneAppPayload;
  }

  const targetTask = findCuratedTaskTemplateById(primarySuggestedTask.taskId);
  if (!targetTask) {
    return null;
  }

  const prompt = buildCuratedTaskLaunchPrompt({
    task: targetTask,
    inputValues: launchInputValues ?? {},
    referenceEntries,
  }).trim();
  if (!prompt) {
    return null;
  }

  return {
    prompt,
    bannerMessage: params.t(
      "generalWorkbench.workflow.reviewFeedback.followUpBanner",
      {
        title: targetTask.title,
      },
    ),
    capabilityRoute: {
      kind: "curated_task",
      taskId: targetTask.id,
      taskTitle: targetTask.title,
      prompt,
      ...(launchInputValues
        ? {
            launchInputValues,
          }
        : {}),
      ...(referenceMemoryIds
        ? {
            referenceMemoryIds,
          }
        : {}),
      ...(referenceEntries
        ? {
            referenceEntries,
          }
        : {}),
    },
  };
}

export function buildGeneralWorkbenchFollowUpProjection({
  latestReviewSignal,
  runMetadataSummary,
  t,
}: {
  latestReviewSignal: CuratedTaskRecommendationSignal | null;
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchFollowUpProjection {
  const reviewFeedbackProjection = buildReviewFeedbackProjection({
    copy: buildReviewFeedbackProjectionCopy(t),
    signal: latestReviewSignal,
    currentTaskId: runMetadataSummary.curatedTask?.taskId,
    currentTaskTitle: runMetadataSummary.curatedTask?.taskTitle,
  });
  const reviewFeedbackFollowUpActionPayload = reviewFeedbackProjection
    ? buildReviewFeedbackFollowUpActionPayload({
        projection: reviewFeedbackProjection,
        curatedTask: runMetadataSummary.curatedTask,
        t,
      })
    : null;
  const sceneAppReviewBaselineSnapshot = runMetadataSummary.curatedTask?.taskId
    ? buildSceneAppExecutionReviewPrefillSnapshot({
        referenceEntries: runMetadataSummary.curatedTask.referenceEntries,
        taskId: runMetadataSummary.curatedTask.taskId,
      })
    : null;
  const sceneAppReviewBaselineHighlights =
    buildSceneAppExecutionReviewPrefillHighlights(
      sceneAppReviewBaselineSnapshot,
    );
  const curatedTaskFollowUpHintText = buildCuratedTaskFollowUpHintText(
    runMetadataSummary.curatedTask,
    t,
  );

  return {
    reviewFeedbackProjection,
    reviewFeedbackFollowUpActionPayload,
    sceneAppReviewBaselineSnapshot,
    sceneAppReviewBaselineHighlights,
    curatedTaskFollowUpHintText,
    shouldShowFollowUpHint: Boolean(
      reviewFeedbackProjection ||
        curatedTaskFollowUpHintText ||
        sceneAppReviewBaselineSnapshot,
    ),
  };
}

export function getCreationTaskTitle(
  path: string,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  const normalized = path.trim();
  if (!normalized) {
    return t("generalWorkbench.workflow.outputs.summary.untitledTask");
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

export function buildGeneralWorkbenchCreationTaskGroupProjection({
  group,
  t,
}: {
  group: GeneralWorkbenchCreationTaskGroup;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchCreationTaskGroupProjection {
  return {
    key: group.key,
    label: group.label,
    countLabel: formatCreationTaskCountLabel(group.tasks.length, t),
    latestTimeLabel: group.latestTimeLabel,
    tasks: group.tasks.map((task) => ({
      key: `${task.taskId}-${task.path}`,
      title: getCreationTaskTitle(task.path, t),
      timeLabel: task.timeLabel,
      path: task.path,
      copyTarget: task.absolutePath || task.path,
      copyAriaLabel: task.absolutePath
        ? t("generalWorkbench.workflow.outputs.copyAbsolutePathAria", {
            taskId: task.taskId,
          })
        : t("generalWorkbench.workflow.outputs.copyPathAria", {
            taskId: task.taskId,
          }),
    })),
  };
}

export function buildGeneralWorkbenchCreationTaskSectionProjection({
  groups,
  t,
}: {
  groups: GeneralWorkbenchCreationTaskGroup[];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchCreationTaskSectionProjection {
  return {
    emptyText: t("generalWorkbench.workflow.outputs.empty"),
    copyLabel: t("generalWorkbench.workflow.outputs.copyPath"),
    groups: groups.map((group) =>
      buildGeneralWorkbenchCreationTaskGroupProjection({
        group,
        t,
      }),
    ),
  };
}

export function getBranchStatusText(
  status: TopicBranchStatus,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  if (status === "in_progress") {
    return t("generalWorkbench.workflow.branch.status.inProgress");
  }
  if (status === "pending") {
    return t("generalWorkbench.workflow.branch.status.pending");
  }
  if (status === "merged") {
    return t("generalWorkbench.workflow.branch.status.merged");
  }
  return t("generalWorkbench.workflow.branch.status.candidate");
}

export function getBranchSectionTitle(
  isVersionMode: boolean,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.sectionTitle.version")
    : t("generalWorkbench.workflow.branch.sectionTitle.draft");
}

export function getBranchCreateLabel(
  isVersionMode: boolean,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.create.version")
    : t("generalWorkbench.workflow.branch.create.draft");
}

export function getBranchPrimaryActionLabel(
  isVersionMode: boolean,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.primaryAction.version")
    : t("generalWorkbench.workflow.branch.primaryAction.draft");
}

export function getBranchSecondaryActionLabel(
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return t("generalWorkbench.workflow.branch.secondaryAction");
}

export function getEmptyBranchText(
  isVersionMode: boolean,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.empty.version")
    : t("generalWorkbench.workflow.branch.empty.draft");
}

export function getBranchMetaText({
  item,
  isVersionMode,
  t,
}: {
  item: TopicBranchItem;
  isVersionMode: boolean;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string {
  if (item.isCurrent) {
    return isVersionMode
      ? t("generalWorkbench.workflow.branch.meta.current.version")
      : t("generalWorkbench.workflow.branch.meta.current.draft");
  }
  if (item.status === "merged") {
    return isVersionMode
      ? t("generalWorkbench.workflow.branch.meta.merged.version")
      : t("generalWorkbench.workflow.branch.meta.merged.draft");
  }
  if (item.status === "pending") {
    return t("generalWorkbench.workflow.branch.meta.pending");
  }
  if (item.status === "candidate") {
    return isVersionMode
      ? t("generalWorkbench.workflow.branch.meta.candidate.version")
      : t("generalWorkbench.workflow.branch.meta.candidate.draft");
  }
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.meta.inProgress.version")
    : t("generalWorkbench.workflow.branch.meta.inProgress.draft");
}

export function buildBranchSectionSummaryText(params: {
  currentBranch: TopicBranchItem | null;
  relatedCount: number;
  isVersionMode: boolean;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string {
  const { currentBranch, relatedCount, isVersionMode, t } = params;
  if (!currentBranch) {
    return isVersionMode
      ? t("generalWorkbench.workflow.branch.summary.empty.version")
      : t("generalWorkbench.workflow.branch.summary.empty.draft");
  }
  if (relatedCount <= 0) {
    return isVersionMode
      ? t("generalWorkbench.workflow.branch.summary.single.version", {
          title: currentBranch.title,
        })
      : t("generalWorkbench.workflow.branch.summary.single.draft", {
          title: currentBranch.title,
        });
  }
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.summary.multiple.version", {
        title: currentBranch.title,
        count: relatedCount,
      })
    : t("generalWorkbench.workflow.branch.summary.multiple.draft", {
        title: currentBranch.title,
        count: relatedCount,
      });
}

export function sortGeneralWorkbenchBranchItems(
  branchItems: TopicBranchItem[],
): TopicBranchItem[] {
  const statusPriority: Record<TopicBranchStatus, number> = {
    in_progress: 0,
    pending: 1,
    candidate: 2,
    merged: 3,
  };

  return [...branchItems].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    const statusDiff =
      statusPriority[left.status] - statusPriority[right.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

export function buildGeneralWorkbenchBranchItemProjection({
  item,
  isVersionMode,
  primaryActionLabel,
  secondaryActionLabel,
  t,
}: {
  item: TopicBranchItem;
  isVersionMode: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchBranchItemProjection {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    isCurrent: item.isCurrent,
    statusLabel: item.isCurrent
      ? t("generalWorkbench.workflow.branch.currentFocus")
      : getBranchStatusText(item.status, t),
    metaText: getBranchMetaText({ item, isVersionMode, t }),
    deleteAriaLabel: isVersionMode
      ? null
      : t("generalWorkbench.workflow.branch.deleteAria"),
    hintText: item.isCurrent
      ? null
      : t("generalWorkbench.workflow.branch.focusFirstHint"),
    actionItems: item.isCurrent
      ? [
          {
            kind: "primary",
            status: "merged",
            label: primaryActionLabel,
          },
          {
            kind: "secondary",
            status: "pending",
            label: secondaryActionLabel,
          },
        ]
      : [],
    item,
  };
}

export function buildGeneralWorkbenchBranchSectionProjection({
  branchItems,
  isVersionMode,
  t,
}: {
  branchItems: TopicBranchItem[];
  isVersionMode: boolean;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchBranchSectionProjection {
  const sortedBranchItems = sortGeneralWorkbenchBranchItems(branchItems);
  const currentBranchItem =
    sortedBranchItems.find((item) => item.isCurrent) ??
    sortedBranchItems[0] ??
    null;
  const secondaryBranchCount = Math.max(
    sortedBranchItems.length - (currentBranchItem ? 1 : 0),
    0,
  );
  const primaryActionLabel = getBranchPrimaryActionLabel(isVersionMode, t);
  const secondaryActionLabel = getBranchSecondaryActionLabel(t);
  const itemProjections = sortedBranchItems.map((item) =>
    buildGeneralWorkbenchBranchItemProjection({
      item,
      isVersionMode,
      primaryActionLabel,
      secondaryActionLabel,
      t,
    }),
  );

  return {
    sectionTitle: getBranchSectionTitle(isVersionMode, t),
    createLabel: getBranchCreateLabel(isVersionMode, t),
    primaryActionLabel,
    secondaryActionLabel,
    sortedBranchItems,
    itemProjections,
    currentBranchItem,
    secondaryBranchCount,
    emptyText: getEmptyBranchText(isVersionMode, t),
    summaryText: buildBranchSectionSummaryText({
      currentBranch: currentBranchItem,
      relatedCount: secondaryBranchCount,
      isVersionMode,
      t,
    }),
  };
}

export function formatGateLabel(
  t: GeneralWorkbenchWorkflowPanelTranslate,
  gateKey?: SidebarActivityLog["gateKey"],
): string | null {
  if (!gateKey || gateKey === "idle") {
    return null;
  }
  if (gateKey === "topic_select") {
    return t("generalWorkbench.workflow.activity.gate.topicSelect");
  }
  if (gateKey === "write_mode") {
    return t("generalWorkbench.workflow.activity.gate.writeMode");
  }
  if (gateKey === "publish_confirm") {
    return t("generalWorkbench.workflow.activity.gate.publishConfirm");
  }
  return null;
}

export function formatRunIdShort(runId?: string): string | null {
  const trimmed = runId?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…`;
}

export function formatRunStatusLabel(
  t: GeneralWorkbenchWorkflowPanelTranslate,
  status: AgentRun["status"],
): string {
  if (status === "queued") {
    return t("generalWorkbench.workflow.runDetail.status.queued");
  }
  if (status === "running") {
    return t("generalWorkbench.workflow.runDetail.status.running");
  }
  if (status === "success") {
    return t("generalWorkbench.workflow.runDetail.status.success");
  }
  if (status === "error") {
    return t("generalWorkbench.workflow.runDetail.status.error");
  }
  if (status === "canceled") {
    return t("generalWorkbench.workflow.runDetail.status.canceled");
  }
  if (status === "timeout") {
    return t("generalWorkbench.workflow.runDetail.status.timeout");
  }
  return status;
}

export function getPrimaryActivityLog(
  group: ReturnType<typeof buildGeneralWorkbenchActivityLogGroups>[number],
):
  | ReturnType<typeof buildGeneralWorkbenchActivityLogGroups>[number]["logs"][number]
  | undefined {
  return group.logs.find((log) => log.source === "skill") || group.logs[0];
}

export function buildActivityStepSummary(
  log: GeneralWorkbenchActivityLogGroup["logs"][number],
): string | null {
  const parts = [log.inputSummary, log.outputSummary]
    .map((item) => item?.trim() || "")
    .filter((item) => item.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(" → ");
}

export function formatActivityStatusLabel(
  t: GeneralWorkbenchWorkflowPanelTranslate,
  status: ReturnType<typeof buildGeneralWorkbenchActivityLogGroups>[number]["status"],
): string {
  if (status === "running") {
    return t("generalWorkbench.workflow.activity.status.running");
  }
  if (status === "failed") {
    return t("generalWorkbench.workflow.activity.status.failed");
  }
  return t("generalWorkbench.workflow.activity.status.recorded");
}

export function formatActivitySourceLabel(
  t: GeneralWorkbenchWorkflowPanelTranslate,
  source?: string,
): string | null {
  const normalized = source?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized === "skill") {
    return t("generalWorkbench.workflow.activity.source.skill");
  }
  if (normalized === "tool") {
    return t("generalWorkbench.workflow.activity.source.tool");
  }
  if (normalized === "workflow") {
    return t("generalWorkbench.workflow.activity.source.workflow");
  }
  return normalized;
}

export function buildRunDetailSummaryText(params: {
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
  activeRunStagesLabel?: string | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): string {
  const { runMetadataSummary, activeRunStagesLabel, t } = params;
  const parts: string[] = [];
  if (runMetadataSummary.curatedTask?.taskTitle) {
    parts.push(
      t("generalWorkbench.workflow.runDetail.summary.curatedTask", {
        title: runMetadataSummary.curatedTask.taskTitle,
      }),
    );
  }
  if (activeRunStagesLabel) {
    parts.push(activeRunStagesLabel);
  }
  if (runMetadataSummary.workflow) {
    parts.push(
      t("generalWorkbench.workflow.runDetail.summary.workflow", {
        workflow: runMetadataSummary.workflow,
      }),
    );
  }
  if (runMetadataSummary.artifactPaths.length > 0) {
    parts.push(
      runMetadataSummary.artifactPaths.length === 1
        ? t("generalWorkbench.workflow.runDetail.summary.artifactPath", {
            path: runMetadataSummary.artifactPaths[0],
          })
        : t("generalWorkbench.workflow.runDetail.summary.artifactCount", {
            count: runMetadataSummary.artifactPaths.length,
          }),
    );
  }
  return (
    parts.join(" · ") || t("generalWorkbench.workflow.runDetail.summary.empty")
  );
}

export function buildGeneralWorkbenchRunDetailArtifactProjection({
  artifactPath,
  t,
}: {
  artifactPath: string;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchRunDetailArtifactProjection {
  return {
    path: artifactPath,
    actions: [
      {
        kind: "copy",
        label: t("generalWorkbench.workflow.runDetail.copyArtifact"),
        ariaLabel: t("generalWorkbench.workflow.runDetail.copyArtifactAria", {
          path: artifactPath,
        }),
        targetPath: artifactPath,
      },
      {
        kind: "reveal",
        label: t("generalWorkbench.workflow.runDetail.revealArtifact"),
        ariaLabel: t("generalWorkbench.workflow.runDetail.revealArtifactAria", {
          path: artifactPath,
        }),
        targetPath: artifactPath,
      },
      {
        kind: "open",
        label: t("generalWorkbench.workflow.runDetail.openArtifact"),
        ariaLabel: t("generalWorkbench.workflow.runDetail.openArtifactAria", {
          path: artifactPath,
        }),
        targetPath: artifactPath,
      },
    ],
  };
}

export function buildGeneralWorkbenchRunDetailActions({
  runId,
  runMetadataText,
  t,
}: {
  runId: string;
  runMetadataText: string;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchRunDetailActionItem[] {
  return [
    {
      kind: "copy_id",
      label: t("generalWorkbench.workflow.runDetail.copyId"),
      ariaLabel: t("generalWorkbench.workflow.runDetail.copyIdAria"),
      copyTarget: runId,
    },
    {
      kind: "copy_raw",
      label: t("generalWorkbench.workflow.runDetail.copyRaw"),
      ariaLabel: t("generalWorkbench.workflow.runDetail.copyRawAria"),
      copyTarget: runMetadataText,
    },
  ];
}

export function buildGeneralWorkbenchRunDetailFactRows({
  runMetadataText,
  t,
}: {
  runMetadataText: string;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchRunDetailFactRow[] {
  const workflowRecord = readWorkflowMetadataRecord(runMetadataText);
  if (!workflowRecord) {
    return [];
  }

  const rows: GeneralWorkbenchRunDetailFactRow[] = [];
  const failureValue = readWorkflowFailureValue(workflowRecord);
  if (failureValue) {
    rows.push({
      key: "workflow-failure",
      label: t("generalWorkbench.workflow.runDetail.workflowFailure"),
      value: failureValue,
    });
  }

  const retryValue = readWorkflowRetryValue(workflowRecord);
  if (retryValue) {
    rows.push({
      key: "workflow-retry",
      label: t("generalWorkbench.workflow.runDetail.workflowRetry"),
      value: retryValue,
    });
  }

  const waitingActionValue = readWorkflowWaitingActionValue(workflowRecord, t);
  if (waitingActionValue) {
    rows.push({
      key: "workflow-waiting-action",
      label: t("generalWorkbench.workflow.runDetail.workflowWaitingAction"),
      value: waitingActionValue,
    });
  }

  return rows;
}

function readWorkflowMetadataRecord(
  raw: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (
      asPlainRecord(parsed.workflow_read_model) ??
      asPlainRecord(parsed.workflowReadModel)
    );
  } catch {
    return null;
  }
}

function readWorkflowFailureValue(
  workflowRecord: Record<string, unknown>,
): string | null {
  const runFailure = readFailureText(asPlainRecord(workflowRecord.failure));
  if (runFailure) {
    return runFailure;
  }

  const failedStep = readWorkflowStepRecords(workflowRecord).find((step) => {
    const status = readStringField(step, ["status"])?.toLowerCase();
    return status === "failed" || status === "failure" || status === "error";
  });
  if (!failedStep) {
    return null;
  }

  const stepTitle =
    readStringField(failedStep, ["title", "stepTitle", "step_title", "id"]) ??
    null;
  const failureText = readFailureText(asPlainRecord(failedStep.failure));
  if (!failureText && !stepTitle) {
    return null;
  }
  return [stepTitle, failureText].filter(Boolean).join(": ");
}

function readWorkflowRetryValue(
  workflowRecord: Record<string, unknown>,
): string | null {
  const retryRecord =
    asPlainRecord(workflowRecord.retry) ??
    readWorkflowStepRecords(workflowRecord)
      .map((step) => asPlainRecord(step.retry))
      .find((item): item is Record<string, unknown> => Boolean(item));
  if (!retryRecord) {
    return null;
  }

  const sourceTurnId = readStringField(retryRecord, [
    "sourceTurnId",
    "source_turn_id",
  ]);
  const rescheduledTurnId = readStringField(retryRecord, [
    "rescheduledTurnId",
    "rescheduled_turn_id",
  ]);
  const reason = readStringField(retryRecord, [
    "reason",
    "reasonCode",
    "reason_code",
  ]);
  const linkage =
    sourceTurnId && rescheduledTurnId
      ? `${sourceTurnId} -> ${rescheduledTurnId}`
      : (rescheduledTurnId ?? sourceTurnId);
  return [linkage, reason].filter(Boolean).join(" · ") || null;
}

function readWorkflowWaitingActionValue(
  workflowRecord: Record<string, unknown>,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string | null {
  const actions = readRecordArray(workflowRecord.actions)
    .map((action) => {
      const actionType = readWorkflowActionPresentationType(action);
      const requestId = readStringField(action, ["requestId", "request_id"]);
      const stepId = readStringField(action, ["stepId", "step_id"]);
      return [formatWorkflowActionTypeLabel(actionType, t), requestId, stepId]
        .filter(Boolean)
        .join(" / ");
    })
    .filter((item) => item.length > 0);
  if (actions.length > 0) {
    return actions.join(", ");
  }

  const waitingSteps = readWorkflowStepRecords(workflowRecord)
    .filter((step) => {
      const status = readStringField(step, ["status"])?.toLowerCase();
      return (
        status === "waiting" ||
        status === "waiting_action" ||
        status === "waitingaction" ||
        status === "waiting_permission"
      );
    })
    .map((step) => {
      const title = readStringField(step, ["title", "stepTitle", "step_title"]);
      const requestId = readStringField(step, ["requestId", "request_id"]);
      const actionType = readStringField(step, [
        "agentActionType",
        "agent_action_type",
      ]);
      return [title, formatWorkflowActionTypeLabel(actionType, t), requestId]
        .filter(Boolean)
        .join(" / ");
    })
    .filter((item) => item.length > 0);
  return waitingSteps.join(", ") || null;
}

function readWorkflowActionPresentationType(
  action: Record<string, unknown>,
): string | null {
  const agentActionType = readStringField(action, [
    "agentActionType",
    "agent_action_type",
  ]);
  if (agentActionType) {
    return agentActionType;
  }
  const actionType = readStringField(action, [
    "actionType",
    "action_type",
    "type",
  ]);
  return actionType === "respond" ? null : actionType;
}

function formatWorkflowActionTypeLabel(
  actionType: string | null,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string | null {
  if (!actionType) {
    return null;
  }
  const normalized = actionType.trim().toLowerCase();
  if (normalized === "ask_user") {
    return t("generalWorkbench.workflow.runDetail.waitingAction.askUser");
  }
  if (normalized === "elicitation") {
    return t("generalWorkbench.workflow.runDetail.waitingAction.elicitation");
  }
  if (normalized === "tool_confirmation") {
    return t(
      "generalWorkbench.workflow.runDetail.waitingAction.toolConfirmation",
    );
  }
  return actionType;
}

function readWorkflowStepRecords(
  workflowRecord: Record<string, unknown>,
): Record<string, unknown>[] {
  return readRecordArray(workflowRecord.steps);
}

function readFailureText(record: Record<string, unknown> | null): string | null {
  if (!record) {
    return null;
  }
  return readStringField(record, [
    "message",
    "errorMessage",
    "error_message",
    "reason",
    "reasonCode",
    "reason_code",
    "code",
    "category",
    "failureCategory",
    "failure_category",
  ]);
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map(asPlainRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function readStringField(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function buildGeneralWorkbenchActivityArtifactActionGroup({
  artifactPath,
  sessionId,
  t,
}: {
  artifactPath: string;
  sessionId?: string | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchActivityArtifactActionGroup {
  return {
    path: artifactPath,
    sessionId: sessionId ?? null,
    actions: [
      {
        kind: "reveal",
        label: t("generalWorkbench.workflow.activity.revealArtifact"),
        ariaLabel: t("generalWorkbench.workflow.activity.revealArtifactAria", {
          path: artifactPath,
        }),
        targetPath: artifactPath,
      },
      {
        kind: "open",
        label: t("generalWorkbench.workflow.activity.openArtifact"),
        ariaLabel: t("generalWorkbench.workflow.activity.openArtifactAria", {
          path: artifactPath,
        }),
        targetPath: artifactPath,
      },
    ],
  };
}

export function buildActivitySummary(
  group: ReturnType<typeof buildGeneralWorkbenchActivityLogGroups>[number],
  gateLabel: string | null,
  t: GeneralWorkbenchWorkflowPanelTranslate,
): string {
  const parts: string[] = [];
  if (gateLabel) {
    parts.push(gateLabel);
  }
  if (group.artifactPaths.length > 0) {
    parts.push(
      group.artifactPaths.length === 1
        ? t("generalWorkbench.workflow.activity.summary.artifactPath", {
            path: group.artifactPaths[0],
          })
        : t("generalWorkbench.workflow.activity.summary.artifactCount", {
            count: group.artifactPaths.length,
          }),
    );
  }
  if (group.logs.length > 1) {
    parts.push(
      t("generalWorkbench.workflow.activity.summary.stepCount", {
        count: group.logs.length,
      }),
    );
  }
  return parts.join(" · ");
}

export function buildActivitySectionSummary(params: {
  groups: ReturnType<typeof buildGeneralWorkbenchActivityLogGroups>;
  activeRunDetail?: Pick<AgentRun, "id"> | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): {
  title: string;
  meta: string;
} {
  const { groups, activeRunDetail, t } = params;
  if (groups.length === 0) {
    return {
      title: t("generalWorkbench.workflow.activity.summary.emptyTitle"),
      meta: t("generalWorkbench.workflow.activity.summary.emptyMeta"),
    };
  }

  const latestGroup = groups[0];
  const primaryLog = getPrimaryActivityLog(latestGroup);
  const gateLabel = formatGateLabel(t, latestGroup.gateKey);
  const sourceLabel = formatActivitySourceLabel(t, latestGroup.source);
  const activeRunLabel = activeRunDetail?.id
    ? formatRunIdShort(activeRunDetail.id) || activeRunDetail.id
    : null;
  const metaParts = [
    latestGroup.timeLabel ||
      t("generalWorkbench.workflow.activity.summary.latestTimeFallback"),
    formatActivityStatusLabel(t, latestGroup.status),
    sourceLabel,
    gateLabel,
    latestGroup.logs.length > 1
      ? t("generalWorkbench.workflow.activity.summary.stepCount", {
          count: latestGroup.logs.length,
        })
      : null,
    latestGroup.artifactPaths.length > 0
      ? t("generalWorkbench.workflow.activity.summary.artifactBadge", {
          count: latestGroup.artifactPaths.length,
        })
      : null,
    activeRunLabel
      ? t("generalWorkbench.workflow.activity.summary.activeRun", {
          run: activeRunLabel,
        })
      : null,
  ].filter(Boolean);

  return {
    title: t("generalWorkbench.workflow.activity.summary.latestTitle", {
      name:
        primaryLog?.name ||
        t("generalWorkbench.workflow.activity.summary.nameFallback"),
    }),
    meta: metaParts.join(" · "),
  };
}

export function buildGeneralWorkbenchActivityLogProjection({
  group,
  t,
}: {
  group: GeneralWorkbenchActivityLogGroup;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchActivityLogProjection {
  const gateLabel = formatGateLabel(t, group.gateKey);
  const runLabel = formatRunIdShort(group.runId);
  const sourceLabel = formatActivitySourceLabel(t, group.source);
  const primaryLog = getPrimaryActivityLog(group);
  const stepCountLabel =
    group.logs.length > 1
      ? t("generalWorkbench.workflow.activity.summary.stepCount", {
          count: group.logs.length,
        })
      : null;
  const artifactCountLabel =
    group.artifactPaths.length > 0
      ? t("generalWorkbench.workflow.activity.summary.artifactBadge", {
          count: group.artifactPaths.length,
        })
      : null;

  return {
    key: group.key,
    status: group.status,
    statusLabel: formatActivityStatusLabel(t, group.status),
    title:
      primaryLog?.name ||
      t("generalWorkbench.workflow.activity.summary.nameFallback"),
    timeLabel: group.timeLabel,
    sourceLabel,
    gateLabel,
    stepCountLabel,
    artifactCountLabel,
    summary: buildActivitySummary(group, gateLabel, t) || null,
    runId: group.runId ?? null,
    runLabel: group.runId ? runLabel || group.runId : null,
    runAction: group.runId
      ? {
          runId: group.runId,
          label: t("generalWorkbench.workflow.activity.viewRun", {
            run: runLabel || group.runId,
          }),
        }
      : null,
    artifactPaths: group.runId ? [] : group.artifactPaths,
    artifactActions: group.runId
      ? []
      : group.artifactPaths.map((artifactPath) =>
          buildGeneralWorkbenchActivityArtifactActionGroup({
            artifactPath,
            sessionId: group.sessionId,
            t,
          }),
        ),
    sessionId: group.sessionId ?? null,
    steps: group.logs.map((log) => ({
      id: log.id,
      name: log.name,
      timeLabel: log.timeLabel,
      summary: buildActivityStepSummary(log),
    })),
  };
}

export function buildGeneralWorkbenchActivitySectionProjection({
  groups,
  t,
}: {
  groups: GeneralWorkbenchActivityLogGroup[];
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchActivitySectionProjection {
  return {
    emptyText: t("generalWorkbench.workflow.activity.empty"),
    loadingText: t("generalWorkbench.workflow.runDetail.loading"),
    runDetailTitle: t("generalWorkbench.workflow.runDetail.title"),
    logs: groups.map((group) =>
      buildGeneralWorkbenchActivityLogProjection({
        group,
        t,
      }),
    ),
  };
}

export function buildGeneralWorkbenchRunDetailProjection({
  activeRunDetail,
  runMetadataSummary,
  runMetadataText,
  activeRunStagesLabel,
  t,
}: {
  activeRunDetail: Pick<AgentRun, "id" | "source" | "status">;
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
  runMetadataText: string;
  activeRunStagesLabel?: string | null;
  t: GeneralWorkbenchWorkflowPanelTranslate;
}): GeneralWorkbenchRunDetailProjection {
  const sourceLabel =
    formatActivitySourceLabel(t, activeRunDetail.source) ||
    t("generalWorkbench.workflow.runDetail.fallbackSource");
  const badges = [
    sourceLabel,
    runMetadataSummary.workflow,
    runMetadataSummary.curatedTask?.taskTitle,
    runMetadataSummary.artifactPaths.length > 0
      ? t("generalWorkbench.workflow.runDetail.artifactCount", {
          count: runMetadataSummary.artifactPaths.length,
        })
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    id: activeRunDetail.id,
    status: activeRunDetail.status,
    statusLabel: formatRunStatusLabel(t, activeRunDetail.status),
    sourceLabel,
    badges,
    summary: buildRunDetailSummaryText({
      runMetadataSummary,
      activeRunStagesLabel,
      t,
    }),
    detailRows: buildGeneralWorkbenchRunDetailFactRows({
      runMetadataText,
      t,
    }),
    actions: buildGeneralWorkbenchRunDetailActions({
      runId: activeRunDetail.id,
      runMetadataText,
      t,
    }),
    artifactPaths: runMetadataSummary.artifactPaths,
    artifacts: runMetadataSummary.artifactPaths.map((artifactPath) =>
      buildGeneralWorkbenchRunDetailArtifactProjection({
        artifactPath,
        t,
      }),
    ),
  };
}

export function buildGeneralWorkbenchWorkflowPanelViewModel({
  workflowSteps,
  activityLogs,
  creationTaskEvents,
  activeRunMetadata,
}: {
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  activityLogs: SidebarActivityLog[];
  creationTaskEvents: GeneralWorkbenchCreationTaskEvent[];
  activeRunMetadata: string | null;
}): GeneralWorkbenchWorkflowPanelViewModel {
  const completedSteps = countCompletedWorkflowSteps(workflowSteps);
  const runMetadataSummary =
    parseGeneralWorkbenchRunMetadataSummary(activeRunMetadata);

  return {
    completedSteps,
    progressPercent: calculateWorkflowProgressPercent({
      completedSteps,
      totalSteps: workflowSteps.length,
    }),
    groupedActivityLogs: buildGeneralWorkbenchActivityLogGroups(activityLogs),
    groupedCreationTaskEvents:
      buildGeneralWorkbenchCreationTaskGroups(creationTaskEvents),
    runMetadataSummary,
    runMetadataText: formatGeneralWorkbenchRunMetadata(activeRunMetadata),
    activeRunStagesLabel: formatGeneralWorkbenchStagesLabel(
      runMetadataSummary.stages,
    ),
  };
}
