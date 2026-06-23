import { describe, expect, it } from "vitest";
import { buildWorkspaceObjectCanvasBoard } from "./workspaceObjectCanvasModel";

describe("buildWorkspaceObjectCanvasBoard", () => {
  it("应把 Browser Assist 候选投影为单对象 board，并显式关闭未实现能力", () => {
    const board = buildWorkspaceObjectCanvasBoard({
      candidate: {
        candidateId: "browser-assist-candidate",
        title: "GitHub 搜索",
        url: "https://github.com/search?q=lime",
        sessionId: "browser-session-1",
        profileKey: "general-browser",
        targetId: "tab-1",
        lifecycleState: "running",
        controlMode: "agent",
        transportKind: "cdp_direct",
        sourceKind: "browserAssist",
      },
      hasOpenBrowserRuntimeAction: true,
    });

    expect(board).toMatchObject({
      id: "object-canvas-board:browser-assist-candidate",
      revision: 1,
      primaryObjectId: "browser-session:browser-assist-candidate",
      capabilities: {
        canEdit: false,
        canReplay: false,
        canPersist: false,
      },
      edges: [],
      eventSchemas: [
        {
          kind: "editRequested",
          capabilityKey: "canEdit",
          owner: "renderer",
          enabled: false,
        },
        {
          kind: "replayRequested",
          capabilityKey: "canReplay",
          owner: "runtime",
          enabled: false,
        },
        {
          kind: "persistRequested",
          capabilityKey: "canPersist",
          owner: "appServer",
          enabled: false,
        },
      ],
    });
    expect(board.objects).toEqual([
      {
        id: "browser-session:browser-assist-candidate",
        kind: "browserSession",
        title: "GitHub 搜索",
        stage: "ready",
        launching: false,
        source: {
          kind: "browserAssist",
          candidateId: "browser-assist-candidate",
          requestId: null,
        },
        facts: {
          candidateId: "browser-assist-candidate",
          lifecycleState: "running",
          url: "https://github.com/search?q=lime",
          sessionId: "browser-session-1",
          profileKey: "general-browser",
          targetId: "tab-1",
          transportKind: "cdp_direct",
          controlMode: "agent",
        },
        capabilities: {
          openBrowserRuntime: true,
        },
      },
    ]);
  });

  it("应暴露 edit / replay / persist 事件契约，但保持当前能力禁用", () => {
    const board = buildWorkspaceObjectCanvasBoard({
      candidate: {
        candidateId: "browser-assist-candidate",
        lifecycleState: "ready",
      },
    });

    expect(board.eventSchemas).toEqual([
      {
        kind: "editRequested",
        capabilityKey: "canEdit",
        owner: "renderer",
        enabled: false,
        acceptedObjectKinds: ["browserSession"],
        request: {
          requiredFields: ["boardId", "revision", "objectId", "patch"],
          optionalFields: ["objectKind", "source", "facts"],
        },
        exitCondition: {
          signal: "boardRevisionAdvanced",
          updatesBoardRevision: true,
        },
      },
      {
        kind: "replayRequested",
        capabilityKey: "canReplay",
        owner: "runtime",
        enabled: false,
        acceptedObjectKinds: ["browserSession"],
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
      {
        kind: "persistRequested",
        capabilityKey: "canPersist",
        owner: "appServer",
        enabled: false,
        acceptedObjectKinds: ["browserSession"],
        request: {
          requiredFields: ["boardId", "revision", "persistenceKey"],
          optionalFields: ["objectId", "objectKind", "source", "facts"],
        },
        exitCondition: {
          signal: "boardSnapshotPersisted",
          updatesBoardRevision: false,
        },
      },
    ]);
    expect(board.eventSchemas.every((schema) => !schema.enabled)).toBe(true);
  });

  it("launching 应优先成为 connecting 阶段", () => {
    const board = buildWorkspaceObjectCanvasBoard({
      candidate: {
        candidateId: "launching-browser",
        lifecycleState: "running",
        launching: true,
      },
    });

    expect(board.objects[0]?.stage).toBe("connecting");
    expect(board.objects[0]?.launching).toBe(true);
  });

  it("失败类 lifecycleState 应成为 failed 阶段", () => {
    const board = buildWorkspaceObjectCanvasBoard({
      candidate: {
        candidateId: "failed-browser",
        lifecycleState: "disconnect_error",
      },
    });

    expect(board.objects[0]?.stage).toBe("failed");
  });

  it("应裁剪空字段并保留稳定兜底对象", () => {
    const board = buildWorkspaceObjectCanvasBoard({
      candidate: {
        candidateId: "   ",
        title: "   ",
        url: "",
        sourceKind: "rightSurfacePending",
        sourceRequestId: " request-1 ",
      },
    });

    expect(board.id).toBe("object-canvas-board:object-canvas-candidate");
    expect(board.primaryObjectId).toBe(
      "browser-session:object-canvas-candidate",
    );
    expect(board.objects[0]).toMatchObject({
      id: "browser-session:object-canvas-candidate",
      title: null,
      stage: "pending",
      source: {
        kind: "rightSurfacePending",
        candidateId: "object-canvas-candidate",
        requestId: "request-1",
      },
      facts: {
        candidateId: "object-canvas-candidate",
        url: null,
      },
    });
  });
});
