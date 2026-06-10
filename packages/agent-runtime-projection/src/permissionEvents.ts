import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { definedString, readStringArray } from "./normalization.js";
import {
  normalizeRuntimePhaseFromRuntimeStatusPhase,
  type AgentRuntimeStatusPhase,
} from "./runtimeFacts.js";

export interface AgentUiRuntimePermissionMetadataInput {
  permission_status?: string | null;
  confirmation_status?: string | null;
  confirmation_request_id?: string | null;
  confirmation_source?: string | null;
  decision_source?: string | null;
  decision_scope?: string | null;
  required_profile_keys?: unknown;
  ask_profile_keys?: unknown;
  blocking_profile_keys?: unknown;
  declared_only?: boolean;
  turn_gating?: boolean;
}

export interface AgentUiRuntimePermissionProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  phase: AgentRuntimeStatusPhase;
  metadata?: AgentUiRuntimePermissionMetadataInput | null;
}

export function buildAgentUiRuntimePermissionChangedEvent(
  input: AgentUiRuntimePermissionProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  const metadata = input.metadata;
  if (!hasAgentUiRuntimePermissionMetadata(metadata)) {
    return null;
  }

  const confirmationRequestId = definedString(
    metadata?.confirmation_request_id,
  );
  const requiredProfileKeys = readStringArray(metadata?.required_profile_keys);
  const askProfileKeys = readStringArray(metadata?.ask_profile_keys);
  const blockingProfileKeys = readStringArray(metadata?.blocking_profile_keys);
  const requiresHumanControl =
    input.phase === "permission_review" ||
    Boolean(confirmationRequestId) ||
    askProfileKeys.length > 0 ||
    blockingProfileKeys.length > 0;

  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "runtime_status" },
      context,
    ),
    type: "permission.changed",
    actionId: confirmationRequestId,
    owner: "policy",
    scope: "run",
    phase: resolveAgentUiRuntimePermissionPhase(input),
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
      sourcePhase: input.phase,
    },
  };
}

export function hasAgentUiRuntimePermissionMetadata(
  metadata: AgentUiRuntimePermissionMetadataInput | null | undefined,
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

export function resolveAgentUiRuntimePermissionPhase(
  input: AgentUiRuntimePermissionProjectionInput,
): AgentUiPhase {
  const metadata = input.metadata;
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
    input.phase === "permission_review" ||
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

  return normalizeRuntimePhaseFromRuntimeStatusPhase(input.phase);
}
