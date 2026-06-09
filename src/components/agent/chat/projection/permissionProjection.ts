import type { AgentEventRuntimeStatus } from "@/lib/api/agentProtocol";
import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  definedString,
  normalizeRuntimePhaseFromRuntimeStatusPhase,
  readStringArray,
} from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase } from "./projectionBase";

function hasPermissionProjectionMetadata(
  metadata: AgentEventRuntimeStatus["status"]["metadata"],
): boolean {
  if (!metadata) {
    return false;
  }
  return Boolean(
    definedString(metadata.permission_status) ||
      definedString(metadata.confirmation_status) ||
      definedString(metadata.confirmation_request_id) ||
      definedString(metadata.confirmation_source) ||
      definedString(metadata.decision_source) ||
      definedString(metadata.decision_scope) ||
      readStringArray(metadata.required_profile_keys).length > 0 ||
      readStringArray(metadata.ask_profile_keys).length > 0 ||
      readStringArray(metadata.blocking_profile_keys).length > 0 ||
      typeof metadata.declared_only === "boolean" ||
      typeof metadata.turn_gating === "boolean",
  );
}

function normalizePermissionPhase(event: AgentEventRuntimeStatus): AgentUiPhase {
  const metadata = event.status.metadata;
  const permissionStatus = definedString(metadata?.permission_status);
  const confirmationStatus = definedString(metadata?.confirmation_status);

  if (
    permissionStatus === "blocked" ||
    permissionStatus === "denied" ||
    confirmationStatus === "denied"
  ) {
    return "failed";
  }

  if (
    event.status.phase === "permission_review" ||
    confirmationStatus === "not_requested" ||
    definedString(metadata?.confirmation_request_id) ||
    readStringArray(metadata?.ask_profile_keys).length > 0 ||
    readStringArray(metadata?.blocking_profile_keys).length > 0
  ) {
    return "waiting";
  }

  if (
    permissionStatus === "not_required" ||
    permissionStatus === "granted" ||
    permissionStatus === "approved" ||
    confirmationStatus === "resolved"
  ) {
    return "completed";
  }

  return normalizeRuntimePhaseFromRuntimeStatusPhase(event.status.phase);
}

export function buildPermissionChangedEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const metadata = event.status.metadata;
  if (!hasPermissionProjectionMetadata(metadata)) {
    return null;
  }

  const confirmationRequestId = definedString(
    metadata?.confirmation_request_id,
  );
  const requiredProfileKeys = readStringArray(metadata?.required_profile_keys);
  const askProfileKeys = readStringArray(metadata?.ask_profile_keys);
  const blockingProfileKeys = readStringArray(metadata?.blocking_profile_keys);
  const requiresHumanControl =
    event.status.phase === "permission_review" ||
    Boolean(confirmationRequestId) ||
    askProfileKeys.length > 0 ||
    blockingProfileKeys.length > 0;

  return {
    ...buildAgentUiProjectionBase(event, context),
    type: "permission.changed",
    actionId: confirmationRequestId,
    owner: "policy",
    scope: "run",
    phase: normalizePermissionPhase(event),
    surface: requiresHumanControl ? "hitl" : "runtime_status",
    persistence: "snapshot",
    control: confirmationRequestId ? "approve" : undefined,
    payload: {
      permissionStatus: definedString(metadata?.permission_status),
      confirmationStatus: definedString(metadata?.confirmation_status),
      confirmationRequestId,
      confirmationSource: definedString(metadata?.confirmation_source),
      decisionSource: definedString(metadata?.decision_source),
      decisionScope: definedString(metadata?.decision_scope),
      requiredProfileKeys,
      askProfileKeys,
      blockingProfileKeys,
      declaredOnly: metadata?.declared_only,
      turnGating: metadata?.turn_gating,
      sourcePhase: event.status.phase,
    },
  };
}
