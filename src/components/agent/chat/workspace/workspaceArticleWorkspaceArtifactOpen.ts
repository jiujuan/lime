import type { Artifact } from "@/lib/artifact/types";
import {
  buildWorkspaceArticleWorkspaceFromUnknown,
  type WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";
import { readWorkspaceArticleRecordFromMetadata } from "./workspaceArticleWorkspaceMetadata";
import { readWorkspaceArticlePatchRecordFromMetadata } from "./workspaceArticleWorkspaceMetadata";
import { resolveWorkspaceArticleObjectArtifactIds } from "./workspaceArticleWorkspaceObjectArtifacts";

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildArticleWorkspaceForArtifactOpen(
  artifact: Artifact,
  currentArticleWorkspace: WorkspaceArticleWorkspace | null,
): WorkspaceArticleWorkspace | null {
  const metadata = readRecord(artifact.meta);
  if (!metadata) {
    return null;
  }
  const openedFrom = readString(metadata.openedFrom) || "";
  const articleWorkspace = readWorkspaceArticleRecordFromMetadata(metadata);
  const workspacePatch = readWorkspaceArticlePatchRecordFromMetadata(metadata);
  const artifactDocument = readRecord(metadata.artifactDocument);
  const artifactDocumentMetadata = readRecord(artifactDocument?.metadata);
  const artifactDocumentArticleWorkspace =
    readWorkspaceArticleRecordFromMetadata(artifactDocumentMetadata);
  const isArticleWorkspaceArtifact =
    openedFrom === "right_surface_article_workspace" ||
    Boolean(articleWorkspace || artifactDocumentArticleWorkspace);
  if (!isArticleWorkspaceArtifact) {
    return null;
  }

  const workspaceFromArtifact = buildWorkspaceArticleWorkspaceFromUnknown(
    workspacePatch ?? articleWorkspace ?? artifactDocumentArticleWorkspace,
    "threadRead",
  );
  if (workspaceFromArtifact) {
    return workspaceFromArtifact;
  }

  if (
    currentArticleWorkspace &&
    artifactMatchesArticleWorkspace(
      artifact,
      articleWorkspace,
      currentArticleWorkspace,
    )
  ) {
    return currentArticleWorkspace;
  }
  return null;
}

function artifactMatchesArticleWorkspace(
  artifact: Artifact,
  articleWorkspaceMetadata: Record<string, unknown> | null,
  articleWorkspace: WorkspaceArticleWorkspace,
): boolean {
  const articleWorkspaceObjectKind = readString(
    articleWorkspaceMetadata?.objectKind,
  );
  const articleWorkspaceObjectId = readString(
    articleWorkspaceMetadata?.objectId,
  );
  const articleWorkspaceSessionId = readString(
    articleWorkspaceMetadata?.sessionId,
  );
  const artifactId = artifact.id.trim();
  return articleWorkspace.objects.some((object) => {
    if (
      articleWorkspaceObjectKind &&
      articleWorkspaceObjectId &&
      object.ref.kind === articleWorkspaceObjectKind &&
      object.ref.id === articleWorkspaceObjectId &&
      (!articleWorkspaceSessionId ||
        object.ref.sessionId === articleWorkspaceSessionId)
    ) {
      return true;
    }
    return resolveWorkspaceArticleObjectArtifactIds(object).includes(
      artifactId,
    );
  });
}
