interface ArticleWorkspaceObjectArtifactSource {
  artifactIds?: unknown;
}

interface ArticleWorkspaceObjectWithArtifacts {
  previewArtifactId?: string | null;
  ref: {
    artifactIds?: string[];
  };
  source?: ArticleWorkspaceObjectArtifactSource | null;
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

export function resolveWorkspaceArticleObjectArtifactIds(
  object: ArticleWorkspaceObjectWithArtifacts,
): string[] {
  const ids = new Set<string>();
  for (const artifactId of object.ref.artifactIds ?? []) {
    const normalized = artifactId.trim();
    if (normalized) {
      ids.add(normalized);
    }
  }
  const previewArtifactId = object.previewArtifactId?.trim();
  if (previewArtifactId) {
    ids.add(previewArtifactId);
  }
  const sourceArtifactIds = readArray(object.source?.artifactIds).filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
  for (const artifactId of sourceArtifactIds) {
    ids.add(artifactId.trim());
  }
  return Array.from(ids);
}
