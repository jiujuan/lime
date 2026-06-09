import type {
  AgentEventActionRequired,
  AgentEventActionResolved,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiControl,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  metadataKeys,
  readBooleanField,
  readRecord,
  readStringField,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

function actionControl(
  event: AgentEventActionRequired,
): AgentUiControl | undefined {
  if (event.action_type === "ask_user" || event.action_type === "elicitation") {
    return "answer";
  }
  if (event.action_type === "tool_confirmation") {
    return "approve";
  }
  return undefined;
}

function resolvedActionControl(
  event: AgentEventActionResolved,
): AgentUiControl | undefined {
  if (event.action_type === "ask_user" || event.action_type === "elicitation") {
    return "answer";
  }
  if (event.action_type === "plan_approval") {
    return event.approved === false ? "reject" : "approve";
  }
  if (event.action_type === "tool_confirmation") {
    return event.approved === false ? "reject" : "approve";
  }
  return undefined;
}

export function buildActionRequiredEvent(
  event: AgentEventActionRequired,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    sessionId: event.scope?.session_id ?? context.sessionId ?? undefined,
    threadId: event.scope?.thread_id ?? context.threadId ?? undefined,
    turnId: event.scope?.turn_id ?? context.turnId ?? undefined,
    type: "action.required",
    actionId: event.request_id,
    owner: "action",
    scope: "action_request",
    phase: "waiting",
    surface: "hitl",
    persistence: "snapshot",
    control: actionControl(event),
    payload: {
      actionType: event.action_type,
      toolName: event.tool_name,
      promptPreview: truncateText(event.prompt),
      questionCount: event.questions?.length ?? 0,
      hasRequestedSchema: Boolean(event.requested_schema),
    },
  };
}

export function buildActionResolvedEvent(
  event: AgentEventActionResolved,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const dataRecord = readRecord(event.data);
  return {
    ...buildBase(event, context),
    sessionId: event.scope?.session_id ?? context.sessionId ?? undefined,
    threadId: event.scope?.thread_id ?? context.threadId ?? undefined,
    turnId: event.scope?.turn_id ?? context.turnId ?? undefined,
    type: "action.resolved",
    actionId: event.request_id,
    owner: "action",
    scope: "action_request",
    phase: "completed",
    surface: "hitl",
    persistence: "snapshot",
    control: resolvedActionControl(event),
    payload: {
      actionType: event.action_type,
      decisionKind:
        typeof event.data?.decision_kind === "string"
          ? event.data.decision_kind
          : undefined,
      approved: event.approved,
      feedbackPreview: truncateText(event.feedback),
      permissionMode: event.permission_mode,
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
      responseMetadataKeys: metadataKeys(event.data),
    },
  };
}
