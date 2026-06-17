import type { StepStatus } from "@/lib/workspace/workbenchContract";
import type {
  AgentRuntimeThreadReadModel,
  AsterTodoItem,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import type { Message, MessageTaskPreview } from "../types";
import type {
  GeneralWorkbenchActivityLogGroup,
  GeneralWorkbenchCreationTaskGroup,
} from "./generalWorkbenchWorkflowData";
import {
  buildGeneralWorkbenchWorkflowCurrentProjection,
  type GeneralWorkbenchWorkflowStepInput,
  type GeneralWorkbenchWorkflowPanelTranslate,
} from "./generalWorkbenchWorkflowPanelViewModel";
import { resolveUserFacingToolDisplayLabel } from "../utils/toolDisplayInfo";
import type { ActionRequired, AgentThreadItem } from "../types";
import {
  buildGeneralWorkbenchTaskRailResolvedActionItems,
  type GeneralWorkbenchTaskRailResolvedActionItem,
  type GeneralWorkbenchTaskRailResolvedActionStatus,
} from "./generalWorkbenchTaskRailResolvedActions";
import { buildGeneralWorkbenchTaskRailThreadItemItems } from "./generalWorkbenchTaskRailThreadItems";
import {
  buildGeneralWorkbenchTaskRailContextItems,
  buildGeneralWorkbenchTaskRailRuntimeContext,
  type GeneralWorkbenchTaskRailContextInput,
  type GeneralWorkbenchTaskRailContextItem,
} from "./generalWorkbenchTaskRailContextViewModel";
import {
  type MinimalTranslate,
  createFallbackWorkflowTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";
import {
  buildProposedPlanItemsFromMessages,
  buildUpdatePlanItemsFromMessageToolCalls,
  buildUpdatePlanItemsFromThreadItems,
  isUpdatePlanToolName,
} from "./planToolProjection";

export type {
  GeneralWorkbenchTaskRailContextInput,
  GeneralWorkbenchTaskRailContextItem,
} from "./generalWorkbenchTaskRailContextViewModel";
export { buildGeneralWorkbenchTaskRailRuntimeContext } from "./generalWorkbenchTaskRailContextViewModel";

export type GeneralWorkbenchTaskRailItemKind =
  | "step"
  | "tool"
  | "artifact"
  | "run"
  | "summary";

export type GeneralWorkbenchTaskRailItemStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface GeneralWorkbenchTaskRailItem {
  id: string;
  kind: GeneralWorkbenchTaskRailItemKind;
  status: GeneralWorkbenchTaskRailItemStatus;
  title: string;
  detail?: string | null;
  meta?: string | null;
  timestamp?: Date | null;
  artifactPath?: string | null;
}

export interface GeneralWorkbenchTaskRailPlanItem {
  id: string;
  title: string;
  status: GeneralWorkbenchTaskRailItemStatus;
  meta: string;
}

export interface GeneralWorkbenchTaskRailActivityItem {
  id: string;
  title: string;
  status: GeneralWorkbenchTaskRailItemStatus;
  kind: Extract<GeneralWorkbenchTaskRailItemKind, "tool" | "run">;
  meta?: string | null;
}

export type GeneralWorkbenchTaskRailApprovalStatus =
  | "pending"
  | "queued"
  | "submitted"
  | GeneralWorkbenchTaskRailResolvedActionStatus;

export interface GeneralWorkbenchTaskRailApprovalItem {
  id: string;
  requestId: string;
  actionType: ActionRequired["actionType"];
  title: string;
  detail?: string | null;
  status: GeneralWorkbenchTaskRailApprovalStatus;
  canRespond: boolean;
}

export interface GeneralWorkbenchTaskRailProjection {
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  progressLabel: string;
  activeTitle: string;
  activeDetail: string;
  activeStatus: GeneralWorkbenchTaskRailItemStatus;
  items: GeneralWorkbenchTaskRailItem[];
  outputItems: GeneralWorkbenchTaskRailItem[];
  contextItems: GeneralWorkbenchTaskRailContextItem[];
  planItems: GeneralWorkbenchTaskRailPlanItem[];
  planOverflowCount: number;
  activityItems: GeneralWorkbenchTaskRailActivityItem[];
  activityOverflowCount: number;
  approvalItems: GeneralWorkbenchTaskRailApprovalItem[];
  approvalOverflowCount: number;
  emptyText: string;
  outputOverflowCount: number;
}

function hasArtifactTaskPreview(
  taskPreview: MessageTaskPreview | undefined,
): taskPreview is MessageTaskPreview & {
  artifactPath: string;
  title?: string | null;
} {
  if (!taskPreview) {
    return false;
  }

  return (
    "artifactPath" in taskPreview &&
    typeof taskPreview.artifactPath === "string" &&
    taskPreview.artifactPath.trim().length > 0
  );
}

function normalizeStepStatus(
  status: StepStatus,
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "completed" || status === "skipped") {
    return "completed";
  }
  if (status === "error") {
    return "failed";
  }
  if (status === "active") {
    return "running";
  }
  return "pending";
}

function normalizeToolStatus(
  status: NonNullable<Message["toolCalls"]>[number]["status"],
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "completed";
  }
  return "running";
}

