export interface ResolveActiveArtifactViewTargetIdParams {
  displayedArtifact?: { id?: string | null } | null;
  currentCanvasArtifact?: { id?: string | null } | null;
  selectedArtifact?: { id?: string | null } | null;
  liveArtifact?: { id?: string | null } | null;
}

export function resolveActiveArtifactViewTargetId({
  displayedArtifact,
  currentCanvasArtifact,
  selectedArtifact,
  liveArtifact,
}: ResolveActiveArtifactViewTargetIdParams): string | null {
  return (
    displayedArtifact?.id ||
    currentCanvasArtifact?.id ||
    selectedArtifact?.id ||
    liveArtifact?.id ||
    null
  );
}
