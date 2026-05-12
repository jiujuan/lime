import React, { memo, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type { AgentRun } from "@/lib/api/executionRun";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  TopicBranchItem,
  TopicBranchStatus,
} from "../hooks/useTopicBranchBoard";
import type { SidebarActivityLog } from "../hooks/useThemeContextWorkspace";
import {
  buildCuratedTaskFollowUpDescription,
  buildCuratedTaskLaunchPrompt,
  findCuratedTaskTemplateById,
  resolveCuratedTaskFollowUpActionTarget,
} from "../utils/curatedTaskTemplates";
import {
  listCuratedTaskRecommendationSignals,
  subscribeCuratedTaskRecommendationSignalsChanged,
} from "../utils/curatedTaskRecommendationSignals";
import { buildCuratedTaskLaunchInputPrefillFromReferenceEntries } from "../utils/curatedTaskReferenceSelection";
import {
  buildReviewFeedbackProjectionCopy,
  buildReviewFeedbackProjection,
  formatReviewFeedbackTemplate,
  type ReviewFeedbackProjection,
} from "../utils/reviewFeedbackProjection";
import {
  buildSceneAppExecutionCuratedTaskFollowUpAction,
  buildSceneAppExecutionReviewPrefillHighlights,
  buildSceneAppExecutionReviewPrefillSnapshot,
  type SceneAppExecutionReviewPrefillSnapshot,
} from "../utils/sceneAppCuratedTaskReference";
import {
  buildWorkflowStepSnapshot,
  buildWorkflowSummaryText,
  formatWorkflowProgressLabel,
  getWorkflowStatusLabel,
} from "../utils/workflowStepPresentation";
import type {
  GeneralWorkbenchActivityLogGroup,
  GeneralWorkbenchCreationTaskGroup,
  GeneralWorkbenchRunMetadataSummary,
} from "./generalWorkbenchWorkflowData";
import type { GeneralWorkbenchFollowUpActionPayload } from "./generalWorkbenchSidebarContract";

type AgentTranslate = TFunction<"agent", undefined>;

interface GeneralWorkbenchWorkflowPanelProps {
  isVersionMode: boolean;
  projectId?: string | null;
  sessionId?: string | null;
  onNewTopic: () => void;
  onSwitchTopic: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  branchItems: TopicBranchItem[];
  onSetBranchStatus: (topicId: string, status: TopicBranchStatus) => void;
  onApplyFollowUpAction?: (
    payload: GeneralWorkbenchFollowUpActionPayload,
  ) => void;
  workflowSteps: Array<{ id: string; title: string; status: StepStatus }>;
  completedSteps: number;
  progressPercent: number;
  onAddImage?: () => Promise<void> | void;
  onImportDocument?: () => Promise<void> | void;
  showBranchRecords: boolean;
  onToggleBranchRecords: () => void;
  creationTaskEventsCount: number;
  showCreationTasks: boolean;
  onToggleCreationTasks: () => void;
  groupedCreationTaskEvents: GeneralWorkbenchCreationTaskGroup[];
  showActivityLogs: boolean;
  onToggleActivityLogs: () => void;
  groupedActivityLogs: GeneralWorkbenchActivityLogGroup[];
  onViewRunDetail?: (runId: string) => void;
  activeRunDetail?: AgentRun | null;
  activeRunDetailLoading?: boolean;
  activeRunStagesLabel?: string | null;
  runMetadataText: string;
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
  onCopyText: (text: string) => Promise<void> | void;
  onRevealArtifactInFinder: (
    artifactPath: string,
    sessionId?: string | null,
  ) => Promise<void> | void;
  onOpenArtifactWithDefaultApp: (
    artifactPath: string,
    sessionId?: string | null,
  ) => Promise<void> | void;
}

const WORKFLOW_SECTION_CLASSNAME = "border-b border-slate-200/70 px-4 py-3";

const WORKFLOW_SECTION_TITLE_CLASSNAME =
  "mb-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-500";

const WORKFLOW_SECTION_BADGE_CLASSNAME =
  "inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500";

const WORKFLOW_NEW_TOPIC_BUTTON_CLASSNAME =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900";

const WORKFLOW_STEP_LIST_CLASSNAME = "mt-3 flex flex-col gap-2";

const WORKFLOW_TASK_SUMMARY_CLASSNAME =
  "mt-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5";

const WORKFLOW_TASK_SUMMARY_PILL_CLASSNAME =
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500";

const WORKFLOW_RESULT_HANDOFF_HINT_CLASSNAME =
  "mt-2 rounded-[12px] border border-slate-200/80 bg-white/90 px-3 py-2";

const TOGGLE_BUTTON_CLASSNAME =
  "inline-flex items-center text-slate-500 transition-colors hover:text-slate-900";

const WORKFLOW_INLINE_LABEL_CLASSNAME =
  "text-[10px] font-semibold text-slate-500";

const WORKFLOW_QUEUE_HEADER_CLASSNAME =
  "mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-500";

const WORKFLOW_QUEUE_LIST_CLASSNAME = "mt-2 flex flex-col gap-1.5";

function WorkflowQueueRow({
  $status,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  $status: StepStatus;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-2.5 py-2",
        $status === "error" && "border-rose-200/80 bg-rose-50/50",
        $status === "active" && "border-sky-200/80 bg-sky-50/40",
        $status === "pending" && "border-slate-200/80 bg-white",
        $status === "completed" && "border-slate-200/80 bg-slate-50/70",
        $status === "skipped" && "border-slate-200/80 bg-slate-50/70",
        className,
      )}
      {...props}
    />
  );
}

