import { normalizeArtifactProtocolPath } from "@/lib/artifact-protocol";
import {
  isWorkspaceArticlePatchArtifactKind,
  isWorkspaceArticlePatchArtifactPath,
} from "../workspace/workspaceArticleWorkspaceMetadata";

interface ConversationArtifactVisibilityTarget {
  content?: string;
  meta?: Record<string, unknown>;
  title?: string;
}

function normalizeArtifactPath(path?: string | null): string {
  return path ? normalizeArtifactProtocolPath(path) : "";
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function isHiddenInternalArtifactPath(path?: string | null): boolean {
  const normalizedPath = normalizeArtifactPath(path);
  if (!normalizedPath || !normalizedPath.endsWith(".json")) {
    return false;
  }

  return (
    normalizedPath.startsWith(".lime/tasks/") ||
    normalizedPath.includes("/.lime/tasks/")
  );
}

export function isHiddenConversationArtifact(
  artifact: ConversationArtifactVisibilityTarget,
  path?: string | null,
): boolean {
  const meta = artifact.meta ?? {};
  const openedFrom = readString(meta.openedFrom, meta.opened_from);
  if (openedFrom === "right_surface_article_workspace") {
    return false;
  }

  if (isHiddenConversationArtifactPath(path)) {
    return true;
  }

  const kind = readString(
    meta.kind,
    meta.artifactKind,
    meta.artifact_kind,
    meta.outputArtifactKind,
    meta.output_artifact_kind,
  );
  if (isWorkspaceArticlePatchArtifactKind(kind)) {
    return true;
  }

  return false;
}

export function isHiddenConversationArtifactPath(
  path?: string | null,
): boolean {
  const normalizedPath = normalizeArtifactPath(path);
  if (!normalizedPath) {
    return false;
  }

  if (isHiddenInternalArtifactPath(normalizedPath)) {
    return true;
  }

  if (isWorkspaceArticlePatchArtifactPath(normalizedPath)) {
    return true;
  }

  const isAuxiliaryRuntimeProjection =
    normalizedPath.endsWith(".json") &&
    normalizedPath.includes("/auxiliary-runtime/") &&
    (normalizedPath.startsWith(".lime/harness/sessions/") ||
      normalizedPath.includes("/.lime/harness/sessions/"));

  if (isAuxiliaryRuntimeProjection) {
    return true;
  }

  const isInternalArtifactDocument =
    normalizedPath.endsWith(".artifact.json") &&
    (normalizedPath.startsWith(".lime/artifacts/") ||
      normalizedPath.includes("/.lime/artifacts/"));

  return isInternalArtifactDocument;
}
