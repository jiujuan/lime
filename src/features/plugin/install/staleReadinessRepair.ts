import type {
  HostCapabilityProfile,
  InstalledPluginState,
  ReadinessIssue,
} from "../types";

const REPAIRABLE_MISSING_CAPABILITIES = new Set([
  "lime.agent",
  "lime.artifacts",
  "lime.evidence",
  "lime.knowledge",
  "lime.storage",
  "lime.workflow",
]);

export interface RepairStaleInstalledPluginReadinessDeps {
  reviewLocalPackage: (params: {
    appDir: string;
    profile: HostCapabilityProfile;
    sourceKind: "local_folder";
  }) => Promise<{ state: InstalledPluginState }>;
  saveInstalledState: (params: {
    state: InstalledPluginState;
  }) => Promise<InstalledPluginState>;
}

function isRepairableMissingCapabilityIssue(issue: ReadinessIssue): boolean {
  return (
    issue.code === "CAPABILITY_MISSING" &&
    typeof issue.capability === "string" &&
    REPAIRABLE_MISSING_CAPABILITIES.has(issue.capability)
  );
}

export function shouldRepairStaleInstalledPluginReadiness(
  state: InstalledPluginState,
): boolean {
  return (
    state.identity.sourceKind === "local_folder" &&
    Boolean(state.identity.sourceUri.trim()) &&
    state.readiness.status === "blocked" &&
    state.readiness.blockers.length > 0 &&
    state.readiness.blockers.every(isRepairableMissingCapabilityIssue)
  );
}

export async function repairStaleInstalledPluginReadiness(
  state: InstalledPluginState,
  profile: HostCapabilityProfile,
  deps: RepairStaleInstalledPluginReadinessDeps,
): Promise<InstalledPluginState> {
  if (!shouldRepairStaleInstalledPluginReadiness(state)) {
    return state;
  }
  const review = await deps.reviewLocalPackage({
    appDir: state.identity.sourceUri,
    profile,
    sourceKind: "local_folder",
  });
  if (review.state.readiness.status === "blocked") {
    return state;
  }
  return deps.saveInstalledState({
    state: review.state,
  });
}

export async function repairStaleInstalledPluginReadinessList(
  states: readonly InstalledPluginState[],
  profile: HostCapabilityProfile,
  deps: RepairStaleInstalledPluginReadinessDeps,
): Promise<InstalledPluginState[]> {
  let changed = false;
  const repaired = await Promise.all(
    states.map(async (state) => {
      const next = await repairStaleInstalledPluginReadiness(
        state,
        profile,
        deps,
      );
      changed ||= next !== state;
      return next;
    }),
  );
  return changed ? repaired : [...states];
}
