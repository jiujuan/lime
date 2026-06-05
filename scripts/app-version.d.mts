export interface CargoVersions {
  workspaceVersion: string | null;
  packageVersion: string | null;
  packageVersionIsWorkspace: boolean;
  packageSectionExists: boolean;
}

export function readCargoVersions(cargoTomlPath: string): CargoVersions;

export function readWorkspaceAppVersion(repoRoot?: string): string | null;
