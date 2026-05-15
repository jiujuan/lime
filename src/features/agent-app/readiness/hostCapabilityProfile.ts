import { defaultAgentAppHostFlags } from "../featureFlag";
import type { HostCapabilityProfile } from "../types";

export const p0HostCapabilityProfile: HostCapabilityProfile = {
  appRuntimeVersion: "0.3.0",
  runtimeTargets: ["local"],
  capabilities: {
    "lime.ui": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.storage": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.files": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.agent": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.knowledge": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.tools": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.artifacts": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.evidence": { version: "0.3.0", enabled: false, implementation: "none" },
    "lime.workflow": { version: "0.3.0", enabled: false, implementation: "none" },
  },
  featureFlags: defaultAgentAppHostFlags,
};