function normalizeActivityStatus(
  status: GeneralWorkbenchActivityLogGroup["status"],
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "failed") {
    return "failed";
  }
  if (status === "running") {
    return "running";
  }
  return "completed";
}

function truncateText(value: string, maxLength = 120): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatToolArgs(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return truncateText(value);
    }
    const parts = Object.entries(parsed)
      .slice(0, 2)
      .map(([key, item]) => `${key}: ${String(item ?? "").slice(0, 44)}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  } catch {
    return truncateText(value);
  }
}

function buildStepItems(
  workflowSteps: GeneralWorkbenchWorkflowStepInput[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailItem[] {
  return workflowSteps.map((step, index) => ({
    id: `step:${step.id}`,
    kind: "step",
    status: normalizeStepStatus(step.status),
    title: step.title,
    meta: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.stepMeta",
      "步骤 {{index}}",
      {
        index: index + 1,
      },
    ),
  }));
}

function buildPlanItems(
  workflowSteps: GeneralWorkbenchWorkflowStepInput[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  return workflowSteps.map((step, index) => ({
    id: step.id,
    title: step.title,
    status: normalizeStepStatus(step.status),
    meta: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.stepMeta",
      "步骤 {{index}}",
      {
        index: index + 1,
      },
    ),
  }));
}

function normalizeThreadPlanStatus(
  status: AgentThreadItem["status"],
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "failed") {
    return "failed";
  }
  if (status === "in_progress") {
    return "running";
  }
  return "completed";
}

function normalizeTodoStatus(
  status: AsterTodoItem["status"],
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "in_progress") {
    return "running";
  }
  return "pending";
}

function buildThreadPlanItems(
  threadItems: readonly AgentThreadItem[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  const planItems = (threadItems ?? []).filter(
    (item): item is Extract<AgentThreadItem, { type: "plan" }> =>
      item.type === "plan" && item.text.trim().length > 0,
  );
  const structuredPlanItems = buildStructuredThreadPlanItems(planItems, t);
  if (structuredPlanItems.length > 0) {
    return structuredPlanItems;
  }

  return planItems
    .filter((item) => item.text.trim().length > 0)
    .map((item, index) => ({
      id: item.id,
      title: item.text.trim(),
      status: normalizeThreadPlanStatus(item.status),
      meta: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.stepMeta",
        "步骤 {{index}}",
        {
          index: index + 1,
        },
      ),
    }));
}

function buildStructuredThreadPlanItems(
  planItems: readonly Extract<AgentThreadItem, { type: "plan" }>[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  for (const item of [...planItems].reverse()) {
    const steps = readStructuredPlanSteps(item.metadata);
    if (steps.length === 0) {
      continue;
    }
    return steps.map((step, index) => ({
      id: `${item.id}:${index}:${step.step}`,
      title: step.step,
      status: normalizeStructuredPlanStatus(step.status),
      meta: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.stepMeta",
        "步骤 {{index}}",
        {
          index: index + 1,
        },
      ),
    }));
  }
  return [];
}

function readStructuredPlanSteps(
  metadata: unknown,
): Array<{ step: string; status: string }> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const plan = (metadata as { plan?: unknown }).plan;
  if (!Array.isArray(plan)) {
    return [];
  }
  return plan.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as { step?: unknown; status?: unknown };
    const step = typeof record.step === "string" ? record.step.trim() : "";
    const status =
      typeof record.status === "string" ? record.status.trim() : "";
    if (!step || !status) {
      return [];
    }
    return [{ step, status }];
  });
}

function normalizeStructuredPlanStatus(
  status: string,
): GeneralWorkbenchTaskRailItemStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
    case "inProgress":
    case "in-progress":
      return "running";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function buildTodoPlanItems(
  todoItems: readonly AsterTodoItem[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  return (todoItems ?? [])
    .filter((item) => item.content.trim().length > 0)
    .map((item, index) => ({
      id: `todo:${index}:${item.content.trim()}`,
      title: item.content.trim(),
      status: normalizeTodoStatus(item.status),
      meta: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.stepMeta",
        "步骤 {{index}}",
        {
          index: index + 1,
        },
      ),
    }));
}

function buildRecoveredPlanItems({
  workflowSteps,
  messages,
  threadItems,
  todoItems,
  t,
}: {
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  messages: Message[];
  threadItems?: readonly AgentThreadItem[];
  todoItems?: readonly AsterTodoItem[];
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailPlanItem[] {
  const workflowPlanItems = buildPlanItems(workflowSteps, t);
  if (workflowPlanItems.length > 0) {
    return workflowPlanItems;
  }

  const proposedPlanItems = buildProposedPlanItemsFromMessages(messages, t);
  if (proposedPlanItems.length > 0) {
    return proposedPlanItems;
  }

  const messageUpdatePlanItems = [...messages]
    .reverse()
    .flatMap((message) =>
      buildUpdatePlanItemsFromMessageToolCalls(message.toolCalls, t),
    );
  if (messageUpdatePlanItems.length > 0) {
    return messageUpdatePlanItems;
  }

  const threadUpdatePlanItems = buildUpdatePlanItemsFromThreadItems(
    threadItems,
    t,
  );
  if (threadUpdatePlanItems.length > 0) {
    return threadUpdatePlanItems;
  }

  const threadPlanItems = buildThreadPlanItems(threadItems, t);
  if (threadPlanItems.length > 0) {
    return threadPlanItems;
  }

  return buildTodoPlanItems(todoItems, t);
}

function buildMessageItems(
  messages: Message[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailItem[] {
  const items: GeneralWorkbenchTaskRailItem[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    if (message.thinkingContent?.trim()) {
      items.push({
        id: `thinking:${message.id}`,
        kind: "summary",
        status: "completed",
        title: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.thinkingTitle",
          "整理思路",
        ),
        detail: truncateText(message.thinkingContent, 140),
        timestamp: message.timestamp,
      });
    }

    for (const [index, toolCall] of (message.toolCalls ?? []).entries()) {
      if (isUpdatePlanToolName(toolCall.name)) {
        continue;
      }
      const detail =
        toolCall.result?.error?.trim() ||
        toolCall.result?.output?.trim() ||
        formatToolArgs(toolCall.arguments);
      items.push({
        id: `tool:${message.id}:${toolCall.id}:${index}`,
        kind: "tool",
        status: normalizeToolStatus(toolCall.status),
        title: resolveUserFacingToolDisplayLabel(toolCall.name),
        detail: detail ? truncateText(detail, 140) : null,
        meta: toolCall.name,
        timestamp: toolCall.startTime || message.timestamp,
      });
    }

    for (const [index, artifact] of (message.artifacts ?? []).entries()) {
      const metadata = artifact.meta as
        | {
            filePath?: string;
            artifactPath?: string;
            filename?: string;
          }
        | undefined;
      const path =
        metadata?.filePath?.trim() ||
        metadata?.artifactPath?.trim() ||
        artifact.title?.trim() ||
        artifact.id;
      items.push({
        id: `artifact:${message.id}:${artifact.id}:${index}`,
        kind: "artifact",
        status: artifact.status === "error" ? "failed" : "completed",
        title: artifact.title?.trim() || path,
        detail: path,
        meta: metadata?.filename || artifact.type,
        timestamp: message.timestamp,
        artifactPath: path,
      });
    }

    if (hasArtifactTaskPreview(message.taskPreview)) {
      items.push({
        id: `task-preview:${message.id}:${message.taskPreview.taskId}`,
        kind: "artifact",
        status:
          message.taskPreview.status === "failed"
            ? "failed"
            : message.taskPreview.status === "running"
              ? "running"
              : "completed",
        title: message.taskPreview.title || message.taskPreview.taskType,
        detail: message.taskPreview.artifactPath,
        meta: message.taskPreview.taskType,
        timestamp: message.timestamp,
        artifactPath: message.taskPreview.artifactPath,
      });
    }
  }

  return items;
}

function buildActivityItems(
  groups: GeneralWorkbenchActivityLogGroup[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailItem[] {
  return groups.map((group) => {
    const firstLog = group.logs[0];
    const source = firstLog?.sourceRef || group.source || firstLog?.name;
    const artifactText =
      group.artifactPaths.length > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.artifactsDetail",
            "产物：{{paths}}",
            {
              paths: group.artifactPaths.join("、"),
            },
          )
        : null;
    return {
      id: `run:${group.key}`,
      kind: "run",
      status: normalizeActivityStatus(group.status),
      title: source
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.runTitle",
            "执行 {{source}}",
            {
              source,
            },
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.runTitleFallback",
            "执行任务",
          ),
      detail: artifactText,
      meta: group.gateKey || group.runId || group.messageId || null,
      timestamp: null,
      artifactPath: group.artifactPaths[0] || null,
    };
  });
}

function buildCreationTaskItems(
  groups: GeneralWorkbenchCreationTaskGroup[],
): GeneralWorkbenchTaskRailItem[] {
  return groups.flatMap((group) =>
    group.tasks.slice(-2).map((task) => ({
      id: `creation:${group.key}:${task.taskId}`,
      kind: "artifact" as const,
      status: "completed" as const,
      title: group.label || task.taskType,
      detail: task.path,
      meta: task.timeLabel || group.latestTimeLabel,
      timestamp: task.createdAt ? new Date(task.createdAt) : null,
      artifactPath: task.path,
    })),
  );
}

function rankStatus(status: GeneralWorkbenchTaskRailItemStatus): number {
  switch (status) {
    case "running":
      return 0;
    case "failed":
      return 1;
    case "pending":
      return 2;
    case "completed":
      return 3;
  }
}

function rankKind(kind: GeneralWorkbenchTaskRailItemKind): number {
  switch (kind) {
    case "step":
      return 0;
    case "tool":
      return 1;
    case "run":
      return 2;
    case "artifact":
      return 3;
    case "summary":
      return 4;
  }
}

function sortTaskRailItems(
  items: GeneralWorkbenchTaskRailItem[],
): GeneralWorkbenchTaskRailItem[] {
  return [...items].sort((left, right) => {
    const statusDiff = rankStatus(left.status) - rankStatus(right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const leftTime = left.timestamp?.getTime() ?? 0;
    const rightTime = right.timestamp?.getTime() ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return rankKind(left.kind) - rankKind(right.kind);
  });
}

function isOutputItem(item: GeneralWorkbenchTaskRailItem): boolean {
  return item.kind === "artifact" || Boolean(item.artifactPath?.trim());
}

function buildOutputItems(
  items: GeneralWorkbenchTaskRailItem[],
): GeneralWorkbenchTaskRailItem[] {
  const seen = new Set<string>();
  const outputItems: GeneralWorkbenchTaskRailItem[] = [];

  for (const item of items) {
    if (!isOutputItem(item)) {
      continue;
    }

    const path = item.artifactPath?.trim();
    const key = path ? `path:${path}` : `id:${item.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    outputItems.push(item);
  }

  return outputItems;
}

