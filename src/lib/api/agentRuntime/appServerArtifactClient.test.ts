import { describe, expect, it, vi } from "vitest";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import {
  appServerArtifactSnapshotAppendParamsFromArtifactDocument,
  appServerArtifactReadParamsFromArtifactPreview,
  appServerArtifactReadParamsFromTimelineItem,
  createAppServerArtifactClient,
  agentRuntimeArtifactDocumentScopeFromSaveEvidence,
  hasAgentRuntimeArtifactPreviewScope,
  projectArtifactDocumentSnapshotSaveEvidence,
  projectArtifactPreviewContentFromAppServerSummaries,
  projectTimelineArtifactContentFromAppServerSummaries,
  resolveAgentRuntimeArtifactDocumentScope,
  type AgentRuntimeTimelineArtifactItem,
} from "./appServerArtifactClient";

function createFileArtifactItem(
  overrides: Partial<AgentRuntimeTimelineArtifactItem> = {},
): AgentRuntimeTimelineArtifactItem {
  return {
    id: "timeline-artifact-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-06-06T00:00:00.000Z",
    completed_at: "2026-06-06T00:00:01.000Z",
    updated_at: "2026-06-06T00:00:01.000Z",
    type: "file_artifact",
    path: ".app-server/artifacts/report.md",
    source: "artifact_snapshot",
    metadata: {
      session_id: "session-1",
      turn_id: "turn-1",
      artifact_ref: "artifact-report",
      artifact_id: "artifact-document:report",
    },
    ...overrides,
  };
}

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "";
  const defaultMeta = {
    filePath: ".app-server/artifacts/report.md",
    filename: "report.md",
    sessionId: "session-1",
    turnId: "turn-1",
    artifactRef: "artifact-report",
  };

  return {
    id: overrides.id ?? "artifact-report",
    type: overrides.type ?? "document",
    title: overrides.title ?? "report.md",
    content,
    status: overrides.status ?? "complete",
    meta: overrides.meta ? { ...overrides.meta } : defaultMeta,
    position: overrides.position ?? { start: 0, end: content.length },
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
    blocks: [
      {
        id: "body",
        type: "rich_text",
        contentFormat: "markdown",
        content: "# Report",
      },
    ],
    sources: [],
    metadata: {
      generatedBy: "user",
      currentVersionId: "artifact-document:report:v2",
      currentVersionNo: 2,
      versionHistory: [
        {
          id: "artifact-document:report:v2",
          artifactId: "artifact-document:report",
          versionNo: 2,
          title: "Report",
          status: "ready",
          createdBy: "user",
        },
      ],
    },
    ...overrides,
  };
}

