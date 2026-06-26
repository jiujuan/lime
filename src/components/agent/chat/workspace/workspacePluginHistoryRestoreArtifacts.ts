import type { PluginHistoryRestoreProjection } from "@/features/plugin";
import { createPreviewArtifact } from "@/lib/artifact/previewArtifact";
import type { Artifact } from "@/lib/artifact/types";

export interface WorkspacePluginHistoryRestoreArtifactPreviewItem {
  key: string;
  artifactRef: string;
  index: number;
  displayIndex: number;
}

export interface BuildWorkspacePluginHistoryRestoreArtifactPreviewItemsParams {
  projection: PluginHistoryRestoreProjection | null | undefined;
  maxItems?: number;
}

export interface BuildWorkspacePluginHistoryRestoreArtifactPreviewParams {
  projection: PluginHistoryRestoreProjection | null | undefined;
  item: WorkspacePluginHistoryRestoreArtifactPreviewItem;
  title: string;
  now?: number;
}

function normalizeArtifactRefs(
  projection: PluginHistoryRestoreProjection | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (projection?.artifactRefs ?? [])
        .map((artifactRef) => artifactRef.trim())
        .filter(Boolean),
    ),
  );
}

function buildArtifactPreviewPath(artifactRef: string): string {
  const safePathSegment = artifactRef
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.trim();
  const filename =
    safePathSegment
      ?.split("")
      .map((char) =>
        char.charCodeAt(0) <= 31 || '<>:"|?*'.includes(char) ? "-" : char,
      )
      .join("")
      .replace(/\s+/g, "-")
      .slice(0, 96) || "deliverable";
  return filename.includes(".") ? filename : `${filename}.md`;
}

export function buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
  maxItems,
  projection,
}: BuildWorkspacePluginHistoryRestoreArtifactPreviewItemsParams): WorkspacePluginHistoryRestoreArtifactPreviewItem[] {
  const artifactRefs = normalizeArtifactRefs(projection);
  const limitedRefs =
    typeof maxItems === "number" && maxItems > 0
      ? artifactRefs.slice(0, maxItems)
      : artifactRefs;

  return limitedRefs.map((artifactRef, index) => ({
    key: `${projection?.sessionId ?? "session"}:${artifactRef}`,
    artifactRef,
    index,
    displayIndex: index + 1,
  }));
}

export function buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact({
  item,
  now,
  projection,
  title,
}: BuildWorkspacePluginHistoryRestoreArtifactPreviewParams): Artifact | null {
  if (!projection) {
    return null;
  }

  const sessionId = projection.sessionId.trim();
  const artifactRef = item.artifactRef.trim();
  if (!sessionId || !artifactRef) {
    return null;
  }

  const sourceRef = `${sessionId}:${artifactRef}`;
  return createPreviewArtifact({
    source: "artifact",
    sourceRef,
    path: buildArtifactPreviewPath(artifactRef),
    title,
    content: "",
    meta: {
      openedFrom: "plugin_history_restore",
      sessionId,
      appServerSessionId: sessionId,
      appServerArtifactSessionId: sessionId,
      artifactRef,
      appServerArtifactRef: artifactRef,
      artifactId: artifactRef,
      pluginHistoryRestore: {
        sessionId,
        pluginId: projection.pluginId ?? null,
        activeAgentAppId: projection.activeAgentAppId ?? null,
        activeEntryKey: projection.activeEntryKey ?? null,
        artifactRef,
      },
    },
    now,
  }).artifact;
}
