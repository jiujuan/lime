import { describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  appServerArtifactReadParamsFromArtifactPreview,
  appServerArtifactReadParamsFromTimelineItem,
  createAppServerArtifactClient,
  hasAgentRuntimeArtifactPreviewScope,
  projectArtifactPreviewContentFromAppServerSummaries,
  projectTimelineArtifactContentFromAppServerSummaries,
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
});