describe("appServerArtifactClient", () => {
  it("应从 timeline metadata 构造 artifact/read includeContent 请求", () => {
    expect(
      appServerArtifactReadParamsFromTimelineItem(createFileArtifactItem()),
    ).toEqual({
      sessionId: "session-1",
      turnId: "turn-1",
      artifactRef: "artifact-report",
      includeContent: true,
      limit: 1,
    });
  });

  it("缺少 sessionId 时应 fail closed，不生成 App Server 请求", () => {
    expect(
      appServerArtifactReadParamsFromTimelineItem(
        createFileArtifactItem({
          metadata: {
            artifact_ref: "artifact-report",
          },
        }),
      ),
    ).toBeNull();
  });

  it("应从 Workbench artifact meta 构造 artifact/read includeContent 请求", () => {
    expect(
      appServerArtifactReadParamsFromArtifactPreview(
        createArtifact(),
        ".app-server/artifacts/report.md",
      ),
    ).toEqual({
      sessionId: "session-1",
      turnId: "turn-1",
      artifactRef: "artifact-report",
      includeContent: true,
      limit: 1,
    });
  });

  it("应从 Workbench 保存证据字段构造 artifact/read includeContent 请求", () => {
    expect(
      appServerArtifactReadParamsFromArtifactPreview(
        createArtifact({
          meta: {
            filePath: ".app-server/artifacts/report.md",
            filename: "report.md",
            appServerArtifactSessionId: "session-saved",
            appServerArtifactTurnId: "turn-saved",
            appServerArtifactRef: "artifact-saved",
            appServerArtifactEventId: "evt-saved",
          },
        }),
        ".app-server/artifacts/report.md",
      ),
    ).toEqual({
      sessionId: "session-saved",
      turnId: "turn-saved",
      artifactRef: "artifact-saved",
      includeContent: true,
      limit: 1,
    });
  });

  it("Workbench artifact 缺少 sessionId 时应 fail closed，不进入 App Server", () => {
    const artifact = createArtifact({
      meta: {
        filePath: ".app-server/artifacts/report.md",
        filename: "report.md",
        artifactRef: "artifact-report",
      },
    });

    expect(
      appServerArtifactReadParamsFromArtifactPreview(
        artifact,
        ".app-server/artifacts/report.md",
      ),
    ).toBeNull();
    expect(
      hasAgentRuntimeArtifactPreviewScope(
        artifact,
        ".app-server/artifacts/report.md",
      ),
    ).toBe(false);
  });

  it("应通过 App Server artifact/read 读取 timeline artifact 正文", async () => {
    const appServerClient = {
      readArtifacts: vi.fn().mockResolvedValue({
        id: 1,
        result: {
          artifacts: [
            {
              artifactRef: "artifact-report",
              eventId: "evt-artifact-1",
              sequence: 7,
              turnId: "turn-1",
              artifactId: "artifact-document:report",
              path: ".app-server/artifacts/report.md",
              title: "Report",
              kind: "markdown_report",
              status: "ready",
              content: "# Report",
              contentStatus: "available",
              metadata: {
                version: 2,
              },
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        notifications: [],
        messages: [],
      }),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.readAgentRuntimeTimelineArtifactContent(createFileArtifactItem()),
    ).resolves.toEqual({
      artifactRef: "artifact-report",
      artifactId: "artifact-document:report",
      content: "# Report",
      filePath: ".app-server/artifacts/report.md",
      metadata: {
        version: 2,
      },
      title: "Report",
    });

    expect(appServerClient.readArtifacts).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      artifactRef: "artifact-report",
      includeContent: true,
      limit: 1,
    });
  });

  it("应通过 App Server artifact/read 读取 Workbench artifact preview 正文", async () => {
    const appServerClient = {
      readArtifacts: vi.fn().mockResolvedValue({
        id: 1,
        result: {
          artifacts: [
            {
              artifactRef: "artifact-report",
              eventId: "evt-artifact-1",
              sequence: 7,
              turnId: "turn-1",
              artifactId: "artifact-document:report",
              path: ".app-server/artifacts/report.md",
              title: "Report",
              kind: "markdown_report",
              status: "ready",
              content: "# Report",
              contentStatus: "available",
              metadata: {
                version: 2,
              },
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        notifications: [],
        messages: [],
      }),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.readAgentRuntimeArtifactPreviewContent(
        createArtifact(),
        ".app-server/artifacts/report.md",
      ),
    ).resolves.toEqual({
      artifactRef: "artifact-report",
      artifactId: "artifact-document:report",
      content: "# Report",
      filePath: ".app-server/artifacts/report.md",
      metadata: {
        version: 2,
      },
      title: "Report",
    });

    expect(appServerClient.readArtifacts).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      artifactRef: "artifact-report",
      includeContent: true,
      limit: 1,
    });
  });

  it("App Server artifact/read 返回假成功 envelope 时应 fail closed", async () => {
    const appServerClient = {
      readArtifacts: vi.fn().mockResolvedValue({
        id: 1,
        result: {
          success: true,
        },
        response: {
          id: 1,
          result: {},
        },
        notifications: [],
        messages: [],
      }),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.readAgentRuntimeTimelineArtifactContent(createFileArtifactItem()),
    ).rejects.toThrow("artifact/read did not return artifact summaries");
  });

  it("App Server artifact/read 返回半截 artifact summary 时应 fail closed", async () => {
    const appServerClient = {
      readArtifacts: vi.fn().mockResolvedValue({
        id: 1,
        result: {
          artifacts: [
            {
              artifactRef: "artifact-report",
              contentStatus: "available",
              content: "# Report",
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        notifications: [],
        messages: [],
      }),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.readAgentRuntimeArtifactPreviewContent(
        createArtifact(),
        ".app-server/artifacts/report.md",
      ),
    ).rejects.toThrow("artifact/read did not return artifact summaries");
  });

  it("App Server 未返回可用 content 时不伪造 artifact 正文", () => {
    expect(
      projectTimelineArtifactContentFromAppServerSummaries({
        item: createFileArtifactItem(),
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          artifactRef: "artifact-report",
          includeContent: true,
        },
        artifacts: [
          {
            artifactRef: "artifact-report",
            eventId: "evt-artifact-1",
            sequence: 7,
            contentStatus: "unavailable",
          },
        ],
      }),
    ).toBeNull();
  });

  it("Workbench artifact preview 的 contentStatus 不可用时不伪造正文", () => {
    expect(
      projectArtifactPreviewContentFromAppServerSummaries({
        artifact: createArtifact(),
        artifactPath: ".app-server/artifacts/report.md",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          artifactRef: "artifact-report",
          includeContent: true,
          limit: 1,
        },
        artifacts: [
          {
            artifactRef: "artifact-report",
            eventId: "evt-artifact-1",
            sequence: 7,
            contentStatus: "unavailable",
          },
        ],
      }),
    ).toBeNull();
  });

  it("应从 Workbench ArtifactDocument 构造 artifact.snapshot append 请求", () => {
    const params = appServerArtifactSnapshotAppendParamsFromArtifactDocument(
      createArtifact(),
      createDocument(),
    );

    expect(params).toMatchObject({
      sessionId: "session-1",
      turnId: "turn-1",
      runtimeEvents: [
        {
          type: "artifact.snapshot",
          payload: {
            artifact: {
              artifactId: "artifact-report",
              artifactRef: "artifact-report",
              artifactDocumentId: "artifact-document:report",
              filePath: ".app-server/artifacts/report.md",
              path: ".app-server/artifacts/report.md",
              title: "Report",
              kind: "artifact_document",
              status: "ready",
              metadata: {
                artifactSchema: "artifact_document.v1",
                artifactKind: "report",
                artifactTitle: "Report",
                artifactDocumentId: "artifact-document:report",
                artifactVersionId: "artifact-document:report:v2",
                artifactVersionNo: 2,
                artifactRef: "artifact-report",
              },
            },
          },
        },
      ],
    });

    const event = params?.runtimeEvents?.[0];
    const payload = event?.payload as {
      artifact?: {
        content?: string;
        metadata?: { artifactDocument?: unknown };
      };
    };
    expect(payload.artifact?.content).toContain('"artifactId"');
    expect(payload.artifact?.metadata?.artifactDocument).toMatchObject({
      artifactId: "artifact-document:report",
      metadata: {
        currentVersionNo: 2,
      },
    });
  });

  it("Article Workspace preview 应从嵌套 metadata 读取 session 与稳定 artifactRef", () => {
    const params = appServerArtifactSnapshotAppendParamsFromArtifactDocument(
      createArtifact({
        id: "preview-artifact-id",
        meta: {
          filename: "image.md",
          filePath: "image.md",
          sourceRef: "preview-image-id",
          articleWorkspace: {
            sessionId: "session-article-workspace",
            artifactIds: ["artifact-image-1"],
          },
        },
      }),
      createDocument({
        artifactId: "artifact-document:content-factory-app:artifact-image-1",
        turnId: "turn-article-workspace",
        metadata: {
          generatedBy: "automation",
          articleWorkspace: {
            appId: "content-factory-app",
            sessionId: "session-article-workspace",
            artifactIds: ["artifact-image-1"],
          },
        },
      }),
    );

    expect(params).toMatchObject({
      sessionId: "session-article-workspace",
      turnId: "turn-article-workspace",
      runtimeEvents: [
        {
          payload: {
            artifact: {
              artifactId: "artifact-image-1",
              artifactRef: "artifact-image-1",
              artifactDocumentId:
                "artifact-document:content-factory-app:artifact-image-1",
              metadata: {
                articleWorkspace: {
                  appId: "content-factory-app",
                  sessionId: "session-article-workspace",
                  artifactIds: ["artifact-image-1"],
                },
              },
            },
          },
        },
      ],
    });
  });

  it("保存 ArtifactDocument 快照应通过 App Server current append method", async () => {
    const appServerClient = {
      readArtifacts: vi.fn(),
      appendAgentSessionRuntimeEvents: vi.fn().mockResolvedValue({
        id: 1,
        result: {
          events: [
            {
              eventId: "evt-artifact-save-1",
              payload: {
                artifact: {
                  artifactRef: "artifact-report",
                  filePath: ".app-server/artifacts/report.md",
                  contentStatus: "available",
                  contentBytes: 2048,
                  contentSha256: "sha256:artifact-content",
                  sidecarRef: {
                    relativePath:
                      "sessions/session-1/runtime-artifacts/artifact-report.json",
                  },
                  metadata: {
                    artifactDocumentId: "artifact-document:report",
                    artifactVersionId: "artifact-document:report:v2",
                    artifactVersionNo: 2,
                  },
                },
              },
              sequence: 7,
              sessionId: "session-1",
              timestamp: "2026-06-25T00:00:00.000Z",
              turnId: "turn-1",
              type: "artifact.snapshot",
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        notifications: [],
        messages: [],
      }),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.saveAgentRuntimeArtifactDocumentSnapshot(
        createArtifact(),
        createDocument(),
      ),
    ).resolves.toEqual({
      status: "appended",
      eventCount: 1,
      evidence: {
        artifactDocumentId: "artifact-document:report",
        artifactRef: "artifact-report",
        contentBytes: 2048,
        contentSha256: "sha256:artifact-content",
        contentStatus: "available",
        eventId: "evt-artifact-save-1",
        filePath: ".app-server/artifacts/report.md",
        lastPersistedAt: "2026-06-25T00:00:00.000Z",
        sessionId: "session-1",
        sidecarRelativePath:
          "sessions/session-1/runtime-artifacts/artifact-report.json",
        turnId: "turn-1",
        versionId: "artifact-document:report:v2",
        versionNo: 2,
      },
    });

    expect(
      appServerClient.appendAgentSessionRuntimeEvents,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        runtimeEvents: [
          expect.objectContaining({
            type: "artifact.snapshot",
          }),
        ],
      }),
    );
  });

  it("保存证据在 App Server 只返回事件外壳时仍保留稳定文档范围", () => {
    const document = createDocument();
    const params = appServerArtifactSnapshotAppendParamsFromArtifactDocument(
      createArtifact(),
      document,
    );
    expect(params).not.toBeNull();

    expect(
      projectArtifactDocumentSnapshotSaveEvidence({
        document,
        params: params!,
        response: {
          events: [
            {
              eventId: "evt-minimal",
              payload: {},
              sequence: 1,
              sessionId: "session-1",
              timestamp: "2026-06-25T00:00:00.000Z",
              type: "artifact.snapshot",
            },
          ],
        },
      }),
    ).toEqual({
      artifactDocumentId: "artifact-document:report",
      artifactRef: "artifact-document:report",
      eventId: "evt-minimal",
      lastPersistedAt: "2026-06-25T00:00:00.000Z",
      sessionId: "session-1",
      turnId: "turn-1",
      versionId: "artifact-document:report:v2",
      versionNo: 2,
    });
  });

  it("缺少 session scope 时保存 ArtifactDocument 快照应 fail closed", async () => {
    const appServerClient = {
      readArtifacts: vi.fn(),
      appendAgentSessionRuntimeEvents: vi.fn(),
    };
    const client = createAppServerArtifactClient({ appServerClient });

    await expect(
      client.saveAgentRuntimeArtifactDocumentSnapshot(
        createArtifact({
          meta: {
            filePath: ".app-server/artifacts/report.md",
            filename: "report.md",
            artifactRef: "artifact-report",
          },
        }),
        createDocument(),
      ),
    ).resolves.toEqual({
      status: "skipped",
      reason: "missing_scope",
    });

    expect(
      appServerClient.appendAgentSessionRuntimeEvents,
    ).not.toHaveBeenCalled();
  });

  it("保存后的 ArtifactDocument scope 应作为跨会话继续保存的稳定范围", () => {
    const artifact = createArtifact({
      id: "local-preview-id",
      meta: {
        filename: "report.json",
        filePath: ".app-server/artifacts/report.json",
        artifactDocumentSaveEvidence: {
          artifactDocumentId: "artifact-document:report",
          artifactRef: "artifact-report",
          lastPersistedAt: "2026-06-25T00:00:00.000Z",
          sessionId: "session-saved",
          sidecarRelativePath:
            "sessions/session-saved/runtime-artifacts/artifact-report.json",
          turnId: "turn-saved",
          versionId: "artifact-document:report:v3",
          versionNo: 3,
        },
      },
    });

    expect(resolveAgentRuntimeArtifactDocumentScope(artifact)).toEqual({
      artifactDocumentId: "artifact-document:report",
      artifactRef: "artifact-report",
      lastPersistedAt: "2026-06-25T00:00:00.000Z",
      sessionId: "session-saved",
      sidecarRelativePath:
        "sessions/session-saved/runtime-artifacts/artifact-report.json",
      turnId: "turn-saved",
      versionId: "artifact-document:report:v3",
      versionNo: 3,
    });
    expect(
      appServerArtifactSnapshotAppendParamsFromArtifactDocument(
        artifact,
        createDocument({
          turnId: "turn-document",
          metadata: {
            generatedBy: "user",
            currentVersionId: "artifact-document:report:v4",
            currentVersionNo: 4,
            versionHistory: [],
          },
        }),
      ),
    ).toMatchObject({
      sessionId: "session-saved",
      turnId: "turn-saved",
      runtimeEvents: [
        {
          payload: {
            artifact: {
              artifactId: "artifact-report",
              artifactRef: "artifact-report",
              artifactDocumentId: "artifact-document:report",
              metadata: {
                artifactDocumentPersistence: {
                  artifactDocumentId: "artifact-document:report",
                  artifactRef: "artifact-report",
                  sessionId: "session-saved",
                  turnId: "turn-saved",
                  versionId: "artifact-document:report:v3",
                  versionNo: 3,
                },
              },
            },
          },
        },
      ],
    });
  });

  it("可从保存证据构造 ArtifactDocument persistence scope", () => {
    expect(
      agentRuntimeArtifactDocumentScopeFromSaveEvidence({
        artifactDocumentId: "artifact-document:report",
        artifactRef: "artifact-report",
        eventId: "evt-save",
        lastPersistedAt: "2026-06-25T00:00:00.000Z",
        sessionId: "session-1",
        sidecarRelativePath:
          "sessions/session-1/runtime-artifacts/artifact-report.json",
        sourceArtifactRef: "source-artifact-report",
        turnId: "turn-1",
        versionId: "artifact-document:report:v2",
        versionNo: 2,
      }),
    ).toEqual({
      artifactDocumentId: "artifact-document:report",
      artifactRef: "artifact-report",
      lastPersistedAt: "2026-06-25T00:00:00.000Z",
      sessionId: "session-1",
      sidecarRelativePath:
        "sessions/session-1/runtime-artifacts/artifact-report.json",
      sourceArtifactRef: "source-artifact-report",
      turnId: "turn-1",
      versionId: "artifact-document:report:v2",
      versionNo: 2,
    });
  });
});
