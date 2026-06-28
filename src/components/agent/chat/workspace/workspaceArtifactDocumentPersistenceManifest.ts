import type { AgentRuntimeArtifactDocumentScope } from "@/lib/api/agentRuntime/appServerArtifactClient";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import {
  resolveArtifactWorkbenchHtmlFilename,
  resolveArtifactWorkbenchJsonFilename,
  resolveArtifactWorkbenchMarkdownFilename,
} from "./artifactWorkbenchActions";

export const ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION =
  "artifact_document.persistence_manifest.v1";

export type ArtifactDocumentPersistenceFileFormat =
  | "artifact_json"
  | "markdown"
  | "html";

export interface ArtifactDocumentPersistenceFileEntry {
  contentType: string;
  filename: string;
  format: ArtifactDocumentPersistenceFileFormat;
  role: "source" | "readable" | "preview";
}

export interface ArtifactDocumentPersistenceManifest {
  artifactDocumentId: string;
  artifactRef?: string;
  currentVersionId?: string;
  currentVersionNo?: number;
  files: ArtifactDocumentPersistenceFileEntry[];
  lastPersistedAt?: string;
  schemaVersion: typeof ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION;
  sessionId?: string;
  sidecarRelativePath?: string;
  turnId?: string;
}

export function buildWorkspaceArtifactDocumentPersistenceManifest({
  artifact,
  document,
  scope,
}: {
  artifact: Artifact;
  document: ArtifactDocumentV1;
  scope: AgentRuntimeArtifactDocumentScope;
}): ArtifactDocumentPersistenceManifest {
  const files: ArtifactDocumentPersistenceFileEntry[] = [
    {
      contentType: "application/json",
      filename: resolveArtifactWorkbenchJsonFilename(artifact, document),
      format: "artifact_json",
      role: "source",
    },
    {
      contentType: "text/markdown",
      filename: resolveArtifactWorkbenchMarkdownFilename(artifact, document),
      format: "markdown",
      role: "readable",
    },
    {
      contentType: "text/html",
      filename: resolveArtifactWorkbenchHtmlFilename(artifact, document),
      format: "html",
      role: "preview",
    },
  ];
  const manifest: ArtifactDocumentPersistenceManifest = {
    artifactDocumentId: document.artifactId,
    files,
    schemaVersion: ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION,
  };
  const artifactRef = normalizeText(scope.artifactRef);
  const currentVersionId =
    normalizeText(document.metadata.currentVersionId) ||
    normalizeText(scope.versionId);
  const currentVersionNo =
    document.metadata.currentVersionNo ?? scope.versionNo ?? undefined;
  const lastPersistedAt = normalizeText(scope.lastPersistedAt);
  const sessionId = normalizeText(scope.sessionId);
  const sidecarRelativePath = normalizeText(scope.sidecarRelativePath);
  const turnId = normalizeText(scope.turnId);
  if (artifactRef) {
    manifest.artifactRef = artifactRef;
  }
  if (currentVersionId) {
    manifest.currentVersionId = currentVersionId;
  }
  if (typeof currentVersionNo === "number") {
    manifest.currentVersionNo = currentVersionNo;
  }
  if (lastPersistedAt) {
    manifest.lastPersistedAt = lastPersistedAt;
  }
  if (sessionId) {
    manifest.sessionId = sessionId;
  }
  if (sidecarRelativePath) {
    manifest.sidecarRelativePath = sidecarRelativePath;
  }
  if (turnId) {
    manifest.turnId = turnId;
  }
  return manifest;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
