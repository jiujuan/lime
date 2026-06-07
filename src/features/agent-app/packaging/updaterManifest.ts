import type { AgentAppStandaloneArtifactBuildPlan } from "./artifactBuilder";
import type {
  AgentAppStandaloneReleaseGate,
  AgentAppStandaloneReleasePlan,
} from "./releasePlan";

export type AgentAppUpdaterManifestBlockerCode =
  | AgentAppStandaloneReleaseGate["code"]
  | "ARTIFACT_BUILD_BLOCKED";

export interface AgentAppUpdaterManifestBlocker {
  code: AgentAppUpdaterManifestBlockerCode;
  message: string;
  source: "artifact_build" | "release_plan";
}

export interface AgentAppStandaloneUpdaterManifestPlan {
  schemaVersion: 1;
  appId: string;
  channel: AgentAppStandaloneReleasePlan["channel"];
  descriptorHash: string;
  endpoint?: string;
  endpointConfigured: boolean;
  rollbackRequired: boolean;
  rollbackConfigured: boolean;
  status: "blocked";
  readyToPublish: false;
  blockers: AgentAppUpdaterManifestBlocker[];
  manifestRef?: never;
}

export interface AgentAppStandaloneUpdaterManifestPlanInput {
  releasePlan: AgentAppStandaloneReleasePlan;
  artifactBuildPlan: AgentAppStandaloneArtifactBuildPlan;
}

function dedupeBlockers(
  blockers: AgentAppUpdaterManifestBlocker[],
): AgentAppUpdaterManifestBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.source}:${blocker.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStandaloneUpdaterManifestPlan(
  input: AgentAppStandaloneUpdaterManifestPlanInput,
): AgentAppStandaloneUpdaterManifestPlan {
  const { releasePlan, artifactBuildPlan } = input;
  const blockers: AgentAppUpdaterManifestBlocker[] = releasePlan.blockers.map((blocker) => ({
    code: blocker.code,
    message: blocker.message,
    source: "release_plan",
  }));

  if (artifactBuildPlan.status === "blocked") {
    blockers.push({
      code: "ARTIFACT_BUILD_BLOCKED",
      message: "Updater manifest cannot be published until production artifacts are built.",
      source: "artifact_build",
    });
  }

  return {
    schemaVersion: 1,
    appId: releasePlan.appId,
    channel: releasePlan.channel,
    descriptorHash: releasePlan.descriptorHash,
    endpoint: releasePlan.updater.endpoint,
    endpointConfigured: releasePlan.updater.endpointConfigured,
    rollbackRequired: releasePlan.rollback.required,
    rollbackConfigured: releasePlan.rollback.configured,
    status: "blocked",
    readyToPublish: false,
    blockers: dedupeBlockers(blockers),
  };
}
