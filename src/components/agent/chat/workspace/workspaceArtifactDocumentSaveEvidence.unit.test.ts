import { describe, expect, it } from "vitest";
import type { AgentRuntimeArtifactDocumentSnapshotSaveEvidence } from "@/lib/api/agentRuntime/appServerArtifactClient";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import { buildArtifactDocumentSaveEvidenceWriteContext } from "./workspaceArtifactDocumentSaveEvidence";

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? "artifact-report",
    type: overrides.type ?? "document",
    title: overrides.title ?? "report.json",
    content: overrides.content ?? "{}",
    status: overrides.status ?? "complete",
    meta: {
      filePath: ".app-server/artifacts/report.json",
      filename: "report.json",
      artifactRef: "artifact-report",
      sessionId: "session-1",
      turnId: "turn-1",
      ...(overrides.meta || {}),
    },
    position: overrides.position ?? { start: 0, end: 2 },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

function createDocument(
  overrides: Partial<ArtifactDocumentV1> = {},
): ArtifactDocumentV1 {
  return {
    schemaVersion: "artifact_document.v1",
    artifactId: "artifact-document:report",
    workspaceId: "workspace-1",
    threadId: "thread-1",
    turnId: "turn-1",
    kind: "report",
    title: "Report",
    status: "ready",
    language: "zh-CN",
    summary: "Report summary",
    blocks: [],
    sources: [],
    metadata: {
      generatedBy: "user",
      currentVersionId: "artifact-document:report:v2",
      currentVersionNo: 2,
      versionHistory: [],
    },
    ...overrides,
  };
}

function createEvidence(
  overrides: Partial<AgentRuntimeArtifactDocumentSnapshotSaveEvidence> = {},
): AgentRuntimeArtifactDocumentSnapshotSaveEvidence {
  return {
    artifactDocumentId: "artifact-document:report",
    artifactRef: "artifact-report",
    contentBytes: 2048,
    contentSha256: "sha256:artifact-content",
    contentStatus: "available",
    eventId: "evt-artifact-save-1",
    filePath: ".app-server/artifacts/report.json",
    lastPersistedAt: "2026-06-25T00:00:00.000Z",
    sessionId: "session-1",
    sidecarRelativePath:
      "sessions/session-1/runtime-artifacts/artifact-report.json",
    turnId: "turn-1",
    versionId: "artifact-document:report:v2",
    versionNo: 2,
    ...overrides,
  };
}