function buildActivityItemsPreview(
  items: GeneralWorkbenchTaskRailItem[],
): GeneralWorkbenchTaskRailActivityItem[] {
  return items
    .filter((item) => item.kind === "tool" || item.kind === "run")
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      kind: item.kind as "tool" | "run",
      meta: item.meta,
    }));
}

function buildApprovalTitle(
  action: ActionRequired,
  t: MinimalTranslate,
): string {
  const prompt = action.prompt?.trim();
  if (prompt) {
    return truncateText(prompt, 80);
  }

  if (action.actionType === "ask_user") {
    return translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.askTitle",
      "等待回答",
    );
  }

  if (action.actionType === "elicitation") {
    return translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.elicitationTitle",
      "等待补充",
    );
  }

  const toolLabel = resolveUserFacingToolDisplayLabel(
    action.toolName?.trim() || "tool_confirmation",
  );
  return translateTaskRailText(
    t,
    "generalWorkbench.taskRail.approval.toolTitle",
    "确认 {{tool}}",
    { tool: toolLabel },
  );
}

function buildApprovalDetail(action: ActionRequired): string | null {
  const detail = action.detail?.trim();
  if (detail) {
    return truncateText(detail, 80);
  }

  if (action.actionType !== "tool_confirmation" && action.questions?.length) {
    return truncateText(action.questions[0]?.question || "", 80);
  }

  return null;
}

