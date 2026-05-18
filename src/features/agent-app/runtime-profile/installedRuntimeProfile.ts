import type {
  AgentAppInstallMode,
  HostCapabilityProfile,
  InstalledAgentAppState,
  InstalledAppPreview,
  LimeRuntimeProfile,
} from "../types";
import { buildLimeRuntimeProfileFromHostProfile } from "./resolveRuntimeProfile";

export function buildLimeRuntimeProfileForPreview(params: {
  preview: InstalledAppPreview;
  hostProfile: HostCapabilityProfile;
  installMode?: AgentAppInstallMode;
}): LimeRuntimeProfile {
  return buildLimeRuntimeProfileFromHostProfile({
    appId: params.preview.identity.appId,
    installMode: params.installMode ?? params.preview.projection.install.preferredMode,
    hostProfile: params.hostProfile,
    storageNamespace: params.preview.projection.storage?.namespace,
  });
}

export function buildLimeRuntimeProfileForInstalledState(params: {
  state: InstalledAgentAppState;
  hostProfile: HostCapabilityProfile;
}): LimeRuntimeProfile {
  return buildLimeRuntimeProfileFromHostProfile({
    appId: params.state.appId,
    installMode: params.state.installMode,
    hostProfile: params.hostProfile,
    storageNamespace: params.state.projection.storage?.namespace,
  });
}
