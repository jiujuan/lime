import type {
  AgentAppInstallMode,
  AgentAppInstallProjection,
  HostCapabilityProfile,
  InstallModeReadiness,
  NormalizedAgentAppInstallContract,
} from "../types";
import { projectInstallContract } from "./installModeProjection";
import { checkInstallModeReadiness } from "./installModeReadiness";

export interface InstallModeStrategy {
  readonly mode: AgentAppInstallMode;
  project(install: NormalizedAgentAppInstallContract): AgentAppInstallProjection;
  checkReadiness(params: {
    install: NormalizedAgentAppInstallContract;
    profile: HostCapabilityProfile;
  }): InstallModeReadiness;
}

export function createInstallModeStrategy(mode: AgentAppInstallMode): InstallModeStrategy {
  return {
    mode,
    project: projectInstallContract,
    checkReadiness: ({ install, profile }) =>
      checkInstallModeReadiness({ install, profile, mode }),
  };
}
