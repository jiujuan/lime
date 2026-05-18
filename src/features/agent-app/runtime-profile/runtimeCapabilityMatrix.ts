import type {
  HostCapabilityProfile,
  LimeRuntimeProfileCapability,
} from "../types";

export function buildRuntimeCapabilityMatrix(
  profile: HostCapabilityProfile,
): Record<string, LimeRuntimeProfileCapability> {
  return Object.fromEntries(
    Object.entries(profile.capabilities).map(([capability, value]) => [
      capability,
      {
        version: value.version,
        available: value.enabled,
        reason: value.enabled ? undefined : "capability_disabled_in_host_profile",
        implementation: value.implementation,
      },
    ]),
  );
}
