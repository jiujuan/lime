import { resolveAgentAppHostFlags } from "../featureFlag";
import type { HostCapabilityProfile } from "../types";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";

export const APP_CENTER_AGENT_APP_FLAGS = resolveAgentAppHostFlags({
  labEnabled: true,
  localPackageEnabled: true,
  projectionEnabled: true,
  readinessEnabled: true,
  cleanupDryRunEnabled: true,
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
  workerRuntimeEnabled: true,
  cloudBootstrapEnabled: true,
});

export function buildAppCenterRuntimeCapabilityProfile(): HostCapabilityProfile {
  return buildWorkflowRuntimeCapabilityProfile({
    ...APP_CENTER_AGENT_APP_FLAGS,
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
}
