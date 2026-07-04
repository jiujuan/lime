import { resolvePluginHostFlags } from "../featureFlag";
import type { HostCapabilityProfile } from "../types";
import { buildUiRuntimeCapabilityProfile } from "./uiRuntimeCapabilityProfile";

export const APP_CENTER_PLUGIN_FLAGS = resolvePluginHostFlags({
  labEnabled: true,
  localPackageEnabled: true,
  projectionEnabled: true,
  readinessEnabled: true,
  cleanupDryRunEnabled: true,
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
  workerRuntimeEnabled: false,
  cloudBootstrapEnabled: true,
});

export function buildAppCenterRuntimeCapabilityProfile(): HostCapabilityProfile {
  return buildUiRuntimeCapabilityProfile({
    ...APP_CENTER_PLUGIN_FLAGS,
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: false,
  });
}
