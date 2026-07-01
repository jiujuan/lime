import { normalizeArtifactProtocolPath } from "@/lib/artifact-protocol";

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

function normalizeKind(value?: string | null): string {
  return value ? value.trim().toLowerCase() : "";
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

function isContentFactoryWorkspacePatchPath(path?: string | null): boolean {
  const normalizedPath = normalizeArtifactPath(path);
  if (!normalizedPath || !normalizedPath.endsWith(".json")) {
    return false;
  }
  return (
    normalizedPath === ".lime/artifacts/content-factory/workspace-patch.json" ||
    normalizedPath.endsWith(
      "/.lime/artifacts/content-factory/workspace-patch.json",
    ) ||
    normalizedPath === ".lime/artifacts/content-factory-workspace-patch.json" ||
    normalizedPath.endsWith(
      "/.lime/artifacts/content-factory-workspace-patch.json",
    )
  );
}

function isContentFactoryWorkspacePatchKind(kind?: string | null): boolean {
  const normalizedKind = normalizeKind(kind);
  return (
    normalizedKind === "content_factory.workspace_patch" ||
    normalizedKind === "content_factory_workspace_patch" ||
    normalizedKind === "workspace_patch" ||
    normalizedKind.endsWith(".workspace_patch")
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
  if (isContentFactoryWorkspacePatchKind(kind)) {
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

  if (isContentFactoryWorkspacePatchPath(normalizedPath)) {
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
