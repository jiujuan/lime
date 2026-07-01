import type {
  HostCapabilityProfile,
  InstalledAgentAppState,
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

export interface RepairStaleInstalledAgentAppReadinessDeps {
  reviewLocalPackage: (params: {
    appDir: string;
    profile: HostCapabilityProfile;
    sourceKind: "local_folder";
  }) => Promise<{ state: InstalledAgentAppState }>;
  saveInstalledState: (params: {
    state: InstalledAgentAppState;
  }) => Promise<InstalledAgentAppState>;
}

function isRepairableMissingCapabilityIssue(issue: ReadinessIssue): boolean {
  return (
    issue.code === "CAPABILITY_MISSING" &&
    typeof issue.capability === "string" &&
    REPAIRABLE_MISSING_CAPABILITIES.has(issue.capability)
  );
}

export function shouldRepairStaleInstalledAgentAppReadiness(
  state: InstalledAgentAppState,
): boolean {
  return (
    state.identity.sourceKind === "local_folder" &&
    Boolean(state.identity.sourceUri.trim()) &&
    state.readiness.status === "blocked" &&
    state.readiness.blockers.length > 0 &&
    state.readiness.blockers.every(isRepairableMissingCapabilityIssue)
  );
}

export async function repairStaleInstalledAgentAppReadiness(
  state: InstalledAgentAppState,
  profile: HostCapabilityProfile,
  deps: RepairStaleInstalledAgentAppReadinessDeps,
): Promise<InstalledAgentAppState> {
  if (!shouldRepairStaleInstalledAgentAppReadiness(state)) {
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

export async function repairStaleInstalledAgentAppReadinessList(
  states: readonly InstalledAgentAppState[],
  profile: HostCapabilityProfile,
  deps: RepairStaleInstalledAgentAppReadinessDeps,
): Promise<InstalledAgentAppState[]> {
  let changed = false;
  const repaired = await Promise.all(
    states.map(async (state) => {
      const next = await repairStaleInstalledAgentAppReadiness(
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
