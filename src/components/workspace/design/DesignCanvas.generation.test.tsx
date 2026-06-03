import { describe, expect, it, vi } from "vitest";
import {
  createDocument,
  createImageTaskOutput,
  renderDesignCanvas,
  clickButtonAsync,
  createDocumentWithPendingImageTask,
} from "./DesignCanvas.testFixtures";

describe("DesignCanvas image generation", () => {
  it("生成全部图片层应提交现有 image task，并把请求记录回文档", async () => {
    const createImageTaskArtifact = vi.fn().mockResolvedValue(
      createImageTaskOutput("task-subject", {
        images: [
          {
            url: "data:image/png;base64,c3VibWl0LWltbWVkaWF0ZQ==",
            revised_prompt: "提交后立即完成的角色层",
          },
        ],
      }),
    );
    const mounted = renderDesignCanvas(undefined, {
      projectRootPath: "/workspace",
      projectId: "project-1",
      contentId: "content-1",
      imageGenerationProviderId: "openai",
      imageGenerationModelId: "gpt-images-2",
      createImageTaskArtifact,
    });

    await clickButtonAsync("生成全部图片层");

    expect(createImageTaskArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRootPath: "/workspace",
        entrySource: "layered_design_canvas",
        modalityContractKey: "image_generation",
        routingSlot: "image_generation_model",
        providerId: "openai",
        model: "gpt-images-2",
        executorMode: "responses_image_generation",
        slotId: "subject",
        targetOutputId: "asset-subject",
        targetOutputRefId: "design-test:subject:asset-subject",
        projectId: "project-1",
        contentId: "content-1",
      }),
    );
    expect(
      JSON.stringify(createImageTaskArtifact.mock.calls[0][0]),
    ).not.toMatch(/poster_generate|canvas:poster/);
    expect(mounted.readState().document.editHistory.at(-1)).toMatchObject({
      type: "asset_replaced",
      layerId: "subject",
    });
    expect(document.body.textContent).toContain("已提交 1 个图片任务");
  });

  it("生成全部图片层应自动刷新 pending 任务并写回完成结果", async () => {
    const createImageTaskArtifact = vi
      .fn()
      .mockResolvedValue(createImageTaskOutput("task-subject"));
    const getImageTaskArtifact = vi.fn().mockResolvedValue(
      createImageTaskOutput("task-subject", {
        images: [
          {
            url: "data:image/png;base64,YXV0by1yZWZyZXNo",
            revised_prompt: "自动刷新完成的角色层",
          },
        ],
      }),
    );
    const mounted = renderDesignCanvas(undefined, {
      projectRootPath: "/workspace",
      createImageTaskArtifact,
      getImageTaskArtifact,
    });

    await clickButtonAsync("生成全部图片层");

    expect(getImageTaskArtifact).toHaveBeenCalledWith({
      projectRootPath: "/workspace",
      taskRef: ".lime/tasks/image_generate/task-subject.json",
    });
    expect(
      mounted
        .readState()
        .document.layers.find((layer) => layer.id === "subject"),
    ).toMatchObject({
      type: "image",
      assetId: "asset-subject-generated-task-subject",
      source: "generated",
    });
    expect(mounted.readState().document.assets.at(-1)).toMatchObject({
      id: "asset-subject-generated-task-subject",
      src: "data:image/png;base64,YXV0by1yZWZyZXNo",
    });
    expect(document.body.textContent).toContain("自动刷新写回 1 个图层结果");
    expect(JSON.stringify(mounted.readState().document)).not.toMatch(
      /poster_generate|canvas:poster|ImageTaskViewer/,
    );
  });

  it("图片服务选择未就绪时不应提交图层图片任务", () => {
    const createImageTaskArtifact = vi
      .fn()
      .mockResolvedValue(createImageTaskOutput("task-subject"));
    renderDesignCanvas(undefined, {
      projectRootPath: "/workspace",
      imageGenerationSelectionReady: false,
      imageGenerationSelectionWarning:
        "图片服务设置加载中，请稍后生成图层资产。",
      createImageTaskArtifact,
    });

    const generateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("生成全部图片层"),
    ) as HTMLButtonElement | undefined;

    expect(generateButton).toBeDefined();
    expect(generateButton?.disabled).toBe(true);
    expect(generateButton?.getAttribute("title")).toBe(
      "图片服务设置加载中，请稍后生成图层资产。",
    );
    expect(createImageTaskArtifact).not.toHaveBeenCalled();
  });

  it("重生成当前图片层应写回生成资产，并保持文字层可编辑", async () => {
    const createImageTaskArtifact = vi.fn().mockResolvedValue(
      createImageTaskOutput("task-subject", {
        images: [
          {
            url: "data:image/png;base64,ZmFrZS1zdWJqZWN0",
            revised_prompt: "重生成角色层",
          },
        ],
      }),
    );
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createDocument(),
        selectedLayerId: "subject",
        zoom: 0.72,
      },
      {
        projectRootPath: "/workspace",
        createImageTaskArtifact,
      },
    );

    await clickButtonAsync("重生成当前层");

    const updatedState = mounted.readState();
    expect(
      updatedState.document.layers.find((layer) => layer.id === "subject"),
    ).toMatchObject({
      type: "image",
      assetId: "asset-subject-generated-task-subject",
      source: "generated",
      x: 120,
      y: 240,
      width: 640,
      height: 840,
    });
    expect(
      updatedState.document.layers.find((layer) => layer.id === "headline"),
    ).toMatchObject({
      type: "text",
      text: "冥界女巫",
    });
    expect(updatedState.document.assets.at(-1)).toMatchObject({
      id: "asset-subject-generated-task-subject",
      src: "data:image/png;base64,ZmFrZS1zdWJqZWN0",
      provider: "openai",
      modelId: "gpt-image-2",
    });
    expect(document.body.textContent).toContain("写回 1 个已完成结果");
  });

  it("刷新生成结果应恢复已提交任务，并把成功输出写回目标图片层", async () => {
    const getImageTaskArtifact = vi.fn().mockResolvedValue(
      createImageTaskOutput("task-subject", {
        images: [
          {
            url: "data:image/png;base64,cmVmcmVzaGVk",
            revised_prompt: "刷新回来的角色层",
          },
        ],
      }),
    );
    const mounted = renderDesignCanvas(
      {
        type: "design",
        document: createDocumentWithPendingImageTask(),
        selectedLayerId: "subject",
        zoom: 0.72,
      },
      {
        projectRootPath: "/workspace",
        getImageTaskArtifact,
      },
    );

    await clickButtonAsync("刷新生成结果");

    expect(getImageTaskArtifact).toHaveBeenCalledWith({
      projectRootPath: "/workspace",
      taskRef: ".lime/tasks/image_generate/task-subject.json",
    });
    expect(
      mounted
        .readState()
        .document.layers.find((layer) => layer.id === "subject"),
    ).toMatchObject({
      type: "image",
      assetId: "asset-subject-generated-task-subject",
      source: "generated",
    });
    expect(
      mounted
        .readState()
        .document.layers.find((layer) => layer.id === "headline"),
    ).toMatchObject({
      type: "text",
      text: "冥界女巫",
    });
    expect(document.body.textContent).toContain(
      "已刷新 1 个图片任务，并写回 1 个图层结果",
    );
    expect(JSON.stringify(mounted.readState().document)).not.toMatch(
      /poster_generate|canvas:poster/,
    );
  });
});
