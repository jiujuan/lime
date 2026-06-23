import { describe, expect, it } from "vitest";
import { buildWorkspaceObjectCanvasViewModel } from "./workspaceObjectCanvasViewModel";

describe("buildWorkspaceObjectCanvasViewModel", () => {
  it("应把 Browser Assist 候选投影为对象画布对象、阶段、元数据和主动作", () => {
    const viewModel = buildWorkspaceObjectCanvasViewModel({
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
      },
      hasOpenBrowserRuntimeAction: true,
    });

    expect(viewModel.board).toEqual({
      id: "object-canvas-board:browser-assist-candidate",
      revision: 1,
      primaryObjectId: "browser-session:browser-assist-candidate",
      objectCount: 1,
      edgeCount: 0,
      capabilities: {
        canEdit: false,
        canReplay: false,
        canPersist: false,
      },
    });
    expect(viewModel.object).toEqual({
      id: "browser-session:browser-assist-candidate",
      kind: "browserSession",
      kindLabelKey:
        "workspace.browserAssistRenderer.objectCanvas.kind.browserSession",
      title: "GitHub 搜索",
      titleFallbackKey: "workspace.browserAssistRenderer.titleFallback",
      stage: "ready",
      stageLabelKey: "workspace.browserAssistRenderer.objectCanvas.stage.ready",
      summaryTitleKey:
        "workspace.browserAssistRenderer.objectCanvas.summary.ready.title",
      summaryDetailKey:
        "workspace.browserAssistRenderer.objectCanvas.summary.ready.detail",
      launching: false,
    });
    expect(viewModel.metadata.map((item) => [item.key, item.value])).toEqual([
      ["candidate", "browser-assist-candidate"],
      ["status", "running"],
      ["url", "https://github.com/search?q=lime"],
      ["session", "browser-session-1"],
      ["profile", "general-browser"],
      ["target", "tab-1"],
      ["transport", "cdp_direct"],
      ["control", "agent"],
    ]);
    expect(viewModel.primaryAction).toEqual({
      key: "openBrowserRuntime",
      labelKey: "workspace.browserAssistRenderer.objectCanvas.openRuntime",
    });
  });

  it("launching 应优先投影为 connecting 阶段", () => {
    const viewModel = buildWorkspaceObjectCanvasViewModel({
      candidate: {
        candidateId: "launching-candidate",
        lifecycleState: "running",
        launching: true,
      },
    });

    expect(viewModel.object.stage).toBe("connecting");
    expect(viewModel.object.launching).toBe(true);
    expect(viewModel.primaryAction).toBeNull();
  });

  it("失败类 lifecycleState 应投影为 failed 阶段", () => {
    const viewModel = buildWorkspaceObjectCanvasViewModel({
      candidate: {
        candidateId: "failed-candidate",
        lifecycleState: "disconnect_error",
      },
    });

    expect(viewModel.object.stage).toBe("failed");
    expect(viewModel.object.stageLabelKey).toBe(
      "workspace.browserAssistRenderer.objectCanvas.stage.failed",
    );
  });

  it("空字段应被裁剪，缺失候选时保留稳定兜底对象 id", () => {
    const viewModel = buildWorkspaceObjectCanvasViewModel({
      candidate: {
        candidateId: "   ",
        title: "   ",
        url: "",
        sessionId: null,
      },
    });

    expect(viewModel.board.id).toBe(
      "object-canvas-board:object-canvas-candidate",
    );
    expect(viewModel.object.id).toBe(
      "browser-session:object-canvas-candidate",
    );
    expect(viewModel.object.title).toBeNull();
    expect(viewModel.object.stage).toBe("pending");
    expect(viewModel.metadata).toEqual([
      {
        key: "candidate",
        labelKey: "workspace.browserAssistRenderer.objectCanvas.candidate",
        value: "object-canvas-candidate",
      },
    ]);
  });
});