function normalizeApprovalStatus(
  action: ActionRequired,
  submittedRequestIds: ReadonlySet<string>,
): GeneralWorkbenchTaskRailApprovalStatus {
  if (action.status === "queued") {
    return "queued";
  }
  if (
    action.status === "submitted" ||
    submittedRequestIds.has(action.requestId)
  ) {
    return "submitted";
  }
  return "pending";
}

function buildApprovalItems(
  pendingActions: readonly ActionRequired[] | undefined,
  submittedActionsInFlight: readonly ActionRequired[] | undefined,
  resolvedActionItems: readonly GeneralWorkbenchTaskRailResolvedActionItem[],
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailApprovalItem[] {
  const submittedRequestIds = new Set(
    (submittedActionsInFlight ?? []).map((action) => action.requestId),
  );
  const merged = new Map<string, ActionRequired>();

  for (const action of pendingActions ?? []) {
    if (action.requestId.trim()) {
      merged.set(action.requestId, action);
    }
  }

  for (const action of submittedActionsInFlight ?? []) {
    if (action.requestId.trim() && !merged.has(action.requestId)) {
      merged.set(action.requestId, action);
    }
  }

  const activeItems = Array.from(merged.values()).map((action) => {
    const status = normalizeApprovalStatus(action, submittedRequestIds);
    return {
      id: `approval:${action.requestId}`,
      requestId: action.requestId,
      actionType: action.actionType,
      title: buildApprovalTitle(action, t),
      detail: buildApprovalDetail(action),
      status,
      canRespond:
        action.actionType === "tool_confirmation" && status === "pending",
    };
  });
  const activeRequestIds = new Set(activeItems.map((item) => item.requestId));
  const visibleResolvedItems = resolvedActionItems
    .filter((item) => !activeRequestIds.has(item.requestId))
    .map((item) => ({
      id: item.id,
      requestId: item.requestId,
      actionType: item.actionType,
      title: item.title,
      detail: item.detail,
      status: item.status,
      canRespond: false,
    }));

  return [...activeItems, ...visibleResolvedItems];
}

export function buildGeneralWorkbenchTaskRailProjection({
  workflowSteps,
  completedSteps,
  progressPercent,
  messages,
  groupedActivityLogs,
  groupedCreationTaskEvents,
  pendingActions,
  submittedActionsInFlight,
  threadItems,
  todoItems,
  threadRead,
  childSubagentSessions,
  context,
  t = createFallbackWorkflowTranslate(),
}: {
  workflowSteps: GeneralWorkbenchWorkflowStepInput[];
  completedSteps: number;
  progressPercent: number;
  messages: Message[];
  groupedActivityLogs: GeneralWorkbenchActivityLogGroup[];
  groupedCreationTaskEvents: GeneralWorkbenchCreationTaskGroup[];
  pendingActions?: readonly ActionRequired[];
  submittedActionsInFlight?: readonly ActionRequired[];
  threadItems?: readonly AgentThreadItem[];
  todoItems?: readonly AsterTodoItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  childSubagentSessions?: readonly AsterSubagentSessionInfo[];
  context?: GeneralWorkbenchTaskRailContextInput;
  t?: MinimalTranslate;
}): GeneralWorkbenchTaskRailProjection {
  const workflowT = t as unknown as GeneralWorkbenchWorkflowPanelTranslate;
  const currentProjection = buildGeneralWorkbenchWorkflowCurrentProjection({
    workflowSteps,
    completedSteps,
    progressPercent,
    t: workflowT,
  });
  const mergedContext = buildGeneralWorkbenchTaskRailRuntimeContext({
    context,
    threadRead,
    threadItems,
    childSubagentSessions,
  });
  const items = sortTaskRailItems([
    ...buildStepItems(workflowSteps, t),
    ...buildMessageItems(messages, t),
    ...buildGeneralWorkbenchTaskRailThreadItemItems(threadItems, t),
    ...buildActivityItems(groupedActivityLogs, t),
    ...buildCreationTaskItems(groupedCreationTaskEvents),
  ]);
  const outputItems = buildOutputItems(items);
  const planItems = buildRecoveredPlanItems({
    workflowSteps,
    messages,
    threadItems,
    todoItems,
    t,
  });
  const activityItems = buildActivityItemsPreview(items);
  const approvalItems = buildApprovalItems(
    pendingActions,
    submittedActionsInFlight,
    buildGeneralWorkbenchTaskRailResolvedActionItems(threadItems, t),
    t,
  );
  const activeItem =
    items.find((item) => item.status === "running") ||
    items.find((item) => item.status === "failed") ||
    items.find((item) => item.status === "pending") ||
    items[0] ||
    null;

  return {
    completedCount: currentProjection.completedWorkflowSteps,
    totalCount: workflowSteps.length,
    progressPercent: currentProjection.progressBarPercent,
    progressLabel: currentProjection.workflowProgressLabel,
    activeTitle:
      activeItem?.title || currentProjection.currentStepTitle || "等待开始",
    activeDetail:
      activeItem?.detail ||
      currentProjection.workflowSummaryText ||
      currentProjection.remainingText,
    activeStatus: activeItem?.status || "pending",
    items,
    outputItems,
    contextItems: buildGeneralWorkbenchTaskRailContextItems(mergedContext, t),
    planItems: planItems.slice(0, 3),
    planOverflowCount: Math.max(planItems.length - 3, 0),
    activityItems: activityItems.slice(0, 3),
    activityOverflowCount: Math.max(activityItems.length - 3, 0),
    approvalItems: approvalItems.slice(0, 2),
    approvalOverflowCount: Math.max(approvalItems.length - 2, 0),
    emptyText:
      workflowSteps.length > 0
        ? translateTaskRailText(
            t,
            "generalWorkbench.taskRail.empty.withSteps",
            "当前还没有执行记录，后续产物会出现在这里。",
          )
        : translateTaskRailText(
            t,
            "generalWorkbench.taskRail.empty.noSteps",
            "发送任务后，这里会显示进度和输出。",
          ),
    outputOverflowCount: Math.max(outputItems.length - 4, 0),
  };
}
