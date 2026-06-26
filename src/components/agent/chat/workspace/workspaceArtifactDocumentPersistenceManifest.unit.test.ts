import { describe, expect, it } from "vitest";
import type { AgentRuntimeArtifactDocumentScope } from "@/lib/api/agentRuntime/appServerArtifactClient";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import {
  ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION,
  buildWorkspaceArtifactDocumentPersistenceManifest,
} from "./workspaceArtifactDocumentPersistenceManifest";

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? "artifact-report",
    type: overrides.type ?? "document",
    title: overrides.title ?? "report.artifact.json",
    content: overrides.content ?? "{}",
    status: overrides.status ?? "complete",
    meta: {
      filePath: ".app-server/artifacts/report.artifact.json",
      filename: "report.artifact.json",
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

function createScope(
  overrides: Partial<AgentRuntimeArtifactDocumentScope> = {},
): AgentRuntimeArtifactDocumentScope {
  return {
    artifactDocumentId: "artifact-document:report",
    artifactRef: "artifact-report",
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

describe("workspaceArtifactDocumentPersistenceManifest", () => {
  it("应生成 ArtifactDocument 文件级归档 manifest", () => {
    expect(
      buildWorkspaceArtifactDocumentPersistenceManifest({
        artifact: createArtifact(),
        document: createDocument(),
        scope: createScope(),
      }),
    ).toEqual({
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
      schemaVersion: ARTIFACT_DOCUMENT_PERSISTENCE_MANIFEST_SCHEMA_VERSION,
      sessionId: "session-1",
      sidecarRelativePath:
        "sessions/session-1/runtime-artifacts/artifact-report.json",
      turnId: "turn-1",
    });
  });

  it("缺少可选 scope 字段时不伪造归档来源", () => {
    expect(
      buildWorkspaceArtifactDocumentPersistenceManifest({
        artifact: createArtifact({
          title: "draft.json",
          meta: {
            filename: "",
            filePath: "",
          },
        }),
        document: createDocument({
          metadata: {
            generatedBy: "user",
            versionHistory: [],
          },
        }),
        scope: createScope({
          lastPersistedAt: undefined,
          sidecarRelativePath: undefined,
          turnId: undefined,
          versionId: undefined,
          versionNo: undefined,
        }),
      }),
    ).toMatchObject({
      artifactDocumentId: "artifact-document:report",
      artifactRef: "artifact-report",
      files: [
        expect.objectContaining({
          filename: "draft.artifact.json",
          format: "artifact_json",
        }),
        expect.objectContaining({
          filename: "draft.md",
          format: "markdown",
        }),
        expect.objectContaining({
          filename: "draft.html",
          format: "html",
        }),
      ],
      sessionId: "session-1",
    });
  });
});
