import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type {
  GeneralWorkbenchTaskRailActivityItem,
  GeneralWorkbenchTaskRailApprovalItem,
  GeneralWorkbenchTaskRailContextItem,
  GeneralWorkbenchTaskRailItem,
  GeneralWorkbenchTaskRailPlanItem,
} from "./generalWorkbenchTaskRailViewModel";
import {
  type MinimalTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";

export type GeneralWorkbenchRunControlSplitLaneState =
  | "open"
  | "available"
  | "unavailable";

export interface GeneralWorkbenchRunControlEnvironmentInput {
  modeLabel?: string | null;
  branchLabel?: string | null;
  gitStatusLabel?: string | null;
}

export interface GeneralWorkbenchRunControlSplitLaneInput {
  state: GeneralWorkbenchRunControlSplitLaneState;
}

export interface GeneralWorkbenchRunControlSurfaceProjection {
  environmentItems: GeneralWorkbenchTaskRailContextItem[];
  runItems: GeneralWorkbenchTaskRailContextItem[];
  controlItems: GeneralWorkbenchTaskRailContextItem[];
  goalItem: GeneralWorkbenchTaskRailContextItem | null;
  sourceItem: GeneralWorkbenchTaskRailContextItem | null;
  participantItem: GeneralWorkbenchTaskRailContextItem | null;
  splitLaneItem: GeneralWorkbenchTaskRailContextItem | null;
  planItems: GeneralWorkbenchTaskRailPlanItem[];
  planOverflowCount: number;
  activitySummary: GeneralWorkbenchTaskRailContextItem | null;
  approvalSummary: GeneralWorkbenchTaskRailContextItem | null;
  outputSummary: GeneralWorkbenchTaskRailContextItem | null;
  outputOverflowCount: number;
  hasContent: boolean;
}

function findContextItem(
  items: readonly GeneralWorkbenchTaskRailContextItem[],
  id: string,
): GeneralWorkbenchTaskRailContextItem | null {
  return items.find((item) => item.id === id) ?? null;
}

function compactIdentifier(value: string, maxLength = 18): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `…${trimmed.slice(-maxLength + 1)}`;
}

function factItem({
  id,
  label,
  value,
  title,
}: {
  id: string;
  label: string;
  value: string;
  title?: string | null;
}): GeneralWorkbenchTaskRailContextItem {
  return {
    id,
    label,
    value,
    title: title ?? value,
  };
}

function buildEnvironmentItems({
  contextItems,
  environment,
  t,
}: {
  contextItems: readonly GeneralWorkbenchTaskRailContextItem[];
  environment?: GeneralWorkbenchRunControlEnvironmentInput;
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailContextItem[] {
  const items: GeneralWorkbenchTaskRailContextItem[] = [];
  const modeLabel = environment?.modeLabel?.trim();
  const branchLabel = environment?.branchLabel?.trim();
  const gitStatusLabel = environment?.gitStatusLabel?.trim();

  if (modeLabel) {
    items.push(
      factItem({
        id: "environment-mode",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.mode",
          "模式",
        ),
        value: modeLabel,
      }),
    );
  }

  const workspaceItem = findContextItem(contextItems, "workspace");
  if (workspaceItem) {
    items.push(workspaceItem);
  }

  if (branchLabel) {
    items.push(
      factItem({
        id: "environment-branch",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.branch",
          "分支",
        ),
        value: branchLabel,
      }),
    );
  }

  if (gitStatusLabel) {
    items.push(
      factItem({
        id: "environment-git-status",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.gitStatus",
          "Git",
        ),
        value: gitStatusLabel,
      }),
    );
  }

  const changesItem = findContextItem(contextItems, "changes");
  if (changesItem) {
    items.push(changesItem);
  }

  return items;
}

function buildRunItems(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem[] {
  if (!threadRead) {
    return [];
  }

  const items: GeneralWorkbenchTaskRailContextItem[] = [];
  const status = threadRead.profile_status?.trim() || threadRead.status?.trim();
  const activeTurnId =
    threadRead.active_turn_id?.trim() ||
    threadRead.turns?.find((turn) => turn.status === "running")?.turn_id ||
    threadRead.turns?.at(-1)?.turn_id;

  if (status) {
    items.push(
      factItem({
        id: "run-status",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.runStatus",
          "状态",
        ),
        value: status,
      }),
    );
  }

  if (threadRead.thread_id.trim()) {
    items.push(
      factItem({
        id: "run-thread",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.thread",
          "线程",
        ),
        value: compactIdentifier(threadRead.thread_id),
        title: threadRead.thread_id,
      }),
    );
  }

  if (activeTurnId?.trim()) {
    items.push(
      factItem({
        id: "run-turn",
        label: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.turn",
          "轮次",
        ),
        value: compactIdentifier(activeTurnId),
        title: activeTurnId,
      }),
    );
  }

  return items;
}

