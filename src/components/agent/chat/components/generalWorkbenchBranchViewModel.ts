import type {
  TopicBranchItem,
  TopicBranchStatus,
} from "../hooks/useTopicBranchBoard";
import type {
  GeneralWorkbenchBranchItemProjection,
  GeneralWorkbenchBranchSectionProjection,
  GeneralWorkbenchWorkflowPanelTranslate,
} from "./generalWorkbenchWorkflowPanelTypes";

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