describe("workspaceArtifactDocumentSaveEvidence", () => {
  it("应把 App Server 保存证据合并为 Workbench artifact metadata", () => {
    const artifact = createArtifact();
    const document = createDocument();
    const evidence = createEvidence();

    const context = buildArtifactDocumentSaveEvidenceWriteContext({
      artifact,
      document,
      evidence,
      serializedDocument: "{\"schemaVersion\":\"artifact_document.v1\"}",
      updatedAt: 123,
    });

    expect(context).toMatchObject({
      artifactId: "artifact-report",
      source: "message_content",
      status: "complete",
      artifact: {
        id: "artifact-report",
        content: "{\"schemaVersion\":\"artifact_document.v1\"}",
        status: "complete",
        updatedAt: 123,
        meta: {
          artifactDocument: document,
          artifactDocumentPersistence: {
            artifactDocumentId: "artifact-document:report",
            artifactRef: "artifact-report",
            lastPersistedAt: "2026-06-25T00:00:00.000Z",
            sessionId: "session-1",
            sidecarRelativePath:
              "sessions/session-1/runtime-artifacts/artifact-report.json",
            turnId: "turn-1",
            versionId: "artifact-document:report:v2",
            versionNo: 2,
          },
          artifactDocumentPersistenceManifest: {
            artifactDocumentId: "artifact-document:report",
            artifactRef: "artifact-report",
            currentVersionId: "artifact-document:report:v2",
            currentVersionNo: 2,
            files: [
              {
                contentType: "application/json",
                filename: "report.artifact.json",
                format: "artifact_json",
                role: "source",
              },
              {
                contentType: "text/markdown",
                filename: "report.md",
                format: "markdown",
                role: "readable",
              },
              {
                contentType: "text/html",
                filename: "report.html",
                format: "html",
                role: "preview",
              },
            ],
            lastPersistedAt: "2026-06-25T00:00:00.000Z",
            schemaVersion: "artifact_document.persistence_manifest.v1",
            sessionId: "session-1",
            sidecarRelativePath:
              "sessions/session-1/runtime-artifacts/artifact-report.json",
            turnId: "turn-1",
          },
          artifactDocumentSaveEvidence: evidence,
          appServerArtifactDocumentId: "artifact-document:report",
          appServerArtifactEventId: "evt-artifact-save-1",
          appServerArtifactRef: "artifact-report",
          appServerArtifactSessionId: "session-1",
          appServerArtifactTurnId: "turn-1",
          appServerSidecarRelativePath:
            "sessions/session-1/runtime-artifacts/artifact-report.json",
          appServerArtifactContentStatus: "available",
          appServerArtifactContentBytes: 2048,
          appServerArtifactContentSha256: "sha256:artifact-content",
          appServerLastPersistedAt: "2026-06-25T00:00:00.000Z",
          appServerLastUpdateSource: "artifact.snapshot",
          artifactVersionId: "artifact-document:report:v2",
          artifactVersionNo: 2,
          language: "json",
          filePath: ".app-server/artifacts/report.json",
          filename: "report.json",
        },
      },
      metadata: {
        writePhase: "persisted",
        previewText: "Report summary",
        appServerArtifactDocumentId: "artifact-document:report",
        appServerArtifactEventId: "evt-artifact-save-1",
        appServerArtifactRef: "artifact-report",
        appServerArtifactSessionId: "session-1",
        appServerArtifactTurnId: "turn-1",
        appServerSidecarRelativePath:
          "sessions/session-1/runtime-artifacts/artifact-report.json",
        artifactDocumentPersistenceManifest: {
          artifactDocumentId: "artifact-document:report",
          artifactRef: "artifact-report",
          currentVersionId: "artifact-document:report:v2",
          currentVersionNo: 2,
          schemaVersion: "artifact_document.persistence_manifest.v1",
          sessionId: "session-1",
        },
        appServerLastPersistedAt: "2026-06-25T00:00:00.000Z",
        appServerLastUpdateSource: "artifact.snapshot",
      },
    });
  });

  it("缺少可选响应字段时不写入 undefined 证据字段", () => {
    const context = buildArtifactDocumentSaveEvidenceWriteContext({
      artifact: createArtifact({
        meta: {
          filePath: "",
        },
      }),
      document: createDocument({ summary: "" }),
      evidence: createEvidence({
        contentBytes: undefined,
        contentSha256: undefined,
        contentStatus: undefined,
        eventId: undefined,
        lastPersistedAt: undefined,
        sidecarRelativePath: undefined,
        turnId: undefined,
      }),
      updatedAt: 123,
    });

    expect(context.artifact?.meta).toMatchObject({
      appServerArtifactDocumentId: "artifact-document:report",
      appServerArtifactRef: "artifact-report",
      appServerArtifactSessionId: "session-1",
      appServerLastUpdateSource: "artifact.snapshot",
      filePath: "report.json",
      filename: "report.json",
    });
    expect(context.artifact?.meta).not.toHaveProperty(
      "appServerArtifactEventId",
    );
    expect(context.artifact?.meta).not.toHaveProperty(
      "appServerSidecarRelativePath",
    );
    expect(context.artifact?.meta).not.toHaveProperty(
      "appServerLastPersistedAt",
    );
    expect(context.artifact?.meta).not.toHaveProperty(
      "appServerArtifactContentBytes",
    );
    expect(context.metadata).toMatchObject({
      writePhase: "persisted",
      previewText: "Report",
      appServerArtifactDocumentId: "artifact-document:report",
      appServerArtifactRef: "artifact-report",
      appServerArtifactSessionId: "session-1",
    });
  });
});
