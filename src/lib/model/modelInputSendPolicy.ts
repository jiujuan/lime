import type {
  ModelCapabilitySendGateResult,
} from "./modelCapabilitySendGate";
import type { ModelModality } from "@/lib/types/modelRegistry";

export type ModelInputSendPolicyStatus = "enabled" | "warning" | "blocked";

export interface ModelInputSendPolicy {
  status: ModelInputSendPolicyStatus;
  canSubmit: boolean;
  shouldWarn: boolean;
  shouldDisableComposer: boolean;
  failClosedAtSubmit: boolean;
  reason: ModelCapabilitySendGateResult["reason"];
  requiredInputModalities: ModelModality[];
  missingInputModalities: ModelModality[];
}

export interface BuildModelInputSendPolicyOptions {
  failClosedOnUnknownMedia?: boolean;
}

export const DEFAULT_MODEL_INPUT_SEND_POLICY_OPTIONS: Required<BuildModelInputSendPolicyOptions> =
  {
    failClosedOnUnknownMedia: true,
  };

export function buildModelInputSendPolicy(
  gate: ModelCapabilitySendGateResult,
  options?: BuildModelInputSendPolicyOptions,
): ModelInputSendPolicy {
  const resolvedOptions = {
    ...DEFAULT_MODEL_INPUT_SEND_POLICY_OPTIONS,
    ...options,
  };
  const unknownMediaWillFailClosed =
    gate.status === "unknown" &&
    gate.requiresMediaInput &&
    resolvedOptions.failClosedOnUnknownMedia;
  const blocked = gate.status === "blocked" || unknownMediaWillFailClosed;
  const warning = gate.status === "unknown" && !blocked;

  return {
    status: blocked ? "blocked" : warning ? "warning" : "enabled",
    canSubmit: !blocked,
    shouldWarn: warning || blocked,
    shouldDisableComposer: blocked,
    failClosedAtSubmit: blocked,
    reason: gate.reason,
    requiredInputModalities: gate.requiredInputModalities,
    missingInputModalities: gate.missingInputModalities,
  };
}
