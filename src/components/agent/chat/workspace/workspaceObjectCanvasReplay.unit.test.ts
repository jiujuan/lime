import { describe, expect, it, vi } from "vitest";
import { buildWorkspaceObjectCanvasBoard } from "./workspaceObjectCanvasModel";
import {
  buildWorkspaceObjectCanvasReplayMetadata,
  buildWorkspaceObjectCanvasReplayRequestParams,
  requestWorkspaceObjectCanvasReplay,
} from "./workspaceObjectCanvasReplay";

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

describe("workspaceObjectCanvasReplay", () => {
  it("应把 replayRequested 投影为 Runtime owner metadata，且保持能力禁用", () => {
    const metadata = buildWorkspaceObjectCanvasReplayMetadata({
      board: createBoard(),
      replayTarget: "runtimeSession",
    });

    expect(metadata).toMatchObject({
      source: "objectCanvas",
      schemaVersion: "object-canvas.replay.v1",
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
          kind: "replayRequested",
          owner: "runtime",
          capabilityKey: "canReplay",
          enabled: false,
          request: {
            boardId: "object-canvas-board:browser-assist-candidate",
            revision: 1,
            replayTarget: "runtimeSession",
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
            kind: "replayRequested",
            owner: "runtime",
            capabilityKey: "canReplay",
            enabled: false,
            request: {
              requiredFields: [
                "boardId",
                "revision",
                "objectId",
                "replayTarget",
              ],
              optionalFields: ["objectKind", "source", "facts"],
            },
            exitCondition: {
              signal: "runtimeReplayStarted",
              updatesBoardRevision: false,
            },
          },
        },
      },
    });
  });

  it("应构造 workspaceRightSurface/request 参数并保留 pending renderer 可读字段", () => {
    const params = buildWorkspaceObjectCanvasReplayRequestParams({
      board: createBoard(),
      context: {
        workspaceId: " workspace-main ",
        workspaceRoot: " /workspace/project ",
        sessionId: null,
        origin: "skill",
        priority: "foreground",
        ttlMs: 60000,
      },
    });

    expect(params).toMatchObject({
      workspaceId: "workspace-main",
      workspaceRoot: "/workspace/project",
      sessionId: "browser-session-1",
      surfaceKind: "objectCanvas",
      origin: "skill",
      priority: "foreground",
      reason: "object_canvas_replay_requested",
      candidateId: "browser-assist-candidate",
      ttlMs: 60000,
      metadata: {
        candidateId: "browser-assist-candidate",
        title: "调试页面",
        lifecycleState: "ready",
        objectCanvas: {
          event: {
            kind: "replayRequested",
            owner: "runtime",
            enabled: false,
          },
        },
      },
    });
  });

  it("应通过 Right Surface current API 提交 replay pending request", async () => {
    const appServerClient = {
      request: vi.fn().mockResolvedValue({
        result: {
          status: "queued",
          requestId: "right-surface:replay-1",
          pending: {
            requestId: "right-surface:replay-1",
            surfaceKind: "objectCanvas",
            origin: "runtime",
            priority: "normal",
            status: "pending",
            requestedAt: "2026-06-23T00:00:00.000Z",
            workspaceId: null,
            workspaceRoot: null,
            sessionId: "browser-session-1",
            candidateId: "browser-assist-candidate",
            reason: "object_canvas_replay_requested",
            expiresAt: null,
            ttlMs: null,
            metadata: {},
          },
        },
      }),
    };

    await expect(
      requestWorkspaceObjectCanvasReplay(
        { board: createBoard() },
        { appServerClient },
      ),
    ).resolves.toMatchObject({
      status: "queued",
      requestId: "right-surface:replay-1",
    });

    expect(appServerClient.request).toHaveBeenCalledWith(
      "workspaceRightSurface/request",
      expect.objectContaining({
        surfaceKind: "objectCanvas",
        origin: "runtime",
        reason: "object_canvas_replay_requested",
        metadata: expect.objectContaining({
          objectCanvas: expect.objectContaining({
            event: expect.objectContaining({
              kind: "replayRequested",
              owner: "runtime",
            }),
          }),
        }),
      }),
    );
  });
});
