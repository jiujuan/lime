import { describe, expect, it, vi } from "vitest";
import { buildWorkspaceObjectCanvasBoard } from "./workspaceObjectCanvasModel";
import {
  buildWorkspaceObjectCanvasPersistMetadata,
  buildWorkspaceObjectCanvasPersistRequestParams,
  requestWorkspaceObjectCanvasPersist,
} from "./workspaceObjectCanvasPersistence";

function createBoard() {
  return buildWorkspaceObjectCanvasBoard({
    candidate: {
      candidateId: "browser-assist-candidate",
      title: "调试页面",
      url: "https://example.com/debug",
      sessionId: "browser-session-1",
      profileKey: "general-browser",
      targetId: "tab-1",
      lifecycleState: "ready",
      controlMode: "agent",
      transportKind: "cdp_direct",
      sourceKind: "browserAssist",
    },
  });
}

describe("workspaceObjectCanvasPersistence", () => {
  it("应把 persistRequested 投影为 App Server owner metadata，且保持能力禁用", () => {
    const metadata = buildWorkspaceObjectCanvasPersistMetadata({
      board: createBoard(),
      persistenceKey: "workspace:object-canvas:browser-assist-candidate",
    });

    expect(metadata).toMatchObject({
      source: "objectCanvas",
      schemaVersion: "object-canvas.persist.v1",
      candidateId: "browser-assist-candidate",
      title: "调试页面",
      url: "https://example.com/debug",
      sessionId: "browser-session-1",
      objectCanvas: {
        board: {
          id: "object-canvas-board:browser-assist-candidate",
          revision: 1,
          primaryObjectId: "browser-session:browser-assist-candidate",
          capabilities: {
            canEdit: false,
            canReplay: false,
            canPersist: false,
          },
          objectCount: 1,
          edgeCount: 0,
        },
        snapshot: {
          id: "object-canvas-board:browser-assist-candidate",
          revision: 1,
          primaryObjectId: "browser-session:browser-assist-candidate",
          objects: [
            {
              id: "browser-session:browser-assist-candidate",
              kind: "browserSession",
            },
          ],
          edges: [],
        },
        event: {
          kind: "persistRequested",
          owner: "appServer",
          capabilityKey: "canPersist",
          enabled: false,
          request: {
            boardId: "object-canvas-board:browser-assist-candidate",
            revision: 1,
            persistenceKey: "workspace:object-canvas:browser-assist-candidate",
            objectId: "browser-session:browser-assist-candidate",
            objectKind: "browserSession",
            source: {
              kind: "browserAssist",
              candidateId: "browser-assist-candidate",
              requestId: null,
            },
            facts: {
              candidateId: "browser-assist-candidate",
              sessionId: "browser-session-1",
            },
          },
          schema: {
            kind: "persistRequested",
            owner: "appServer",
            capabilityKey: "canPersist",
            enabled: false,
            request: {
              requiredFields: ["boardId", "revision", "persistenceKey"],
              optionalFields: ["objectId", "objectKind", "source", "facts"],
            },
            exitCondition: {
              signal: "boardSnapshotPersisted",
              updatesBoardRevision: false,
            },
          },
        },
      },
    });
  });

  it("应构造 workspaceRightSurface/request 参数并保留 pending renderer 可读字段", () => {
    const params = buildWorkspaceObjectCanvasPersistRequestParams({
      board: createBoard(),
      context: {
        workspaceId: " workspace-main ",
        workspaceRoot: " /workspace/project ",
        sessionId: null,
        origin: "mcpTool",
        priority: "foreground",
        ttlMs: 60000,
      },
    });

    expect(params).toMatchObject({
      workspaceId: "workspace-main",
      workspaceRoot: "/workspace/project",
      sessionId: "browser-session-1",
      surfaceKind: "objectCanvas",
      origin: "mcpTool",
      priority: "foreground",
      reason: "object_canvas_persist_requested",
      candidateId: "browser-assist-candidate",
      ttlMs: 60000,
      metadata: {
        candidateId: "browser-assist-candidate",
        title: "调试页面",
        lifecycleState: "ready",
        objectCanvas: {
          event: {
            kind: "persistRequested",
            owner: "appServer",
            enabled: false,
          },
        },
      },
    });
  });

  it("应通过 Right Surface current API 提交 persist pending request", async () => {
    const appServerClient = {
      request: vi.fn().mockResolvedValue({
        result: {
          status: "queued",
          requestId: "right-surface:persist-1",
          pending: {
            requestId: "right-surface:persist-1",
            surfaceKind: "objectCanvas",
            origin: "runtime",
            priority: "normal",
            status: "pending",
            requestedAt: "2026-06-23T00:00:00.000Z",
            workspaceId: null,
            workspaceRoot: null,
            sessionId: "browser-session-1",
            candidateId: "browser-assist-candidate",
            reason: "object_canvas_persist_requested",
            expiresAt: null,
            ttlMs: null,
            metadata: {},
          },
        },
      }),
    };

    await expect(
      requestWorkspaceObjectCanvasPersist(
        { board: createBoard() },
        { appServerClient },
      ),
    ).resolves.toMatchObject({
      status: "queued",
      requestId: "right-surface:persist-1",
    });

    expect(appServerClient.request).toHaveBeenCalledWith(
      "workspaceRightSurface/request",
      expect.objectContaining({
        surfaceKind: "objectCanvas",
        origin: "runtime",
        reason: "object_canvas_persist_requested",
        metadata: expect.objectContaining({
          objectCanvas: expect.objectContaining({
            event: expect.objectContaining({
              kind: "persistRequested",
              owner: "appServer",
            }),
          }),
        }),
      }),
    );
  });
});
