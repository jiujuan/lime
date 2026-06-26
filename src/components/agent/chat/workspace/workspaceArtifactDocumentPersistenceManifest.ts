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
  return omitUndefined({
    artifactDocumentId: document.artifactId,
    artifactRef: scope.artifactRef,
    currentVersionId:
      normalizeText(document.metadata.currentVersionId) || scope.versionId,
    currentVersionNo:
      document.metadata.currentVersionNo ?? scope.versionNo ?? undefined,
    files: [
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
    ],
    lastPersistedAt: scope.lastPersistedAt,
    schemaVersion: ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION,
    sessionId: scope.sessionId,
    sidecarRelativePath: scope.sidecarRelativePath,
    turnId: scope.turnId,
  });
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
