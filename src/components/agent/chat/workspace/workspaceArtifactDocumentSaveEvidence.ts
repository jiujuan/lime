import type { AgentRuntimeArtifactDocumentSnapshotSaveEvidence } from "@/lib/api/agentRuntime/appServerArtifactClient";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import type { WriteArtifactContext } from "../types";

export interface BuildArtifactDocumentSaveEvidenceWriteContextParams {
  artifact: Artifact;
  document: ArtifactDocumentV1;
  evidence: AgentRuntimeArtifactDocumentSnapshotSaveEvidence;
  serializedDocument?: string;
  updatedAt?: number;
}

export function buildArtifactDocumentSaveEvidenceWriteContext({
  artifact,
  document,
  evidence,
  serializedDocument = JSON.stringify(document, null, 2),
  updatedAt = Date.now(),
}: BuildArtifactDocumentSaveEvidenceWriteContextParams): WriteArtifactContext {
  const filePath = resolveArtifactProtocolFilePath(artifact);
  const filename =
    typeof artifact.meta.filename === "string" && artifact.meta.filename.trim()
      ? artifact.meta.filename
      : artifact.title;
  const resolvedFilePath =
    typeof artifact.meta.filePath === "string" && artifact.meta.filePath.trim()
      ? artifact.meta.filePath
      : filePath;

  return {
    artifactId: artifact.id,
    source: "message_content",
    status: "complete",
    artifact: {
      ...artifact,
      content: serializedDocument,
      status: "complete",
      meta: omitUndefined({
        ...artifact.meta,
        artifactDocument: document,
        artifactDocumentSaveEvidence: evidence,
        appServerArtifactDocumentId: evidence.artifactDocumentId,
        appServerArtifactEventId: evidence.eventId,
        appServerArtifactRef: evidence.artifactRef,
        appServerArtifactSessionId: evidence.sessionId,
        appServerArtifactTurnId: evidence.turnId,
        appServerSidecarRelativePath: evidence.sidecarRelativePath,
        appServerArtifactContentStatus: evidence.contentStatus,
        appServerArtifactContentBytes: evidence.contentBytes,
        appServerArtifactContentSha256: evidence.contentSha256,
        appServerLastUpdateSource: "artifact.snapshot",
        artifactVersionId: evidence.versionId,
        artifactVersionNo: evidence.versionNo,
        language: "json",
        filePath: resolvedFilePath,
        filename,
      }),
      updatedAt,
    },
    metadata: omitUndefined({
      writePhase: "persisted",
      previewText: document.summary || document.title,
      appServerArtifactDocumentId: evidence.artifactDocumentId,
      appServerArtifactEventId: evidence.eventId,
      appServerArtifactRef: evidence.artifactRef,
      appServerArtifactSessionId: evidence.sessionId,
      appServerArtifactTurnId: evidence.turnId,
      appServerSidecarRelativePath: evidence.sidecarRelativePath,
      appServerLastUpdateSource: "artifact.snapshot",
    }),
  };
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
