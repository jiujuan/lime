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

function isLocalFolderInstalledState(state: InstalledPluginState): boolean {
  return (
    state.identity.sourceKind === "local_folder" &&
    Boolean(state.identity.sourceUri.trim())
  );
}

function hasSnapshotIdentityChanged(
  current: InstalledPluginState,
  next: InstalledPluginState,
): boolean {
  return (
    current.identity.appVersion !== next.identity.appVersion ||
    current.identity.packageHash !== next.identity.packageHash ||
    current.identity.manifestHash !== next.identity.manifestHash
  );
}

function preserveUserInstallState(
  current: InstalledPluginState,
  next: InstalledPluginState,
): InstalledPluginState {
  return {
    ...next,
    disabled: current.disabled,
    installedAt: current.installedAt,
    installMode: current.installMode,
  };
}

export async function repairStaleInstalledPluginReadiness(
  state: InstalledPluginState,
  profile: HostCapabilityProfile,
  deps: RepairStaleInstalledPluginReadinessDeps,
): Promise<InstalledPluginState> {
  if (!isLocalFolderInstalledState(state)) {
    return state;
  }
  const shouldRepairReadiness =
    shouldRepairStaleInstalledPluginReadiness(state);
  const review = await deps.reviewLocalPackage({
    appDir: state.identity.sourceUri,
    profile,
    sourceKind: "local_folder",
  });
  const snapshotChanged = hasSnapshotIdentityChanged(state, review.state);
  if (!shouldRepairReadiness && !snapshotChanged) {
    return state;
  }
  if (review.state.readiness.status === "blocked") {
    return state;
  }
  return deps.saveInstalledState({
    state: preserveUserInstallState(state, review.state),
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
