import type {
  AgentUiControl,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  definedString,
  metadataKeys,
  readBooleanField,
  readRecord,
  readStringField,
  truncateText,
} from "./normalization.js";

export interface AgentUiActionProjectionScope {
  sessionId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
}

export interface AgentUiActionRequiredProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  requestId: string;
  actionType: string;
  scope?: AgentUiActionProjectionScope;
  toolName?: string | null;
  prompt?: string | null;
  questions?: readonly unknown[] | null;
  requestedSchema?: unknown;
}

export interface AgentUiActionResolvedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  requestId: string;
  actionType: string;
  scope?: AgentUiActionProjectionScope;
  approved?: boolean;
  feedback?: string | null;
  permissionMode?: string | null;
  data?: Record<string, unknown> | null;
}

export function resolveAgentUiActionRequiredControl(
  actionType: string,
): AgentUiControl | undefined {
  if (actionType === "ask_user" || actionType === "elicitation") {
    return "answer";
  }
  if (actionType === "tool_confirmation") {
    return "approve";
  }
  return undefined;
}

export function resolveAgentUiActionResolvedControl(
  actionType: string,
  approved: boolean | undefined,
): AgentUiControl | undefined {
  if (actionType === "ask_user" || actionType === "elicitation") {
    return "answer";
  }
  if (actionType === "plan_approval" || actionType === "tool_confirmation") {
    return approved === false ? "reject" : "approve";
  }
  return undefined;
}

export function buildAgentUiActionRequiredEvent(
  input: AgentUiActionRequiredProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "action_required" },
    context,
  );
  return {
    ...base,
    ...resolveActionScope(input.scope, base),
    type: "action.required",
    actionId: input.requestId,
    owner: "action",
    scope: "action_request",
    phase: "waiting",
    surface: "hitl",
    persistence: "snapshot",
    control: resolveAgentUiActionRequiredControl(input.actionType),
    payload: {
      actionType: input.actionType,
      toolName: definedString(input.toolName ?? undefined),
      promptPreview: truncateText(input.prompt),
      questionCount: input.questions?.length ?? 0,
      hasRequestedSchema: Boolean(input.requestedSchema),
    },
  };
}

export function buildAgentUiActionResolvedEvent(
  input: AgentUiActionResolvedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "action_resolved" },
    context,
  );
  const dataRecord = readRecord(input.data);
  return {
    ...base,
    ...resolveActionScope(input.scope, base),
    type: "action.resolved",
    actionId: input.requestId,
    owner: "action",
    scope: "action_request",
    phase: "completed",
    surface: "hitl",
    persistence: "snapshot",
    control: resolveAgentUiActionResolvedControl(
      input.actionType,
      input.approved,
    ),
    payload: {
      actionType: input.actionType,
      decisionKind: readStringField(dataRecord, [
        "decision_kind",
        "decisionKind",
      ]),
      approved: input.approved,
      feedbackPreview: truncateText(input.feedback),
      permissionMode: definedString(input.permissionMode ?? undefined),
      targetSessionId: readStringField(dataRecord, [
        "target_session_id",
        "targetSessionId",
      ]),
      planFile: readStringField(dataRecord, ["plan_file", "planFile"]),
      planId: readStringField(dataRecord, ["plan_id", "planId"]),
      awaitingLeaderApproval: readBooleanField(dataRecord, [
        "awaiting_leader_approval",
        "awaitingLeaderApproval",
      ]),
      responseMetadataKeys: metadataKeys(input.data),
    },
  };
}

function resolveActionScope(
  scope: AgentUiActionProjectionScope | undefined,
  base: Pick<AgentUiProjectionEvent, "sessionId" | "threadId" | "turnId">,
): Pick<AgentUiProjectionEvent, "sessionId" | "threadId" | "turnId"> {
  return {
    sessionId: definedString(scope?.sessionId ?? undefined) ?? base.sessionId,
    threadId: definedString(scope?.threadId ?? undefined) ?? base.threadId,
    turnId: definedString(scope?.turnId ?? undefined) ?? base.turnId,
  };
}
