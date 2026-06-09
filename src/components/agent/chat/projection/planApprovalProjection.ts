import type {
  AgentUiPersistence,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  readBooleanField,
  readRecord,
  readStringField,
  truncateText,
} from "@limecloud/agent-runtime-projection";

type PlanApprovalProjectionBase = Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "taskId"
  | "partId"
  | "runtimeEntity"
>;

export interface PlanApprovalProjection {
  requestId: string;
  from?: string;
  planFilePath?: string;
  planContent?: string;
  timestamp?: string;
  deliveryTarget?: string;
  deliverySubmissionId?: string;
  awaitingLeaderApproval?: boolean;
}

export interface PlanApprovalResponseProjection {
  requestId: string;
  approved?: boolean;
  feedback?: string;
  permissionMode?: string;
  timestamp?: string;
  targetSessionId?: string;
  deliveryTarget?: string;
  deliverySubmissionId?: string;
}

export function extractPlanApprovalProjection(
  metadata: unknown,
): PlanApprovalProjection | null {
  const record = readRecord(metadata);
  const requestRecord = readRecord(record?.plan_approval_request);
  if (!requestRecord) {
    return null;
  }

  const requestId =
    readStringField(requestRecord, ["request_id", "requestId", "id"]) ??
    readStringField(record, ["pending_request_id", "pendingRequestId"]);
  if (!requestId) {
    return null;
  }

  const deliveryRecord = readRecord(record?.plan_approval_delivery);
  return {
    requestId,
    from: readStringField(requestRecord, ["from", "sender", "agent"]),
    planFilePath: readStringField(requestRecord, [
      "plan_file_path",
      "planFilePath",
    ]),
    planContent: readStringField(requestRecord, [
      "plan_content",
      "planContent",
    ]),
    timestamp: readStringField(requestRecord, ["timestamp", "created_at"]),
    deliveryTarget: readStringField(deliveryRecord, ["target"]),
    deliverySubmissionId: readStringField(deliveryRecord, [
      "submission_id",
      "submissionId",
    ]),
    awaitingLeaderApproval:
      readBooleanField(record, ["awaiting_leader_approval"]) ?? true,
  };
}

export function extractPlanApprovalResponseProjection(
  metadata: unknown,
): PlanApprovalResponseProjection | null {
  const record = readRecord(metadata);
  const sendMessageRecord = readRecord(record?.send_message);
  const deliveryRecord = readRecord(record?.plan_approval_delivery);
  const deliveryExtraRecord = readRecord(deliveryRecord?.extra);
  const responseRecord =
    readRecord(record?.plan_approval_response) ??
    readRecord(sendMessageRecord?.plan_approval_response) ??
    readRecord(deliveryExtraRecord?.plan_approval_response);
  if (!responseRecord) {
    return null;
  }

  const requestId =
    readStringField(responseRecord, ["request_id", "requestId", "id"]) ??
    readStringField(sendMessageRecord, ["request_id", "requestId"]);
  if (!requestId) {
    return null;
  }

  return {
    requestId,
    approved: readBooleanField(responseRecord, ["approved", "approve"]),
    feedback: readStringField(responseRecord, ["feedback", "reason"]),
    permissionMode: readStringField(responseRecord, [
      "permission_mode",
      "permissionMode",
    ]),
    timestamp: readStringField(responseRecord, ["timestamp", "created_at"]),
    targetSessionId: readStringField(responseRecord, [
      "target_session_id",
      "targetSessionId",
    ]),
    deliveryTarget:
      readStringField(responseRecord, ["delivery_target", "deliveryTarget"]) ??
      readStringField(sendMessageRecord, ["target"]),
    deliverySubmissionId:
      readStringField(responseRecord, [
        "delivery_submission_id",
        "deliverySubmissionId",
        "submission_id",
        "submissionId",
      ]) ?? readStringField(deliveryRecord, ["submission_id", "submissionId"]),
  };
}

export function buildPlanApprovalRequiredEvent(params: {
  base: PlanApprovalProjectionBase;
  projection: PlanApprovalProjection;
  persistence: AgentUiPersistence;
  toolCallId?: string;
}): AgentUiProjectionEvent {
  const { base, projection, persistence, toolCallId } = params;
  return {
    ...base,
    type: "action.required",
    actionId: projection.requestId,
    ...(toolCallId ? { toolCallId } : {}),
    owner: "action",
    scope: "action_request",
    phase: "waiting",
    surface: "hitl",
    persistence,
    control: "approve",
    payload: {
      actionType: "plan_approval",
      decisionKind: "plan_approval_request",
      from: projection.from,
      planFilePath: projection.planFilePath,
      planContentPreview: truncateText(projection.planContent),
      planContentLength: projection.planContent?.length ?? 0,
      timestamp: projection.timestamp,
      deliveryTarget: projection.deliveryTarget,
      deliverySubmissionId: projection.deliverySubmissionId,
      awaitingLeaderApproval: projection.awaitingLeaderApproval,
    },
  };
}

export function buildPlanApprovalResolvedEvent(params: {
  base: PlanApprovalProjectionBase;
  projection: PlanApprovalResponseProjection;
  persistence: AgentUiPersistence;
  toolCallId?: string;
}): AgentUiProjectionEvent {
  const { base, projection, persistence, toolCallId } = params;
  return {
    ...base,
    type: "action.resolved",
    actionId: projection.requestId,
    ...(toolCallId ? { toolCallId } : {}),
    owner: "action",
    scope: "action_request",
    phase: "completed",
    surface: "hitl",
    persistence,
    control: projection.approved === false ? "reject" : "approve",
    payload: {
      actionType: "plan_approval",
      decisionKind: "plan_approval_response",
      approved: projection.approved,
      feedbackPreview: truncateText(projection.feedback),
      permissionMode: projection.permissionMode,
      timestamp: projection.timestamp,
      targetSessionId: projection.targetSessionId,
      deliveryTarget: projection.deliveryTarget,
      deliverySubmissionId: projection.deliverySubmissionId,
    },
  };
}
