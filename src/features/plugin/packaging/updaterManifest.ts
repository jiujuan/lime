import type { PluginStandaloneArtifactBuildPlan } from "./artifactBuilder";
import type {
  PluginStandaloneReleaseGate,
  PluginStandaloneReleasePlan,
} from "./releasePlan";

export type PluginUpdaterManifestBlockerCode =
  | PluginStandaloneReleaseGate["code"]
  | "ARTIFACT_BUILD_BLOCKED";

export interface PluginUpdaterManifestBlocker {
  code: PluginUpdaterManifestBlockerCode;
  message: string;
  source: "artifact_build" | "release_plan";
}

export interface PluginStandaloneUpdaterManifestPlan {
  schemaVersion: 1;
  appId: string;
  channel: PluginStandaloneReleasePlan["channel"];
  descriptorHash: string;
  endpoint?: string;
  endpointConfigured: boolean;
  rollbackRequired: boolean;
  rollbackConfigured: boolean;
  status: "blocked";
  readyToPublish: false;
  blockers: PluginUpdaterManifestBlocker[];
  manifestRef?: never;
}

export interface PluginStandaloneUpdaterManifestPlanInput {
  releasePlan: PluginStandaloneReleasePlan;
  artifactBuildPlan: PluginStandaloneArtifactBuildPlan;
}

function dedupeBlockers(
  blockers: PluginUpdaterManifestBlocker[],
): PluginUpdaterManifestBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.source}:${blocker.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStandaloneUpdaterManifestPlan(
  input: PluginStandaloneUpdaterManifestPlanInput,
): PluginStandaloneUpdaterManifestPlan {
  const { releasePlan, artifactBuildPlan } = input;
  const blockers: PluginUpdaterManifestBlocker[] = releasePlan.blockers.map((blocker) => ({
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
