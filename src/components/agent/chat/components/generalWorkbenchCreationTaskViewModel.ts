import type { GeneralWorkbenchCreationTaskGroup } from "./generalWorkbenchWorkflowData";
import type {
  GeneralWorkbenchCreationTaskGroupProjection,
  GeneralWorkbenchCreationTaskSectionProjection,
  GeneralWorkbenchWorkflowPanelTranslate,
} from "./generalWorkbenchWorkflowPanelTypes";

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
