import type { Artifact } from "@/lib/artifact/types";

export function resolveSettledWorkbenchArtifacts(
  artifacts: Artifact[],
  settledLiveArtifact: Artifact | null,
): Artifact[] {
  if (!settledLiveArtifact) {
    return artifacts;
  }

  let updated = false;
  const nextArtifacts = artifacts.map((artifact) => {
    if (artifact.id !== settledLiveArtifact.id) {
      return artifact;
    }

    updated = updated || artifact !== settledLiveArtifact;
    return settledLiveArtifact;
  });

  return updated ? nextArtifacts : artifacts;
}