function createDiv(baseClassName: string) {
  return function ClassedDiv({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<"div">) {
    return <div className={cn(baseClassName, className)} {...props} />;
  };
}

function createButton(baseClassName: string) {
  return function ClassedButton({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<"button">) {
    return <button className={cn(baseClassName, className)} {...props} />;
  };
}

function createCode(baseClassName: string) {
  return function ClassedCode({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<"code">) {
    return <code className={cn(baseClassName, className)} {...props} />;
  };
}

const BranchList = createDiv("flex flex-col gap-1.5");

const BranchSectionSummary = createDiv(
  "mt-2 text-[11px] leading-5 text-slate-500",
);

function BranchItem({
  $active,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  $active: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        $active
          ? "border-sky-200/80 bg-white"
          : "border-slate-200/80 bg-slate-50/60",
        className,
      )}
      {...props}
    />
  );
}

const BranchHead = createDiv("flex items-start gap-2");

const BranchTitleButton = createButton(
  "flex-1 truncate border-0 bg-transparent p-0 text-left text-[12px] font-medium leading-5 text-slate-900",
);

function StatusBadge({
  $status,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  $status: TopicBranchStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        $status === "merged" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        $status === "in_progress" && "border-sky-200 bg-sky-50 text-sky-700",
        $status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
        $status !== "merged" &&
          $status !== "in_progress" &&
          $status !== "pending" &&
          "border-slate-200 bg-slate-100 text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

const BranchMeta = createDiv("mt-1 text-[10px] leading-4 text-slate-500");

const BranchHint = createDiv("mt-1 text-[10px] leading-4 text-slate-400");

const ActionRow = createDiv("mt-2 flex flex-wrap gap-1.5");

const TinyButton = createButton(
  "rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
);

const DeleteButton = createButton(
  "rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600",
);

const ActivityList = createDiv("flex flex-col gap-[5px]");

const ActivityMeta = createDiv(
  "mt-2 rounded-lg bg-slate-50/90 px-3 py-2 text-[11px] leading-6 text-slate-500",
);

const SecondarySectionSummaryCard = createDiv(
  "mt-1 rounded-[12px] border border-slate-200/70 bg-slate-50/70 px-3 py-2",
);

const SecondarySectionSummaryTitle = createDiv(
  "text-[11px] font-medium leading-5 text-slate-700",
);

const SecondarySectionSummaryMeta = createDiv(
  "mt-0.5 text-[10px] leading-5 text-slate-500",
);

const CreationTaskGroupCard = createDiv(
  "rounded-[14px] border border-slate-200/80 bg-white px-3 py-2.5",
);

const CreationTaskGroupHeader = createDiv(
  "flex items-center gap-2 text-slate-900",
);

const CreationTaskGroupCount = createDiv(
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500",
);

const CreationTaskList = createDiv("mt-2 flex flex-col gap-1.5");

const CreationTaskRow = createDiv(
  "flex items-start gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2",
);

const CreationTaskContent = createDiv("min-w-0 flex-1");

const CreationTaskTitleRow = createDiv("flex items-start gap-2");

const CreationTaskTitle = createDiv(
  "min-w-0 flex-1 truncate text-[11px] font-medium leading-5 text-slate-900",
);

const CreationTaskTime = createDiv(
  "shrink-0 text-[10px] leading-5 text-slate-400",
);

const CreationTaskPath = createCode(
  "mt-1 block truncate rounded-md bg-white px-1.5 py-1 font-mono text-[10px] text-slate-500",
);

const ActivityLogCard = createDiv(
  "rounded-[14px] border border-slate-200/80 bg-white px-3 py-2.5",
);

const ActivityLogHeader = createDiv("flex items-start gap-2");

const ActivityLogTitleBlock = createDiv("min-w-0 flex-1");

const ActivityLogTitle = createDiv(
  "truncate text-[12px] font-medium leading-5 text-slate-900",
);

const ActivityLogMetaRow = createDiv(
  "mt-1 flex flex-wrap items-center gap-1.5",
);

const ActivityLogBadge = createDiv(
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500",
);

const ActivityLogSummary = createDiv(
  "mt-2 text-[11px] leading-5 text-slate-500",
);

const ActivityLogSteps = createDiv("mt-2 flex flex-col gap-1.5");

const ActivityLogStepRow = createDiv(
  "rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2",
);

const ActivityLogStepHead = createDiv(
  "flex items-start gap-2 text-[11px] leading-5 text-slate-900",
);

const ActivityLogStepSummary = createDiv(
  "mt-1 text-[10px] leading-4 text-slate-500",
);

const RunLinkButton = createButton(
  "border-0 bg-transparent p-0 text-[11px] leading-[1.35] text-sky-700 transition-colors hover:text-slate-900 disabled:cursor-default disabled:text-slate-400",
);

const RunDetailPanel = createDiv(
  "mt-2 rounded-[14px] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5",
);

const RunDetailHeader = createDiv("flex items-start gap-2");

const RunDetailTitleBlock = createDiv("min-w-0 flex-1");

const RunDetailMetaRow = createDiv("mt-1 flex flex-wrap items-center gap-1.5");

const RunDetailSummary = createDiv("mt-2 text-[11px] leading-5 text-slate-500");

const RunDetailBadge = createDiv(
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500",
);

const RunDetailTitle = createDiv(
  "text-[12px] font-medium leading-5 text-slate-900",
);

const RunDetailRow = createDiv(
  "break-all text-[11px] leading-[1.45] text-slate-500",
);

const RunDetailArtifacts = createDiv("mt-2 flex flex-col gap-2");

const RunDetailArtifactsTitle = createDiv(
  "text-[10px] font-semibold text-slate-500",
);

const RunDetailArtifactRow = createDiv(
  "rounded-xl border border-slate-200/80 bg-white px-2.5 py-2",
);

const RunDetailArtifactPath = createCode(
  "block truncate rounded-md bg-slate-50 px-1.5 py-1 font-mono text-[10px] text-slate-900",
);

const RunDetailArtifactActions = createDiv("mt-1.5 flex flex-wrap gap-1.5");

const RunDetailArtifactActionButton = createButton(
  "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900",
);

const RunDetailActions = createDiv("mt-1.5 flex gap-1.5");

const RunDetailActionButton = createButton(
  "rounded-md border border-slate-200 bg-white px-[7px] py-[3px] text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-default disabled:text-slate-400",
);

function getStepIcon(status: StepStatus) {
  if (status === "completed") {
    return <CheckCircle2 size={13} />;
  }
  if (status === "error") {
    return <AlertCircle size={13} />;
  }
  if (status === "active") {
    return <Clock3 size={13} />;
  }
  return <Circle size={11} />;
}

function getStatusBadgeClassName(status: StepStatus) {
  return cn(
    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
    status === "completed" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "error" && "border-rose-200 bg-rose-50 text-rose-700",
    status === "active" && "border-sky-200 bg-sky-50 text-sky-700",
    status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "skipped" && "border-slate-200 bg-slate-50 text-slate-500",
  );
}

function getWorkflowStepIconClassName(status: StepStatus) {
  return cn(
    status === "completed" && "text-emerald-600",
    status === "error" && "text-rose-600",
    status === "active" && "text-sky-600",
    status !== "completed" &&
      status !== "error" &&
      status !== "active" &&
      "text-slate-400",
  );
}

function getBranchStatusText(
  status: TopicBranchStatus,
  t: AgentTranslate,
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

function getBranchSectionTitle(
  isVersionMode: boolean,
  t: AgentTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.sectionTitle.version")
    : t("generalWorkbench.workflow.branch.sectionTitle.draft");
}

function getBranchCreateLabel(
  isVersionMode: boolean,
  t: AgentTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.create.version")
    : t("generalWorkbench.workflow.branch.create.draft");
}

function getBranchPrimaryActionLabel(
  isVersionMode: boolean,
  t: AgentTranslate,
): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.primaryAction.version")
    : t("generalWorkbench.workflow.branch.primaryAction.draft");
}

function getBranchSecondaryActionLabel(t: AgentTranslate): string {
  return t("generalWorkbench.workflow.branch.secondaryAction");
}

function getEmptyBranchText(isVersionMode: boolean, t: AgentTranslate): string {
  return isVersionMode
    ? t("generalWorkbench.workflow.branch.empty.version")
    : t("generalWorkbench.workflow.branch.empty.draft");
}

function getBranchMetaText(
  item: TopicBranchItem,
  isVersionMode: boolean,
  t: AgentTranslate,
): string {
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

function buildBranchSectionSummaryText(params: {
  currentBranch: TopicBranchItem | null;
  relatedCount: number;
  isVersionMode: boolean;
  t: AgentTranslate;
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

function buildCreationTaskSectionSummary(params: {
  groups: GeneralWorkbenchCreationTaskGroup[];
  totalCount: number;
  t: AgentTranslate;
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

function formatCreationTaskCountLabel(
  count: number,
  t: AgentTranslate,
): string {
  return t("generalWorkbench.workflow.outputs.summary.countLabel", { count });
}

function buildWorkflowResultHandoffText(params: {
  branchSectionTitle: string;
  hasRecordedOutputs: boolean;
  resultDestination?: string | null;
  t: AgentTranslate;
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

function buildCuratedTaskFollowUpHintText(
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"],
  t: AgentTranslate,
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

function ReviewFeedbackProjectionCard({
  projection,
  dataTestId,
  className,
  onApplyAction,
}: {
  projection: ReviewFeedbackProjection;
  dataTestId?: string;
  className?: string;
  onApplyAction?: () => void;
}) {
  const { t } = useTranslation("agent");
  const primarySuggestedTask = projection.suggestedTasks[0] ?? null;

  return (
    <div
      className={cn(
        "mt-2 rounded-[12px] border border-sky-200/80 bg-sky-50/70 px-3 py-2",
        className,
      )}
      data-testid={dataTestId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          {t("reviewFeedback.badge")}
        </span>
        {!projection.matchedCurrentTask &&
        projection.suggestedTaskTitles.length > 0 ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {projection.suggestedTaskTitles.join(" / ")}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] font-medium leading-5 text-slate-900">
        {formatReviewFeedbackTemplate(
          t("reviewFeedback.title", {
            title: projection.signal.title,
          }),
          { title: projection.signal.title },
        )}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">
        {projection.signal.summary}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">
        {projection.suggestionText}
      </div>
      {primarySuggestedTask && onApplyAction ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
            data-testid={dataTestId ? `${dataTestId}-action` : undefined}
            onClick={onApplyAction}
          >
            {formatReviewFeedbackTemplate(
              t("reviewFeedback.action", {
                title: primarySuggestedTask.title,
              }),
              { title: primarySuggestedTask.title },
            )}
          </button>
          <span className="text-[10px] leading-5 text-slate-500">
            {t("reviewFeedback.helper.generalWorkbench")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function buildReviewFeedbackFollowUpActionPayload(params: {
  projection: ReviewFeedbackProjection;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: AgentTranslate;
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

function SceneAppReviewBaselineCard({
  snapshot,
  highlights,
  dataTestId,
  className,
}: {
  snapshot: SceneAppExecutionReviewPrefillSnapshot;
  highlights: string[];
  dataTestId?: string;
  className?: string;
}) {
  const { t } = useTranslation("agent");

  return (
    <div
      className={cn(
        "mt-2 rounded-[12px] border border-emerald-200/80 bg-emerald-50/70 px-3 py-2",
        className,
      )}
      data-testid={dataTestId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          {t("generalWorkbench.workflow.baseline.badge")}
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {t("generalWorkbench.workflow.baseline.projectResult")}
        </span>
      </div>
      <div className="mt-1 text-[11px] font-medium leading-5 text-slate-900">
        {snapshot.sourceTitle}
      </div>
      {highlights.length > 0 ? (
        <div className="mt-1 space-y-1 text-[11px] leading-5 text-emerald-900">
          {highlights.map((item) => (
            <div key={`sceneapp-baseline-${item}`}>{item}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function listVisibleCuratedTaskFollowUpActions(
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

function buildCuratedTaskFollowUpPrompt(params: {
  action: string;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: AgentTranslate;
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
  t: AgentTranslate;
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

function buildCuratedTaskFollowUpActionPayload(params: {
  action: string;
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  t: AgentTranslate;
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

function getCreationTaskTitle(path: string, t: AgentTranslate): string {
  const normalized = path.trim();
  if (!normalized) {
    return t("generalWorkbench.workflow.outputs.summary.untitledTask");
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

function formatGateLabel(
  t: AgentTranslate,
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

function formatRunIdShort(runId?: string): string | null {
  const trimmed = runId?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…`;
}

function formatRunStatusLabel(
  t: AgentTranslate,
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

function getPrimaryActivityLog(
  group: GeneralWorkbenchActivityLogGroup,
): GeneralWorkbenchActivityLogGroup["logs"][number] | undefined {
  return group.logs.find((log) => log.source === "skill") || group.logs[0];
}

function formatActivityStatusLabel(
  t: AgentTranslate,
  status: GeneralWorkbenchActivityLogGroup["status"],
): string {
  if (status === "running") {
    return t("generalWorkbench.workflow.activity.status.running");
  }
  if (status === "failed") {
    return t("generalWorkbench.workflow.activity.status.failed");
  }
  return t("generalWorkbench.workflow.activity.status.recorded");
}

function getActivityStatusBadgeClassName(
  status: GeneralWorkbenchActivityLogGroup["status"],
) {
  return cn(
    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
    status === "running" && "border-sky-200 bg-sky-50 text-sky-700",
    status === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
    status === "completed" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
  );
}

function formatActivitySourceLabel(
  t: AgentTranslate,
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
  return normalized;
}

function getRunDetailStatusBadgeClassName(status: AgentRun["status"]) {
  return cn(
    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
    status === "running" && "border-sky-200 bg-sky-50 text-sky-700",
    status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "error" && "border-rose-200 bg-rose-50 text-rose-700",
    status === "queued" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "canceled" && "border-slate-200 bg-slate-100 text-slate-500",
    status === "timeout" && "border-rose-200 bg-rose-50 text-rose-700",
  );
}

function buildRunDetailSummaryText(params: {
  runMetadataSummary: GeneralWorkbenchRunMetadataSummary;
  activeRunStagesLabel?: string | null;
  t: AgentTranslate;
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

function buildActivitySummary(
  group: GeneralWorkbenchActivityLogGroup,
  gateLabel: string | null,
  t: AgentTranslate,
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

function buildActivitySectionSummary(params: {
  groups: GeneralWorkbenchActivityLogGroup[];
  activeRunDetail?: AgentRun | null;
  t: AgentTranslate;
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

function buildActivityStepSummary(
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

function renderActivityLogItem(
  group: GeneralWorkbenchActivityLogGroup,
  onViewRunDetail: GeneralWorkbenchWorkflowPanelProps["onViewRunDetail"],
  onRevealArtifactInFinder: GeneralWorkbenchWorkflowPanelProps["onRevealArtifactInFinder"],
  onOpenArtifactWithDefaultApp: GeneralWorkbenchWorkflowPanelProps["onOpenArtifactWithDefaultApp"],
  t: AgentTranslate,
) {
  const gateLabel = formatGateLabel(t, group.gateKey);
  const runLabel = formatRunIdShort(group.runId);
  const sourceLabel = formatActivitySourceLabel(t, group.source);
  const primaryLog = getPrimaryActivityLog(group);
  const activitySummary = buildActivitySummary(group, gateLabel, t);

  return (
    <ActivityLogCard key={`activity-${group.key}`}>
      <ActivityLogHeader>
        <div className={getActivityStatusBadgeClassName(group.status)}>
          {formatActivityStatusLabel(t, group.status)}
        </div>
        <ActivityLogTitleBlock>
          <ActivityLogTitle>
            {primaryLog?.name ||
              t("generalWorkbench.workflow.activity.summary.nameFallback")}
          </ActivityLogTitle>
          <ActivityLogMetaRow>
            {sourceLabel ? (
              <ActivityLogBadge>{sourceLabel}</ActivityLogBadge>
            ) : null}
            {gateLabel ? (
              <ActivityLogBadge>{gateLabel}</ActivityLogBadge>
            ) : null}
            {group.logs.length > 1 ? (
              <ActivityLogBadge>
                {t("generalWorkbench.workflow.activity.summary.stepCount", {
                  count: group.logs.length,
                })}
              </ActivityLogBadge>
            ) : null}
            {group.artifactPaths.length > 0 ? (
              <ActivityLogBadge>
                {t("generalWorkbench.workflow.activity.summary.artifactBadge", {
                  count: group.artifactPaths.length,
                })}
              </ActivityLogBadge>
            ) : null}
          </ActivityLogMetaRow>
        </ActivityLogTitleBlock>
        <div className="shrink-0 text-[10px] leading-5 text-slate-400">
          {group.timeLabel}
        </div>
      </ActivityLogHeader>
      {activitySummary ? (
        <ActivityLogSummary>{activitySummary}</ActivityLogSummary>
      ) : null}
      <ActivityLogSteps>
        {group.logs.map((log) => (
          <ActivityLogStepRow key={log.id}>
            <ActivityLogStepHead>
              <span className="text-slate-400">•</span>
              <span className="min-w-0 flex-1 break-words">{log.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {log.timeLabel}
              </span>
            </ActivityLogStepHead>
            {buildActivityStepSummary(log) ? (
              <ActivityLogStepSummary>
                {buildActivityStepSummary(log)}
              </ActivityLogStepSummary>
            ) : null}
          </ActivityLogStepRow>
        ))}
      </ActivityLogSteps>
      <ActionRow>
        {group.runId && onViewRunDetail ? (
          <RunLinkButton
            type="button"
            onClick={() => onViewRunDetail(group.runId!)}
          >
            {t("generalWorkbench.workflow.activity.viewRun", {
              run: runLabel || group.runId,
            })}
          </RunLinkButton>
        ) : null}
        {!group.runId
          ? group.artifactPaths.map((artifactPath) => (
              <ActivityMetaFragment
                key={`${group.key}-${artifactPath}`}
                artifactPath={artifactPath}
                sessionId={group.sessionId || null}
                onRevealArtifactInFinder={onRevealArtifactInFinder}
                onOpenArtifactWithDefaultApp={onOpenArtifactWithDefaultApp}
                t={t}
              />
            ))
          : null}
      </ActionRow>
    </ActivityLogCard>
  );
}

function ActivityMetaFragment({
  artifactPath,
  sessionId,
  onRevealArtifactInFinder,
  onOpenArtifactWithDefaultApp,
  t,
}: {
  artifactPath: string;
  sessionId?: string | null;
  onRevealArtifactInFinder: GeneralWorkbenchWorkflowPanelProps["onRevealArtifactInFinder"];
  onOpenArtifactWithDefaultApp: GeneralWorkbenchWorkflowPanelProps["onOpenArtifactWithDefaultApp"];
  t: AgentTranslate;
}) {
  return (
    <>
      <TinyButton
        type="button"
        aria-label={t("generalWorkbench.workflow.activity.revealArtifactAria", {
          path: artifactPath,
        })}
        onClick={() => {
          void onRevealArtifactInFinder(artifactPath, sessionId);
        }}
      >
        {t("generalWorkbench.workflow.activity.revealArtifact")}
      </TinyButton>
      <TinyButton
        type="button"
        aria-label={t("generalWorkbench.workflow.activity.openArtifactAria", {
          path: artifactPath,
        })}
        onClick={() => {
          void onOpenArtifactWithDefaultApp(artifactPath, sessionId);
        }}
      >
        {t("generalWorkbench.workflow.activity.openArtifact")}
      </TinyButton>
    </>
  );
}

function CuratedTaskFollowUpActions({
  curatedTask,
  onApplyFollowUpAction,
}: {
  curatedTask: GeneralWorkbenchRunMetadataSummary["curatedTask"];
  onApplyFollowUpAction?: GeneralWorkbenchWorkflowPanelProps["onApplyFollowUpAction"];
}) {
  const { t } = useTranslation("agent");
  const visibleActions = listVisibleCuratedTaskFollowUpActions(curatedTask);
  if (!onApplyFollowUpAction || visibleActions.length === 0) {
    return null;
  }

  return (
    <ActionRow data-testid="workflow-sidebar-follow-up-actions">
      {visibleActions.map((action) => {
        const payload = buildCuratedTaskFollowUpActionPayload({
          action,
          curatedTask,
          t,
        });
        if (!payload) {
          return null;
        }

        return (
          <TinyButton
            key={action}
            type="button"
            aria-label={t("generalWorkbench.workflow.followUp.applyAria", {
              action,
            })}
            onClick={() => {
              onApplyFollowUpAction(payload);
            }}
          >
            {action}
          </TinyButton>
        );
      })}
    </ActionRow>
  );
}

function GeneralWorkbenchWorkflowPanelComponent({
  isVersionMode,
  projectId,
  sessionId,
  onNewTopic,
  onSwitchTopic,
  onDeleteTopic,
  branchItems,
  onSetBranchStatus,
  onApplyFollowUpAction,
  workflowSteps,
  completedSteps,
  progressPercent,
  onAddImage,
  onImportDocument,
  showBranchRecords,
  onToggleBranchRecords,
  creationTaskEventsCount,
  showCreationTasks,
  onToggleCreationTasks,
  groupedCreationTaskEvents,
  showActivityLogs,
  onToggleActivityLogs,
  groupedActivityLogs,
  onViewRunDetail,
  activeRunDetail,
  activeRunDetailLoading = false,
  activeRunStagesLabel,
  runMetadataText,
  runMetadataSummary,
  onCopyText,
  onRevealArtifactInFinder,
  onOpenArtifactWithDefaultApp,
}: GeneralWorkbenchWorkflowPanelProps) {
  const { t } = useTranslation("agent");
  const [recommendationSignalsVersion, setRecommendationSignalsVersion] =
    useState(0);

  useEffect(() => {
    return subscribeCuratedTaskRecommendationSignalsChanged(() => {
      setRecommendationSignalsVersion((previous) => previous + 1);
    });
  }, []);

  const workflowSnapshot = buildWorkflowStepSnapshot(workflowSteps, 3);
  const currentWorkflowStep = workflowSnapshot.leadingStep;
  const remainingSteps = workflowSnapshot.remainingCount;
  const visibleQueueSteps = workflowSnapshot.visibleQueueItems.filter(
    (step) => step.id !== currentWorkflowStep?.id,
  );
  const hiddenQueueCount = Math.max(
    workflowSnapshot.openSteps.length - 1 - visibleQueueSteps.length,
    0,
  );
  const completedWorkflowSteps = workflowSnapshot.completedCount;
  const sortedBranchItems = [...branchItems].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    const statusPriority: Record<TopicBranchStatus, number> = {
      in_progress: 0,
      pending: 1,
      candidate: 2,
      merged: 3,
    };
    const statusDiff =
      statusPriority[left.status] - statusPriority[right.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
  const workflowSummaryText = buildWorkflowSummaryText({
    leadingStep: currentWorkflowStep,
    remainingCount: remainingSteps,
    emptyLabel:
      workflowSteps.length > 0
        ? t("generalWorkbench.workflow.current.completedTitle")
        : t("generalWorkbench.workflow.current.emptyTitle"),
  });
  const workflowProgressLabel = formatWorkflowProgressLabel({
    completedCount: completedSteps,
    totalCount: workflowSteps.length,
  });
  const branchSectionTitle = getBranchSectionTitle(isVersionMode, t);
  const branchCreateLabel = getBranchCreateLabel(isVersionMode, t);
  const branchPrimaryActionLabel = getBranchPrimaryActionLabel(
    isVersionMode,
    t,
  );
  const branchSecondaryActionLabel = getBranchSecondaryActionLabel(t);
  const currentBranchItem =
    sortedBranchItems.find((item) => item.isCurrent) ??
    sortedBranchItems[0] ??
    null;
  const secondaryBranchCount = Math.max(
    sortedBranchItems.length - (currentBranchItem ? 1 : 0),
    0,
  );
  const branchSectionSummaryText = buildBranchSectionSummaryText({
    currentBranch: currentBranchItem,
    relatedCount: secondaryBranchCount,
    isVersionMode,
    t,
  });
  const creationTaskSectionSummary = buildCreationTaskSectionSummary({
    groups: groupedCreationTaskEvents,
    totalCount: creationTaskEventsCount,
    t,
  });
  const workflowResultHandoffText = buildWorkflowResultHandoffText({
    branchSectionTitle,
    hasRecordedOutputs:
      creationTaskEventsCount > 0 ||
      groupedActivityLogs.length > 0 ||
      runMetadataSummary.artifactPaths.length > 0,
    resultDestination: runMetadataSummary.curatedTask?.resultDestination,
    t,
  });
  const curatedTaskFollowUpHintText = buildCuratedTaskFollowUpHintText(
    runMetadataSummary.curatedTask,
    t,
  );
  const latestReviewSignal = useMemo(() => {
    void recommendationSignalsVersion;
    return (
      listCuratedTaskRecommendationSignals({
        projectId,
        sessionId,
      })
        .filter((signal) => signal.source === "review_feedback")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
    );
  }, [projectId, recommendationSignalsVersion, sessionId]);
  const reviewFeedbackProjection = useMemo(
    () =>
      buildReviewFeedbackProjection({
        copy: buildReviewFeedbackProjectionCopy(t),
        signal: latestReviewSignal,
        currentTaskId: runMetadataSummary.curatedTask?.taskId,
        currentTaskTitle: runMetadataSummary.curatedTask?.taskTitle,
      }),
    [latestReviewSignal, runMetadataSummary.curatedTask, t],
  );
  const reviewFeedbackFollowUpActionPayload = useMemo(() => {
    if (!reviewFeedbackProjection) {
      return null;
    }

    return buildReviewFeedbackFollowUpActionPayload({
      projection: reviewFeedbackProjection,
      curatedTask: runMetadataSummary.curatedTask,
      t,
    });
  }, [reviewFeedbackProjection, runMetadataSummary.curatedTask, t]);
  const sceneAppReviewBaselineSnapshot = useMemo(() => {
    if (!runMetadataSummary.curatedTask?.taskId) {
      return null;
    }

    return buildSceneAppExecutionReviewPrefillSnapshot({
      referenceEntries: runMetadataSummary.curatedTask?.referenceEntries,
      taskId: runMetadataSummary.curatedTask.taskId,
    });
  }, [
    runMetadataSummary.curatedTask?.referenceEntries,
    runMetadataSummary.curatedTask?.taskId,
  ]);
  const sceneAppReviewBaselineHighlights = useMemo(
    () =>
      buildSceneAppExecutionReviewPrefillHighlights(
        sceneAppReviewBaselineSnapshot,
      ),
    [sceneAppReviewBaselineSnapshot],
  );
  const shouldShowFollowUpHint = Boolean(
    reviewFeedbackProjection ||
    curatedTaskFollowUpHintText ||
    sceneAppReviewBaselineSnapshot,
  );
  const activitySectionSummary = buildActivitySectionSummary({
    groups: groupedActivityLogs,
    activeRunDetail,
    t,
  });

  return (
    <>
      <section
        className={WORKFLOW_SECTION_CLASSNAME}
        data-testid="workflow-sidebar-task-section"
      >
        <div className={WORKFLOW_SECTION_TITLE_CLASSNAME}>
          <span>{t("generalWorkbench.workflow.current.title")}</span>
          <span className={WORKFLOW_SECTION_BADGE_CLASSNAME}>
            {remainingSteps}
          </span>
        </div>
        <div
          className={WORKFLOW_TASK_SUMMARY_CLASSNAME}
          data-testid="workflow-sidebar-task-summary"
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5",
                getWorkflowStepIconClassName(
                  currentWorkflowStep?.status ?? "active",
                ),
              )}
            >
              {getStepIcon(currentWorkflowStep?.status ?? "active")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={WORKFLOW_INLINE_LABEL_CLASSNAME}>
                  {t("generalWorkbench.workflow.current.focus")}
                </span>
                <span
                  className="break-words text-sm font-semibold leading-5 text-slate-900"
                  data-testid="workflow-sidebar-current-step"
                >
                  {currentWorkflowStep?.title ||
                    t("generalWorkbench.workflow.current.completedTitle")}
                </span>
                <span
                  className={getStatusBadgeClassName(
                    currentWorkflowStep?.status ?? "completed",
                  )}
                >
                  {getWorkflowStatusLabel(
                    currentWorkflowStep?.status ?? "completed",
                  )}
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-5 text-slate-500">
                {workflowSummaryText}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={WORKFLOW_TASK_SUMMARY_PILL_CLASSNAME}>
                  {workflowProgressLabel}
                </span>
                <span className={WORKFLOW_TASK_SUMMARY_PILL_CLASSNAME}>
                  {remainingSteps > 0
                    ? t("generalWorkbench.workflow.current.remaining", {
                        count: remainingSteps,
                      })
                    : t("generalWorkbench.workflow.current.allCompleted")}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="inline-flex h-1 w-14 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className="h-full rounded-full bg-sky-500/70 transition-[width] duration-200"
                      style={{
                        width: `${Math.max(0, Math.min(100, progressPercent))}%`,
                      }}
                    />
                  </span>
                  {Math.max(0, Math.min(100, Math.round(progressPercent)))}%
                </span>
              </div>
              <div
                className={WORKFLOW_RESULT_HANDOFF_HINT_CLASSNAME}
                data-testid="workflow-sidebar-result-destination-hint"
              >
                <div className="text-[10px] font-semibold text-slate-500">
                  {t("generalWorkbench.workflow.current.resultDestination")}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-slate-500">
                  {workflowResultHandoffText}
                </div>
              </div>
              {shouldShowFollowUpHint ? (
                <div
                  className={WORKFLOW_RESULT_HANDOFF_HINT_CLASSNAME}
                  data-testid="workflow-sidebar-follow-up-hint"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[10px] font-semibold text-slate-500">
                      {t("generalWorkbench.workflow.current.suggestedNext")}
                    </div>
                    {runMetadataSummary.curatedTask?.taskTitle ? (
                      <span className={WORKFLOW_TASK_SUMMARY_PILL_CLASSNAME}>
                        {runMetadataSummary.curatedTask.taskTitle}
                      </span>
                    ) : null}
                  </div>
                  {sceneAppReviewBaselineSnapshot ? (
                    <SceneAppReviewBaselineCard
                      snapshot={sceneAppReviewBaselineSnapshot}
                      highlights={sceneAppReviewBaselineHighlights}
                      dataTestId="workflow-sidebar-sceneapp-baseline-card"
                    />
                  ) : null}
                  {reviewFeedbackProjection ? (
                    <ReviewFeedbackProjectionCard
                      projection={reviewFeedbackProjection}
                      dataTestId="workflow-sidebar-review-feedback-banner"
                      onApplyAction={
                        reviewFeedbackFollowUpActionPayload &&
                        onApplyFollowUpAction
                          ? () => {
                              onApplyFollowUpAction(
                                reviewFeedbackFollowUpActionPayload,
                              );
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  {curatedTaskFollowUpHintText ? (
                    <>
                      <div className="mt-1 text-[11px] leading-5 text-slate-500">
                        {curatedTaskFollowUpHintText}
                      </div>
                      <CuratedTaskFollowUpActions
                        curatedTask={runMetadataSummary.curatedTask}
                        onApplyFollowUpAction={onApplyFollowUpAction}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {visibleQueueSteps.length > 0 ? (
          <div className={WORKFLOW_STEP_LIST_CLASSNAME}>
            <div className={WORKFLOW_QUEUE_HEADER_CLASSNAME}>
              <span>{t("generalWorkbench.workflow.queue.title")}</span>
              <span>
                {hiddenQueueCount > 0
                  ? t("generalWorkbench.workflow.queue.hiddenCount", {
                      visible: visibleQueueSteps.length,
                      hidden: hiddenQueueCount,
                    })
                  : t("generalWorkbench.workflow.queue.pendingCount", {
                      count: visibleQueueSteps.length,
                    })}
              </span>
            </div>
            <div className={WORKFLOW_QUEUE_LIST_CLASSNAME}>
              {visibleQueueSteps.map((step, index) => (
                <WorkflowQueueRow
                  key={step.id}
                  $status={step.status}
                  data-testid="workflow-sidebar-step"
                  data-status={step.status}
                >
                  <span
                    className={cn(
                      "mt-0.5",
                      getWorkflowStepIconClassName(step.status),
                    )}
                  >
                    {getStepIcon(step.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>
                        {t("generalWorkbench.workflow.queue.item", {
                          index: index + 1,
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 break-words text-[12px] leading-5 text-slate-900">
                      {step.title}
                    </div>
                  </div>
                  <span className={getStatusBadgeClassName(step.status)}>
                    {getWorkflowStatusLabel(step.status)}
                  </span>
                </WorkflowQueueRow>
              ))}
            </div>
          </div>
        ) : null}
        {completedWorkflowSteps > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            <span className={WORKFLOW_TASK_SUMMARY_PILL_CLASSNAME}>
              {t("generalWorkbench.workflow.completed.count", {
                count: completedWorkflowSteps,
              })}
            </span>
            {remainingSteps > 0 ? (
              <span>
                {t(
                  "generalWorkbench.workflow.completed.collapsedWithRemaining",
                )}
              </span>
            ) : (
              <span>
                {t("generalWorkbench.workflow.completed.allDoneHint")}
              </span>
            )}
          </div>
        ) : null}
      </section>

      <section
        className={cn(WORKFLOW_SECTION_CLASSNAME, "relative z-10")}
        data-testid="workflow-sidebar-branch-section"
      >
        <div className={WORKFLOW_SECTION_TITLE_CLASSNAME}>
          <span>{branchSectionTitle}</span>
          <span className="inline-flex items-center gap-2">
            <span className={WORKFLOW_SECTION_BADGE_CLASSNAME}>
              {branchItems.length}
            </span>
            <button
              type="button"
              aria-label={t("generalWorkbench.workflow.branch.toggleAria")}
              className={TOGGLE_BUTTON_CLASSNAME}
              onClick={onToggleBranchRecords}
            >
              {showBranchRecords ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={WORKFLOW_NEW_TOPIC_BUTTON_CLASSNAME}
                >
                  <Plus size={13} />
                  {branchCreateLabel}
                  <ChevronDown size={11} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ width: "260px" }}>
                <DropdownMenuItem onClick={onNewTopic}>
                  <GitBranch size={14} />
                  <span>{branchCreateLabel}</span>
                </DropdownMenuItem>
                {onAddImage ? (
                  <DropdownMenuItem onClick={onAddImage}>
                    <ImageIcon size={14} />
                    <span>
                      {t("generalWorkbench.workflow.branch.addImage")}
                    </span>
                  </DropdownMenuItem>
                ) : null}
                {onImportDocument ? (
                  <DropdownMenuItem onClick={onImportDocument}>
                    <FileText size={14} />
                    <span>
                      {t("generalWorkbench.workflow.branch.importDraft")}
                    </span>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
        {branchItems.length === 0 ? (
          <ActivityMeta>{getEmptyBranchText(isVersionMode, t)}</ActivityMeta>
        ) : (
          <>
            <BranchSectionSummary data-testid="workflow-sidebar-branch-summary">
              {branchSectionSummaryText}
            </BranchSectionSummary>
            {showBranchRecords ? (
              <BranchList className="mt-2 custom-scrollbar">
                {sortedBranchItems.map((item) => (
                  <BranchItem key={item.id} $active={item.isCurrent}>
                    <BranchHead>
                      <GitBranch
                        size={13}
                        className={cn(
                          "mt-0.5 shrink-0",
                          item.isCurrent ? "text-sky-600" : "text-slate-400",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <BranchTitleButton
                            onClick={() => onSwitchTopic(item.id)}
                          >
                            {item.title}
                          </BranchTitleButton>
                          <StatusBadge $status={item.status}>
                            {item.isCurrent
                              ? t(
                                  "generalWorkbench.workflow.branch.currentFocus",
                                )
                              : getBranchStatusText(item.status, t)}
                          </StatusBadge>
                          {!isVersionMode ? (
                            <DeleteButton
                              onClick={() => onDeleteTopic(item.id)}
                              aria-label={t(
                                "generalWorkbench.workflow.branch.deleteAria",
                              )}
                            >
                              <Trash2 size={12} />
                            </DeleteButton>
                          ) : null}
                        </div>
                        <BranchMeta>
                          {getBranchMetaText(item, isVersionMode, t)}
                        </BranchMeta>
                        {item.isCurrent ? (
                          <ActionRow>
                            <TinyButton
                              onClick={() =>
                                onSetBranchStatus(item.id, "merged")
                              }
                            >
                              {branchPrimaryActionLabel}
                            </TinyButton>
                            <TinyButton
                              onClick={() =>
                                onSetBranchStatus(item.id, "pending")
                              }
                            >
                              {branchSecondaryActionLabel}
                            </TinyButton>
                          </ActionRow>
                        ) : (
                          <BranchHint>
                            {t(
                              "generalWorkbench.workflow.branch.focusFirstHint",
                            )}
                          </BranchHint>
                        )}
                      </div>
                    </BranchHead>
                  </BranchItem>
                ))}
              </BranchList>
            ) : null}
          </>
        )}
      </section>

      <section className={WORKFLOW_SECTION_CLASSNAME}>
        <div className={WORKFLOW_SECTION_TITLE_CLASSNAME}>
          <span>{t("generalWorkbench.workflow.outputs.title")}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={WORKFLOW_SECTION_BADGE_CLASSNAME}>
              {creationTaskEventsCount}
            </span>
            <button
              type="button"
              aria-label={t("generalWorkbench.workflow.outputs.toggleAria")}
              className={TOGGLE_BUTTON_CLASSNAME}
              onClick={onToggleCreationTasks}
            >
              {showCreationTasks ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
          </span>
        </div>
        <SecondarySectionSummaryCard data-testid="workflow-sidebar-creation-summary">
          <SecondarySectionSummaryTitle>
            {creationTaskSectionSummary.title}
          </SecondarySectionSummaryTitle>
          <SecondarySectionSummaryMeta>
            {creationTaskSectionSummary.meta}
          </SecondarySectionSummaryMeta>
        </SecondarySectionSummaryCard>
        {showCreationTasks ? (
          <ActivityList className="custom-scrollbar">
            {groupedCreationTaskEvents.length === 0 ? (
              <ActivityMeta>
                {t("generalWorkbench.workflow.outputs.empty")}
              </ActivityMeta>
            ) : (
              groupedCreationTaskEvents.map((group) => (
                <CreationTaskGroupCard key={`creation-task-${group.key}`}>
                  <CreationTaskGroupHeader>
                    <span>{group.label}</span>
                    <CreationTaskGroupCount>
                      {formatCreationTaskCountLabel(group.tasks.length, t)}
                    </CreationTaskGroupCount>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {group.latestTimeLabel}
                    </span>
                  </CreationTaskGroupHeader>
                  <CreationTaskList>
                    {group.tasks.map((task) => (
                      <CreationTaskRow key={`${task.taskId}-${task.path}`}>
                        <CreationTaskContent>
                          <CreationTaskTitleRow>
                            <CreationTaskTitle>
                              {getCreationTaskTitle(task.path, t)}
                            </CreationTaskTitle>
                            <CreationTaskTime>
                              {task.timeLabel}
                            </CreationTaskTime>
                          </CreationTaskTitleRow>
                          <CreationTaskPath>{task.path}</CreationTaskPath>
                        </CreationTaskContent>
                        <RunDetailActionButton
                          type="button"
                          aria-label={
                            task.absolutePath
                              ? t(
                                  "generalWorkbench.workflow.outputs.copyAbsolutePathAria",
                                  { taskId: task.taskId },
                                )
                              : t(
                                  "generalWorkbench.workflow.outputs.copyPathAria",
                                  { taskId: task.taskId },
                                )
                          }
                          onClick={() => {
                            void onCopyText(task.absolutePath || task.path);
                          }}
                        >
                          {t("generalWorkbench.workflow.outputs.copyPath")}
                        </RunDetailActionButton>
                      </CreationTaskRow>
                    ))}
                  </CreationTaskList>
                </CreationTaskGroupCard>
              ))
            )}
          </ActivityList>
        ) : null}
      </section>

      <section className={WORKFLOW_SECTION_CLASSNAME}>
        <div className={WORKFLOW_SECTION_TITLE_CLASSNAME}>
          <span>{t("generalWorkbench.workflow.activity.title")}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={WORKFLOW_SECTION_BADGE_CLASSNAME}>
              {groupedActivityLogs.length}
            </span>
            <button
              type="button"
              aria-label={t("generalWorkbench.workflow.activity.toggleAria")}
              className={TOGGLE_BUTTON_CLASSNAME}
              onClick={onToggleActivityLogs}
            >
              {showActivityLogs ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
          </span>
        </div>
        <SecondarySectionSummaryCard data-testid="workflow-sidebar-activity-summary">
          <SecondarySectionSummaryTitle>
            {activitySectionSummary.title}
          </SecondarySectionSummaryTitle>
          <SecondarySectionSummaryMeta>
            {activitySectionSummary.meta}
          </SecondarySectionSummaryMeta>
        </SecondarySectionSummaryCard>
        {showActivityLogs ? (
          <>
            <ActivityList className="custom-scrollbar">
              {groupedActivityLogs.length === 0 ? (
                <ActivityMeta>
                  {t("generalWorkbench.workflow.activity.empty")}
                </ActivityMeta>
              ) : (
                groupedActivityLogs.map((group) =>
                  renderActivityLogItem(
                    group,
                    onViewRunDetail,
                    onRevealArtifactInFinder,
                    onOpenArtifactWithDefaultApp,
                    t,
                  ),
                )
              )}
            </ActivityList>
            {activeRunDetailLoading ? (
              <ActivityMeta>
                {t("generalWorkbench.workflow.runDetail.loading")}
              </ActivityMeta>
            ) : activeRunDetail ? (
              <RunDetailPanel>
                <RunDetailHeader>
                  <div
                    className={getRunDetailStatusBadgeClassName(
                      activeRunDetail.status,
                    )}
                  >
                    {formatRunStatusLabel(t, activeRunDetail.status)}
                  </div>
                  <RunDetailTitleBlock>
                    <RunDetailTitle>
                      {t("generalWorkbench.workflow.runDetail.title")}
                    </RunDetailTitle>
                    <RunDetailMetaRow>
                      <RunDetailBadge>
                        {formatActivitySourceLabel(t, activeRunDetail.source) ||
                          t(
                            "generalWorkbench.workflow.runDetail.fallbackSource",
                          )}
                      </RunDetailBadge>
                      {runMetadataSummary.workflow ? (
                        <RunDetailBadge>
                          {runMetadataSummary.workflow}
                        </RunDetailBadge>
                      ) : null}
                      {runMetadataSummary.curatedTask?.taskTitle ? (
                        <RunDetailBadge>
                          {runMetadataSummary.curatedTask.taskTitle}
                        </RunDetailBadge>
                      ) : null}
                      {runMetadataSummary.artifactPaths.length > 0 ? (
                        <RunDetailBadge>
                          {t(
                            "generalWorkbench.workflow.runDetail.artifactCount",
                            {
                              count: runMetadataSummary.artifactPaths.length,
                            },
                          )}
                        </RunDetailBadge>
                      ) : null}
                    </RunDetailMetaRow>
                  </RunDetailTitleBlock>
                </RunDetailHeader>
                <RunDetailSummary>
                  {buildRunDetailSummaryText({
                    runMetadataSummary,
                    activeRunStagesLabel,
                    t,
                  })}
                </RunDetailSummary>
                {sceneAppReviewBaselineSnapshot ? (
                  <SceneAppReviewBaselineCard
                    snapshot={sceneAppReviewBaselineSnapshot}
                    highlights={sceneAppReviewBaselineHighlights}
                    dataTestId="workflow-run-detail-sceneapp-baseline-card"
                  />
                ) : null}
                {reviewFeedbackProjection ? (
                  <ReviewFeedbackProjectionCard
                    projection={reviewFeedbackProjection}
                    dataTestId="workflow-run-detail-review-feedback-banner"
                    onApplyAction={
                      reviewFeedbackFollowUpActionPayload &&
                      onApplyFollowUpAction
                        ? () => {
                            onApplyFollowUpAction(
                              reviewFeedbackFollowUpActionPayload,
                            );
                          }
                        : undefined
                    }
                  />
                ) : null}
                {curatedTaskFollowUpHintText ? (
                  <>
                    <RunDetailSummary>
                      {curatedTaskFollowUpHintText}
                    </RunDetailSummary>
                    <CuratedTaskFollowUpActions
                      curatedTask={runMetadataSummary.curatedTask}
                      onApplyFollowUpAction={onApplyFollowUpAction}
                    />
                  </>
                ) : null}
                <RunDetailRow>
                  {t("generalWorkbench.workflow.runDetail.id", {
                    id: activeRunDetail.id,
                  })}
                </RunDetailRow>
                <RunDetailActions>
                  <RunDetailActionButton
                    type="button"
                    aria-label={t(
                      "generalWorkbench.workflow.runDetail.copyIdAria",
                    )}
                    onClick={() => {
                      void onCopyText(activeRunDetail.id);
                    }}
                  >
                    {t("generalWorkbench.workflow.runDetail.copyId")}
                  </RunDetailActionButton>
                  <RunDetailActionButton
                    type="button"
                    aria-label={t(
                      "generalWorkbench.workflow.runDetail.copyRawAria",
                    )}
                    onClick={() => {
                      void onCopyText(runMetadataText);
                    }}
                  >
                    {t("generalWorkbench.workflow.runDetail.copyRaw")}
                  </RunDetailActionButton>
                </RunDetailActions>
                {runMetadataSummary.artifactPaths.length > 0 ? (
                  <RunDetailArtifacts>
                    <RunDetailArtifactsTitle>
                      {t("generalWorkbench.workflow.runDetail.artifactsTitle")}
                    </RunDetailArtifactsTitle>
                    {runMetadataSummary.artifactPaths.map((artifactPath) => (
                      <RunDetailArtifactRow key={`run-detail-${artifactPath}`}>
                        <RunDetailArtifactPath>
                          {artifactPath}
                        </RunDetailArtifactPath>
                        <RunDetailArtifactActions>
                          <RunDetailArtifactActionButton
                            type="button"
                            aria-label={t(
                              "generalWorkbench.workflow.runDetail.copyArtifactAria",
                              { path: artifactPath },
                            )}
                            onClick={() => {
                              void onCopyText(artifactPath);
                            }}
                          >
                            {t(
                              "generalWorkbench.workflow.runDetail.copyArtifact",
                            )}
                          </RunDetailArtifactActionButton>
                          <RunDetailArtifactActionButton
                            type="button"
                            aria-label={t(
                              "generalWorkbench.workflow.runDetail.revealArtifactAria",
                              { path: artifactPath },
                            )}
                            onClick={() => {
                              void onRevealArtifactInFinder(artifactPath);
                            }}
                          >
                            {t(
                              "generalWorkbench.workflow.runDetail.revealArtifact",
                            )}
                          </RunDetailArtifactActionButton>
                          <RunDetailArtifactActionButton
                            type="button"
                            aria-label={t(
                              "generalWorkbench.workflow.runDetail.openArtifactAria",
                              { path: artifactPath },
                            )}
                            onClick={() => {
                              void onOpenArtifactWithDefaultApp(artifactPath);
                            }}
                          >
                            {t(
                              "generalWorkbench.workflow.runDetail.openArtifact",
                            )}
                          </RunDetailArtifactActionButton>
                        </RunDetailArtifactActions>
                      </RunDetailArtifactRow>
                    ))}
                  </RunDetailArtifacts>
                ) : null}
              </RunDetailPanel>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}

export const GeneralWorkbenchWorkflowPanel = memo(
  GeneralWorkbenchWorkflowPanelComponent,
);
