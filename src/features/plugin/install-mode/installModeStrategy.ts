import type {
  PluginInstallMode,
  PluginInstallProjection,
  HostCapabilityProfile,
  InstallModeReadiness,
  NormalizedPluginInstallContract,
} from "../types";
import { projectInstallContract } from "./installModeProjection";
import { checkInstallModeReadiness } from "./installModeReadiness";

export interface InstallModeStrategy {
  readonly mode: PluginInstallMode;
  project(install: NormalizedPluginInstallContract): PluginInstallProjection;
  checkReadiness(params: {
    install: NormalizedPluginInstallContract;
    profile: HostCapabilityProfile;
  }): InstallModeReadiness;
}

export function createInstallModeStrategy(mode: PluginInstallMode): InstallModeStrategy {
  return {
    mode,
    project: projectInstallContract,
    checkReadiness: ({ install, profile }) =>
      checkInstallModeReadiness({ install, profile, mode }),
  };
}
