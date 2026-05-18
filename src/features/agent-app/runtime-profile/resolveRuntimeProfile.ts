import type {
  AgentAppInstallMode,
  HostCapabilityProfile,
  LimeRuntimeProfile,
  LimeRuntimeShellKind,
} from "../types";
import { shellKindForInstallMode } from "./LimeRuntimeProfile";
import { buildRuntimeCapabilityMatrix } from "./runtimeCapabilityMatrix";

export interface RuntimeProfileResolveInput {
  appId: string;
  installMode: AgentAppInstallMode;
  hostProfile: HostCapabilityProfile;
  shellKind?: LimeRuntimeShellKind;
  storageNamespace?: string;
}

export interface RuntimeProfilePort {
  resolve(input: RuntimeProfileResolveInput): Promise<LimeRuntimeProfile>;
}

function externalSideEffectsPolicy(
  installMode: AgentAppInstallMode,
): LimeRuntimeProfile["policy"]["externalSideEffects"] {
  if (installMode === "web_host") {
    return "deny";
  }
  if (installMode === "standalone" || installMode === "runtime_backed") {
    return "confirm";
  }
  return "confirm";
}

export function buildLimeRuntimeProfileFromHostProfile(
  input: RuntimeProfileResolveInput,
): LimeRuntimeProfile {
  const shellKind = input.shellKind ?? shellKindForInstallMode(input.installMode);
  return {
    runtimeId: `${input.appId}:${input.installMode}:${input.hostProfile.appRuntimeVersion}`,
    runtimeVersion: input.hostProfile.appRuntimeVersion,
    shellKind,
    installMode: input.installMode,
    capabilities: buildRuntimeCapabilityMatrix(input.hostProfile),
    policy: {
      permissionPrompt: "required",
      externalSideEffects: externalSideEffectsPolicy(input.installMode),
      maxRisk: input.installMode === "web_host" ? "low" : "medium",
    },
    storage: {
      namespaceRoot: input.storageNamespace ?? `<LimeAppData>/agent-apps/storage/${input.appId}`,
      cleanupSupported: true,
    },
    evidence: {
      recordRequired: input.installMode !== "web_host",
      exportSupported: true,
    },
  };
}

export class StaticRuntimeProfilePort implements RuntimeProfilePort {
  async resolve(input: RuntimeProfileResolveInput): Promise<LimeRuntimeProfile> {
    return buildLimeRuntimeProfileFromHostProfile(input);
  }
}
