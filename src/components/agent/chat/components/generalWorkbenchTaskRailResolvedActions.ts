import type { ActionRequired, AgentThreadItem } from "../types";
import { resolveUserFacingToolDisplayLabel } from "../utils/toolDisplayInfo";

type MinimalTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

export type GeneralWorkbenchTaskRailResolvedActionStatus =
  | "approved"
  | "rejected"
  | "answered"
  | "resolved";

export interface GeneralWorkbenchTaskRailResolvedActionItem {
  id: string;
  requestId: string;
  actionType: ActionRequired["actionType"];
  title: string;
  detail?: string | null;
  status: GeneralWorkbenchTaskRailResolvedActionStatus;
  completedAt: Date | null;
}

function translateTaskRailText(
  t: MinimalTranslate,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return String(t(key, { defaultValue, ...options }));
}

function truncateText(value: string, maxLength = 80): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeActionType(
  item: Extract<AgentThreadItem, { type: "approval_request" | "request_user_input" }>,
): ActionRequired["actionType"] {
  if (
    item.action_type === "tool_confirmation" ||
    item.action_type === "ask_user" ||
    item.action_type === "elicitation"
  ) {
    return item.action_type;
  }

  return item.type === "request_user_input" ? "ask_user" : "tool_confirmation";
}

function readBooleanDecision(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "approved" ||
      normalized === "approve" ||
      normalized === "allowed" ||
      normalized === "allow" ||
      normalized === "confirmed" ||
      normalized === "confirm" ||
      normalized === "true"
    ) {
      return true;
    }
    if (
      normalized === "rejected" ||
      normalized === "reject" ||
      normalized === "denied" ||
      normalized === "deny" ||
      normalized === "cancelled" ||
      normalized === "canceled" ||
      normalized === "false"
    ) {
      return false;
    }
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return (
    readBooleanDecision(record.approved) ??
    readBooleanDecision(record.confirmed) ??
    readBooleanDecision(record.confirm)
  );
}

function isImportedReadOnlyResponse(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const decision =
    typeof record.decision === "string" ? record.decision.trim() : "";
  return (
    record.imported_read_only === true ||
    record.importedReadOnly === true ||
    decision === "imported_read_only"
  );
}

function resolveStatus(
  item: Extract<AgentThreadItem, { type: "approval_request" | "request_user_input" }>,
  actionType: ActionRequired["actionType"],
): GeneralWorkbenchTaskRailResolvedActionStatus {
  if (actionType === "ask_user" || actionType === "elicitation") {
    return "answered";
  }

  const decision = readBooleanDecision(item.response);
  if (decision === true) {
    return "approved";
  }
  if (decision === false) {
    return "rejected";
  }
  return "resolved";
}

function buildTitle(
  item: Extract<AgentThreadItem, { type: "approval_request" | "request_user_input" }>,
  actionType: ActionRequired["actionType"],
  t: MinimalTranslate,
): string {
  if (isImportedReadOnlyResponse(item.response)) {
    return translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.importedReadOnlyTitle",
      "导入的权限记录",
    );
  }

  const prompt = item.prompt?.trim();
  if (prompt) {
    return truncateText(prompt);
  }

  if (actionType === "ask_user") {
    return translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.askTitle",
      "等待回答",
    );
  }

  if (actionType === "elicitation") {
    return translateTaskRailText(
      t,
      "generalWorkbench.taskRail.approval.elicitationTitle",
      "等待补充",
    );
  }

  const toolLabel = resolveUserFacingToolDisplayLabel(
    item.type === "approval_request" && item.tool_name?.trim()
      ? item.tool_name
      : "tool_confirmation",
  );
  return translateTaskRailText(
    t,
    "generalWorkbench.taskRail.approval.toolTitle",
    "确认 {{tool}}",
    { tool: toolLabel },
  );
}

function buildDetail(
  item: Extract<AgentThreadItem, { type: "approval_request" | "request_user_input" }>,
  actionType: ActionRequired["actionType"],
): string | null {
  if (actionType !== "tool_confirmation" && item.type === "request_user_input") {
    const firstQuestion = item.questions?.[0]?.question?.trim();
    return firstQuestion ? truncateText(firstQuestion) : null;
  }
  return null;
}

function readCompletedAt(item: AgentThreadItem): Date | null {
  const value = item.completed_at || item.updated_at || item.started_at;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isResolvedActionThreadItem(
  item: AgentThreadItem,
): item is Extract<
  AgentThreadItem,
  { type: "approval_request" | "request_user_input" }
> {
  return (
    (item.type === "approval_request" || item.type === "request_user_input") &&
    (item.status === "completed" || typeof item.response !== "undefined") &&
    Boolean(item.request_id.trim())
  );
}

export function buildGeneralWorkbenchTaskRailResolvedActionItems(
  threadItems: readonly AgentThreadItem[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailResolvedActionItem[] {
  const seen = new Set<string>();
  const items: GeneralWorkbenchTaskRailResolvedActionItem[] = [];

  for (const item of threadItems ?? []) {
    if (!isResolvedActionThreadItem(item) || seen.has(item.request_id)) {
      continue;
    }

    seen.add(item.request_id);
    const actionType = normalizeActionType(item);
    items.push({
      id: `approval-resolved:${item.request_id}`,
      requestId: item.request_id,
      actionType,
      title: buildTitle(item, actionType, t),
      detail: buildDetail(item, actionType),
      status: resolveStatus(item, actionType),
      completedAt: readCompletedAt(item),
    });
  }

  return items.sort((left, right) => {
    const leftTime = left.completedAt?.getTime() ?? 0;
    const rightTime = right.completedAt?.getTime() ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.requestId.localeCompare(right.requestId);
  });
}