function buildActivitySummary({
  activityItems,
  activityOverflowCount,
  t,
}: {
  activityItems: readonly GeneralWorkbenchTaskRailActivityItem[];
  activityOverflowCount: number;
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailContextItem | null {
  const total = activityItems.length + Math.max(activityOverflowCount, 0);
  if (total === 0) {
    return null;
  }

  const failed = activityItems.filter((item) => item.status === "failed").length;
  const running = activityItems.filter(
    (item) => item.status === "running",
  ).length;
  const value =
    failed > 0
      ? translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.activityFailed",
          "{{failed}} 项需处理",
          { failed },
        )
      : running > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.activityRunning",
            "{{running}} 项进行中",
            { running },
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.activityCount",
            "{{count}} 项",
            { count: total },
          );

  return factItem({
    id: "activity-summary",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.activityTitle",
      "执行",
    ),
    value,
  });
}

function buildApprovalSummary({
  approvalItems,
  approvalOverflowCount,
  t,
}: {
  approvalItems: readonly GeneralWorkbenchTaskRailApprovalItem[];
  approvalOverflowCount: number;
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailContextItem | null {
  const total = approvalItems.length + Math.max(approvalOverflowCount, 0);
  if (total === 0) {
    return null;
  }

  const pending = approvalItems.filter(
    (item) => item.status === "pending" || item.status === "queued",
  ).length;
  return factItem({
    id: "approval-summary",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.title",
      "确认",
    ),
    value:
      pending > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.approvalPending",
            "{{count}} 条待确认",
            { count: pending },
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.approvalCount",
            "{{count}} 条",
            { count: total },
          ),
  });
}

function buildOutputSummary({
  outputItems,
  outputOverflowCount,
  t,
}: {
  outputItems: readonly GeneralWorkbenchTaskRailItem[];
  outputOverflowCount: number;
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailContextItem | null {
  const total = outputItems.length + Math.max(outputOverflowCount, 0);
  if (total === 0) {
    return null;
  }

  return factItem({
    id: "output-summary",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.outputsTitle",
      "输出",
    ),
    value: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.surface.outputCount",
      "{{count}} 项",
      { count: total },
    ),
  });
}

function buildSplitLaneItem(
  splitLane: GeneralWorkbenchRunControlSplitLaneInput | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailContextItem | null {
  if (!splitLane) {
    return null;
  }

  const value =
    splitLane.state === "open"
      ? translateTaskRailText(
          t,
          "generalWorkbench.taskRail.surface.splitLane.open",
          "已打开",
        )
      : splitLane.state === "available"
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.splitLane.available",
            "可打开",
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.surface.splitLane.unavailable",
            "未启用",
          );

  return factItem({
    id: "split-lane",
    label: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.surface.splitLane",
      "分屏",
    ),
    value,
  });
}

export function buildGeneralWorkbenchRunControlSurfaceProjection({
  contextItems,
  planItems,
  planOverflowCount,
  activityItems,
  activityOverflowCount,
  approvalItems,
  approvalOverflowCount,
  outputItems,
  outputOverflowCount,
  threadRead,
  environment,
  splitLane,
  t,
}: {
  contextItems: readonly GeneralWorkbenchTaskRailContextItem[];
  planItems: readonly GeneralWorkbenchTaskRailPlanItem[];
  planOverflowCount: number;
  activityItems: readonly GeneralWorkbenchTaskRailActivityItem[];
  activityOverflowCount: number;
  approvalItems: readonly GeneralWorkbenchTaskRailApprovalItem[];
  approvalOverflowCount: number;
  outputItems: readonly GeneralWorkbenchTaskRailItem[];
  outputOverflowCount: number;
  threadRead?: AgentRuntimeThreadReadModel | null;
  environment?: GeneralWorkbenchRunControlEnvironmentInput;
  splitLane?: GeneralWorkbenchRunControlSplitLaneInput;
  t: MinimalTranslate;
}): GeneralWorkbenchRunControlSurfaceProjection {
  const environmentItems = buildEnvironmentItems({
    contextItems,
    environment,
    t,
  });
  const runItems = buildRunItems(threadRead, t);
  const controlItems = ["model", "permission", "reasoning"]
    .map((id) => findContextItem(contextItems, id))
    .filter((item): item is GeneralWorkbenchTaskRailContextItem =>
      Boolean(item),
  );
  const goalItem = findContextItem(contextItems, "objective");
  const sourceItem = findContextItem(contextItems, "sources");
  const participantItem = findContextItem(contextItems, "subtasks");
  const splitLaneItem = buildSplitLaneItem(splitLane, t);
  const activitySummary = buildActivitySummary({
    activityItems,
    activityOverflowCount,
    t,
  });
  const approvalSummary = buildApprovalSummary({
    approvalItems,
    approvalOverflowCount,
    t,
  });
  const outputSummary = buildOutputSummary({
    outputItems,
    outputOverflowCount,
    t,
  });

  const hasContent =
    environmentItems.length > 0 ||
    runItems.length > 0 ||
    controlItems.length > 0 ||
    Boolean(goalItem) ||
    Boolean(sourceItem) ||
    Boolean(participantItem) ||
    Boolean(splitLaneItem) ||
    planItems.length > 0 ||
    Boolean(activitySummary) ||
    Boolean(approvalSummary) ||
    Boolean(outputSummary);

  return {
    environmentItems,
    runItems,
    controlItems,
    goalItem,
    sourceItem,
    participantItem,
    splitLaneItem,
    planItems: [...planItems],
    planOverflowCount: Math.max(planOverflowCount, 0),
    activitySummary,
    approvalSummary,
    outputSummary,
    outputOverflowCount: Math.max(outputOverflowCount, 0),
    hasContent,
  };
}
