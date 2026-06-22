import { describe, expect, it } from "vitest";
import {
  applyWorkspaceRightSurfaceIntent,
  createWorkspaceRightSurfaceCloseIntent,
  createWorkspaceRightSurfaceOpenIntent,
  pruneExpiredWorkspaceRightSurfaceIntents,
  type WorkspaceRightSurfaceIntentQueueState,
} from "./rightSurfaceIntentQueue";
import { buildRightSurfaceState } from "./rightSurfaceState";

function buildQueueState(): WorkspaceRightSurfaceIntentQueueState {
  return {
    surfaceState: buildRightSurfaceState("expertInfo", "user"),
    pendingIntents: [],
  };
}

describe("rightSurfaceIntentQueue", () => {
  it("后台工具 intent 被延后时应进入 pending 队列", () => {
    const intent = createWorkspaceRightSurfaceOpenIntent({
      id: "skill:file-preview",
      kind: "files",
      origin: "skill",
      priority: "background",
      createdAt: 100,
    });

    const result = applyWorkspaceRightSurfaceIntent({
      state: buildQueueState(),
      intent,
    });

    expect(result.decision).toMatchObject({
      status: "deferred",
      reasonCode: "background_request_deferred",
    });
    expect(result.state.pendingIntents).toEqual([intent]);
    expect(result.state.surfaceState.activeSurface).toBe("expertInfo");
  });

  it("相同 id 的 pending intent 应覆盖旧请求", () => {
    const first = createWorkspaceRightSurfaceOpenIntent({
      id: "skill:preview",
      kind: "files",
      origin: "skill",
      priority: "background",
      createdAt: 100,
    });
    const second = createWorkspaceRightSurfaceOpenIntent({
      id: "skill:preview",
      kind: "harness",
      origin: "skill",
      priority: "background",
      createdAt: 110,
    });

    const firstResult = applyWorkspaceRightSurfaceIntent({
      state: buildQueueState(),
      intent: first,
    });
    const secondResult = applyWorkspaceRightSurfaceIntent({
      state: firstResult.state,
      intent: second,
    });

    expect(secondResult.state.pendingIntents).toHaveLength(1);
    expect(secondResult.state.pendingIntents[0]).toBe(second);
  });

  it("前台 intent 接受后应更新 surface 并清理同 id pending", () => {
    const backgroundIntent = createWorkspaceRightSurfaceOpenIntent({
      id: "mcp:shell",
      kind: "shell",
      origin: "mcpTool",
      priority: "background",
      createdAt: 100,
    });
    const foregroundIntent = createWorkspaceRightSurfaceOpenIntent({
      id: "mcp:shell",
      kind: "shell",
      origin: "mcpTool",
      priority: "foreground",
      createdAt: 120,
    });
    const deferred = applyWorkspaceRightSurfaceIntent({
      state: buildQueueState(),
      intent: backgroundIntent,
    });

    const accepted = applyWorkspaceRightSurfaceIntent({
      state: deferred.state,
      intent: foregroundIntent,
    });

    expect(accepted.decision.status).toBe("accepted");
    expect(accepted.state.surfaceState).toMatchObject({
      activeSurface: "shell",
      previousSurface: "expertInfo",
      source: "runtime",
    });
    expect(accepted.state.pendingIntents).toEqual([]);
  });

  it("被 registry 拒绝的 intent 不应进入 pending 队列", () => {
    const result = applyWorkspaceRightSurfaceIntent({
      state: buildQueueState(),
      intent: createWorkspaceRightSurfaceOpenIntent({
        id: "route:shell",
        kind: "shell",
        origin: "route",
        createdAt: 100,
      }),
    });

    expect(result.decision).toMatchObject({
      status: "rejected",
      reasonCode: "source_not_allowed",
    });
    expect(result.state.pendingIntents).toEqual([]);
  });

  it("关闭 intent 接受后应更新 surface", () => {
    const result = applyWorkspaceRightSurfaceIntent({
      state: buildQueueState(),
      intent: createWorkspaceRightSurfaceCloseIntent({
        id: "mcp:close",
        origin: "mcpTool",
        createdAt: 100,
      }),
    });

    expect(result.decision.status).toBe("accepted");
    expect(result.state.surfaceState).toMatchObject({
      activeSurface: null,
      previousSurface: "expertInfo",
      source: "runtime",
    });
  });

  it("应按 ttl 清理过期 pending intent", () => {
    const expired = createWorkspaceRightSurfaceOpenIntent({
      id: "expired",
      kind: "files",
      origin: "skill",
      createdAt: 100,
      ttlMs: 10,
    });
    const active = createWorkspaceRightSurfaceOpenIntent({
      id: "active",
      kind: "harness",
      origin: "skill",
      createdAt: 100,
      ttlMs: 50,
    });

    expect(
      pruneExpiredWorkspaceRightSurfaceIntents([expired, active], 120).map(
        (intent) => intent.id,
      ),
    ).toEqual(["active"]);
  });
});
