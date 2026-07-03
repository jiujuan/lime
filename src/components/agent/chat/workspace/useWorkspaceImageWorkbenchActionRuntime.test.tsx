import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import {
  createParsedCommand,
  mockGenerateAgentRuntimeTitle,
  renderHook,
  toast,
} from "./useWorkspaceImageWorkbenchActionRuntime.testFixtures";

describe("useWorkspaceImageWorkbenchActionRuntime", () => {
  it("图片 Provider 刷新后同一轮命令应使用最新 selection", async () => {
    const submitImageWorkbenchAgentCommand = vi.fn().mockResolvedValue(true);
    let resolveProvidersLoaded: (() => void) | null = null;
    const ensureImageWorkbenchProvidersLoaded = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveProvidersLoaded = resolve;
        }),
    );
    const { render, getValue } = renderHook({
      ensureImageWorkbenchProvidersLoaded,
      imageWorkbenchProvidersLoading: true,
      imageWorkbenchSelectedModelId: "",
      imageWorkbenchSelectedProviderId: "",
      submitImageWorkbenchAgentCommand,
    });

    await render();

    let handledPromise: Promise<boolean> | null = null;
    await act(async () => {
      handledPromise = getValue().handleImageWorkbenchCommand({
        rawText: "@配图 生成 城市夜景主视觉",
        parsedCommand: createParsedCommand(),
        images: [],
      });
      await Promise.resolve();
    });

    await render({
      imageWorkbenchProvidersLoading: false,
      imageWorkbenchSelectedModelId: "fal-ai/nano-banana-pro",
      imageWorkbenchSelectedProviderId: "fal",
    });

    await act(async () => {
      resolveProvidersLoaded?.();
      await handledPromise;
    });

    expect(await handledPromise).toBe(true);
    expect(ensureImageWorkbenchProvidersLoaded).toHaveBeenCalledTimes(1);
    expect(submitImageWorkbenchAgentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          image_task: expect.objectContaining({
            provider_id: "fal",
            model: "fal-ai/nano-banana-pro",
          }),
        }),
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("应通过 Agent 主链提交图片 skill launch，而不是前端直建 task", async () => {
    const submitImageWorkbenchAgentCommand = vi.fn().mockResolvedValue(true);
    const createImageGenerationTask = vi.fn();
    const { render, getValue } = renderHook({
      submitImageWorkbenchAgentCommand,
      createImageGenerationTask,
    });

    await render();

    let handled = false;
    await act(async () => {
      handled = await getValue().handleImageWorkbenchCommand({
        rawText: "@配图 生成 城市夜景主视觉",
        parsedCommand: createParsedCommand(),
        images: [],
      });
    });

    expect(handled).toBe(true);
    expect(submitImageWorkbenchAgentCommand).toHaveBeenCalledTimes(1);
    expect(submitImageWorkbenchAgentCommand).toHaveBeenCalledWith({
      rawText: "@配图 生成 城市夜景主视觉",
      displayContent: "@配图 生成 城市夜景主视觉",
      images: [],
      requestContext: expect.objectContaining({
        kind: "image_task",
        image_task: expect.objectContaining({
          title: "城市夜景主视觉",
          title_generation_result: expect.objectContaining({
            title: "城市夜景主视觉",
            sessionId: "title-session-1",
          }),
          mode: "generate",
          prompt: "城市夜景主视觉",
          size: "1024x1024",
          usage: "claw-image-workbench",
          session_id: "session-1",
          project_id: "project-1",
          entry_source: "at_image_command",
          requested_target: "generate",
        }),
      }),
    });
    expect(mockGenerateAgentRuntimeTitle).toHaveBeenCalledWith({
      sessionId: "session-1",
      previewText: "城市夜景主视觉",
      titleKind: "image_task",
    });
    expect(createImageGenerationTask).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("本地图片工作台 key 首次提交时应保留统一发送主线，延后由发送边界绑定真实会话", async () => {
    const submitImageWorkbenchAgentCommand = vi.fn().mockResolvedValue(true);
    const localImageWorkbenchSessionKey =
      "__local_image_workbench__:draft:image";
    const { render, getValue } = renderHook({
      submitImageWorkbenchAgentCommand,
      imageWorkbenchSessionKey: localImageWorkbenchSessionKey,
    });

    await render();

    await act(async () => {
      await getValue().handleImageWorkbenchCommand({
        rawText: "@配图 生成 城市夜景主视觉",
        parsedCommand: createParsedCommand(),
        images: [],
      });
    });

    expect(submitImageWorkbenchAgentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          image_task: expect.objectContaining({
            session_id: localImageWorkbenchSessionKey,
          }),
        }),
      }),
    );
    expect(mockGenerateAgentRuntimeTitle).toHaveBeenCalledWith({
      previewText: "城市夜景主视觉",
      titleKind: "image_task",
    });
  });

  it("普通图片生成缺少项目时仍应构造 Agent skill launch 上下文", async () => {
    const { render, getValue } = renderHook({
      projectId: null,
      projectRootPath: null,
    });

    await render();

    const skillRequest = getValue().resolveImageWorkbenchCommandRequest({
      rawText: "@配图 生成 城市夜景主视觉",
      parsedCommand: createParsedCommand(),
      images: [],
    });

    expect(skillRequest).toMatchObject({
      requestContext: {
        kind: "image_task",
        image_task: {
          mode: "generate",
          prompt: "城市夜景主视觉",
          session_id: "session-1",
          entry_source: "at_image_command",
        },
      },
    });
    expect(skillRequest?.requestContext["image_task"]).not.toHaveProperty(
      "project_id",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("需要写回画布的配图仍应要求项目上下文", async () => {
    const { render, getValue } = renderHook({
      projectId: null,
      projectRootPath: null,
    });

    await render();

    const skillRequest = getValue().resolveImageWorkbenchCommandRequest({
      rawText: "@配图 生成 城市夜景主视觉",
      parsedCommand: createParsedCommand(),
      images: [],
      applyTarget: {
        kind: "canvas-insert",
        canvasType: "document",
        actionLabel: "插入文稿",
        dispatchLabel: "生成并插入文稿",
      },
    });

    expect(skillRequest).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("请先选择项目后再开始配图");
  });

  it("应把编辑命令解析为统一的 skillRequest 上下文", async () => {
    const currentImageWorkbenchState = {
      ...createInitialSessionImageWorkbenchState(),
      outputs: [
        {
          id: "task-image-1:output:1",
          taskId: "task-image-1",
          hookImageId: "task-image-1:hook:1",
          refId: "img-2",
          url: "https://example.com/image-2.png",
          prompt: "原始图片",
          createdAt: Date.now(),
          providerName: "fal",
          modelName: "fal-ai/nano-banana-pro",
          size: "1024x1024",
          parentOutputId: null,
          resourceSaved: false,
          applyTarget: null,
        },
      ],
    };
    const { render, getValue } = renderHook({
      currentImageWorkbenchState,
    });

    await render();

    const skillRequest = getValue().resolveImageWorkbenchCommandRequest({
      rawText: "@配图 编辑 #img-2 去掉角标，保留主体",
      parsedCommand: {
        rawText: "@配图 编辑 #img-2 去掉角标，保留主体",
        commandKey: "image_edit",
        trigger: "@配图",
        body: "编辑 #img-2 去掉角标，保留主体",
        mode: "edit",
        prompt: "去掉角标，保留主体",
        count: 1,
        size: undefined,
        aspectRatio: undefined,
        targetRef: "img-2",
      },
      images: [
        {
          data: "base64-image-1",
          mediaType: "image/png",
        },
      ],
    });

    expect(skillRequest).toMatchObject({
      images: [
        {
          data: "base64-image-1",
          mediaType: "image/png",
        },
      ],
      requestContext: {
        kind: "image_task",
        image_task: {
          mode: "edit",
          prompt: "去掉角标，保留主体",
          target_output_ref_id: "img-2",
          reference_images: [
            "https://example.com/image-2.png",
            "skill-input-image://1",
          ],
        },
      },
    });
  });

  it("普通输入 resolver 不应把工作台偏好写成图片执行路由", async () => {
    const { render, getValue } = renderHook({
      imageWorkbenchPreferredModelId: "gpt-images-2",
      imageWorkbenchPreferredProviderId:
        "custom-f0181b00-35b6-4731-94e2-24f17fd247c9",
      imageWorkbenchSelectedModelId: "",
      imageWorkbenchSelectedProviderId: "",
    });

    await render();

    const skillRequest = getValue().resolveImageWorkbenchCommandRequest({
      rawText: "@配图 生成 柴犬头像暖色插画",
      parsedCommand: {
        rawText: "@配图 生成 柴犬头像暖色插画",
        commandKey: "image_generate",
        trigger: "@配图",
        body: "生成 柴犬头像暖色插画",
        mode: "generate",
        prompt: "柴犬头像暖色插画",
        count: 1,
        size: "1024x1024",
        aspectRatio: undefined,
        targetRef: undefined,
      },
      images: [],
    });

    const imageTask = skillRequest?.requestContext["image_task"] as Record<
      string,
      unknown
    >;
    expect(imageTask).not.toHaveProperty("provider_id");
    expect(imageTask).not.toHaveProperty("model");
    expect(imageTask).not.toHaveProperty("executor_mode");
  });
});
