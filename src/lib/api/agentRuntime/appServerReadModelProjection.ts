import type {
  AppServerAgentSessionReadResponse,
  AppServerAgentSessionStatus,
  AppServerAgentTurn,
  AppServerAgentTurnStatus,
} from "@/lib/api/appServer";
import { normalizeThreadReadModel } from "./normalizers";
import type {
  AgentRuntimeProfileStatus,
  AgentRuntimeThreadReadModel,
  AgentRuntimeThreadTurnProfileView,
} from "./sessionTypes";

export type AppServerAgentSessionReadProjectionInput =
  AppServerAgentSessionReadResponse & {
    detail?: unknown;
  };

export function projectAppServerSessionReadToThreadReadModel(
  response: AppServerAgentSessionReadProjectionInput,
): AgentRuntimeThreadReadModel {
  const detailThreadRead = normalizeThreadReadModel(
    readDetailThreadRead(response.detail),
  );
  const sessionBusinessObjectRefMetadata =
    readSessionBusinessObjectRefMetadata(response);
  const hasDetailSessionBusinessObjectRefMetadata = detailThreadRead
    ? Object.prototype.hasOwnProperty.call(
        detailThreadRead,
        "session_business_object_ref_metadata",
      )
    : false;
  const sessionStatus = profileStatusFromSessionStatus(response.session.status);
  const protocolTurns = response.turns.map(projectAppServerTurn);
  const projected: AgentRuntimeThreadReadModel = {
    ...(detailThreadRead ?? {}),
    thread_id: response.session.threadId,
    status: detailThreadRead?.status ?? sessionStatus,
    profile_status: detailThreadRead?.profile_status ?? sessionStatus,
    active_turn_id:
      detailThreadRead?.active_turn_id ?? inferActiveTurnId(response.turns),
    turns:
      detailThreadRead?.turns && detailThreadRead.turns.length > 0
        ? detailThreadRead.turns
        : protocolTurns,
    pending_requests: detailThreadRead?.pending_requests ?? [],
    incidents: detailThreadRead?.incidents ?? [],
    queued_turns: detailThreadRead?.queued_turns ?? [],
    updated_at: response.session.updatedAt,
  };
  const projectedSessionBusinessObjectRefMetadata =
    hasDetailSessionBusinessObjectRefMetadata
      ? (detailThreadRead?.session_business_object_ref_metadata ?? null)
      : sessionBusinessObjectRefMetadata;
  if (
    projectedSessionBusinessObjectRefMetadata ||
    hasDetailSessionBusinessObjectRefMetadata
  ) {
    projected.session_business_object_ref_metadata =
      projectedSessionBusinessObjectRefMetadata;
  }
  return normalizeThreadReadModel(projected) as AgentRuntimeThreadReadModel;
}

function projectAppServerTurn(
  turn: AppServerAgentTurn,
): AgentRuntimeThreadTurnProfileView {
  return {
    turn_id: turn.turnId,
    status: profileStatusFromTurnStatus(turn.status),
    native_status: turn.status,
  };
}

function inferActiveTurnId(turns: AppServerAgentTurn[]): string | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn && isActiveTurnStatus(turn.status)) {
      return turn.turnId;
    }
  }
  return undefined;
}

function isActiveTurnStatus(status: AppServerAgentTurnStatus): boolean {
  return (
    status === "accepted" || status === "running" || status === "waitingAction"
  );
}

function profileStatusFromSessionStatus(
  status: AppServerAgentSessionStatus,
): AgentRuntimeProfileStatus {
  switch (status) {
    case "idle":
      return "idle";
    case "running":
      return "running";
    case "waitingAction":
      return "blocked";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
  }
}

function profileStatusFromTurnStatus(
  status: AppServerAgentTurnStatus,
): AgentRuntimeProfileStatus {
  switch (status) {
    case "accepted":
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "waitingAction":
      return "blocked";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
  }
}

function readDetailThreadRead(
  detail: unknown,
): AgentRuntimeThreadReadModel | null {
  const detailRecord = asRecord(detail);
  const threadRead =
    detailRecord?.thread_read ?? detailRecord?.threadRead ?? null;
  return asRecord(threadRead) as AgentRuntimeThreadReadModel | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readSessionBusinessObjectRefMetadata(
  response: AppServerAgentSessionReadProjectionInput,
): Record<string, unknown> | null {
  return asRecord(response.session.businessObjectRef?.metadata);
}
