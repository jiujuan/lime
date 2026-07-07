import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_WORKBENCH_TASK_ACTION_EVENT,
  VIDEO_WORKBENCH_TASK_ACTION_EVENT,
  mockStreamingRenderer,
  render,
  renderZh,
} from "./MessageList.testHarness";
import type { Message } from "./MessageList.testHarness";

describe("MessageList media tasks", () => {
  it("空正文图片任务轻卡应保留并支持打开图片工作台", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-task",
        role: "assistant",
        content: "",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-image-1",
          mode: "generate",
          prompt: "深圳夏天午后的城市照片",
          status: "complete",
          imageUrl: "data:image/png;base64,aW1hZ2U=",
          imageCount: 1,
          runtimeContract: {
            model: "agnes-image-2.1-flash",
          },
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-image-1"]',
    ) as HTMLDivElement | null;

    expect(previewCard).not.toBeNull();
    expect(previewCard?.textContent).toContain("Image Generation");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,aW1hZ2U=",
    );

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "image_workbench",
        preview: expect.objectContaining({
          taskId: "task-image-1",
        }),
        selection: undefined,
      },
      expect.objectContaining({
        id: "msg-assistant-image-task",
      }),
    );
  });

  it("media reference content part 应接入消息预览 target", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-media-reference",
        role: "assistant",
        content: "图片已生成。",
        timestamp: now,
        contentParts: [
          {
            type: "media_reference",
            reference: {
              kind: "image",
              uri: "sidecar://media/image-1",
              mimeType: "image/png",
              caption: "结果图",
            },
          },
          {
            type: "text",
            text: "图片已生成。",
          },
        ],
      },
    ];

    render(messages, { onOpenMessagePreview });

    const rendererCall = mockStreamingRenderer.mock.calls.find(([props]) =>
      props.contentParts?.some(
        (part: Record<string, unknown>) => part.type === "media_reference",
      ),
    )?.[0];
    expect(rendererCall?.onOpenMediaReference).toBeTypeOf("function");

    act(() => {
      rendererCall?.onOpenMediaReference?.(
        {
          kind: "image",
          uri: "sidecar://media/image-1",
          mimeType: "image/png",
          caption: "结果图",
        },
        0,
      );
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "media_reference",
        index: 0,
        reference: expect.objectContaining({
          uri: "sidecar://media/image-1",
          caption: "结果图",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-media-reference",
      }),
    );
  });

  it("视频任务消息卡应在聊天区渲染预览并支持打开工作区查看", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-task",
        role: "assistant",
        content: "视频任务已提交，正在生成。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "running",
          progress: 42,
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-video-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("视频生成");
    expect(previewCard?.textContent).toContain("16:9");
    expect(previewCard?.textContent).toContain("720p");
    expect(previewCard?.textContent).toContain("42%");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "video_generate",
          taskId: "task-video-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-video-task",
      }),
    );
  });

  it("失败的视频任务卡应提供重新生成动作，并通过事件总线下发而不是误触发打开工作区", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-failed",
        role: "assistant",
        content: "视频任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-failed-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "failed",
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = await renderZh(messages, { onOpenMessagePreview });
    const actionButton = container.querySelector(
      '[data-testid="task-message-preview-action-task-video-failed-1-retry"]',
    ) as HTMLButtonElement | null;

    expect(actionButton?.textContent).toContain("重新生成");

    act(() => {
      actionButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "retry",
      taskId: "task-video-failed-1",
      projectId: "project-video-1",
      contentId: "content-video-1",
    });
    expect(onOpenMessagePreview).not.toHaveBeenCalled();

    window.removeEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("进行中的视频任务卡应提供取消动作，并继续保留打开工作区能力", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-running-action",
        role: "assistant",
        content: "视频任务进行中。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-running-action-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "running",
          progress: 18,
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = await renderZh(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-video-running-action-1"]',
    ) as HTMLButtonElement | null;
    const actionButton = container.querySelector(
      '[data-testid="task-message-preview-action-task-video-running-action-1-cancel"]',
    ) as HTMLButtonElement | null;

    expect(actionButton?.textContent).toContain("取消任务");

    act(() => {
      actionButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "cancel",
      taskId: "task-video-running-action-1",
      projectId: "project-video-1",
      contentId: "content-video-1",
    });
    expect(onOpenMessagePreview).not.toHaveBeenCalled();

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "video_generate",
          taskId: "task-video-running-action-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-video-running-action",
      }),
    );

    window.removeEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("通用任务消息卡应在聊天区渲染预览并支持打开对应产物", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-resource-task",
        role: "assistant",
        content: "素材检索任务已提交。",
        timestamp: now,
        taskPreview: {
          kind: "modal_resource_search",
          taskId: "task-resource-1",
          taskType: "modal_resource_search",
          prompt: "咖啡馆木桌背景",
          title: "公众号头图素材",
          status: "running",
          artifactPath:
            ".lime/tasks/modal_resource_search/task-resource-1.json",
          metaItems: ["image", "公众号头图", "8 个候选"],
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-resource-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("素材检索");
    expect(previewCard?.textContent).toContain("公众号头图素材");
    expect(previewCard?.textContent).toContain("8 个候选");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "modal_resource_search",
          taskId: "task-resource-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-resource-task",
      }),
    );
  });

  it("配音任务消息卡应展示 audio_generate 预览并支持打开运行时文档", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-audio-task",
        role: "assistant",
        content: "配音任务已提交。",
        timestamp: now,
        taskPreview: {
          kind: "audio_generate",
          taskId: "task-audio-1",
          taskType: "audio_generate",
          prompt: "欢迎来到 Lime 多模态工作台。",
          title: "配音生成任务",
          status: "running",
          artifactPath: ".lime/runtime/audio-generate/task-audio-1.md",
          taskFilePath: ".lime/tasks/audio_generate/task-audio-1.json",
          metaItems: ["warm_female", "8 秒"],
          voice: "warm_female",
          durationMs: 8200,
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-audio-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("配音生成");
    expect(previewCard?.textContent).toContain("欢迎来到 Lime 多模态工作台");
    expect(previewCard?.textContent).toContain("warm_female");
    expect(previewCard?.textContent).toContain("源任务");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "audio_generate",
          taskId: "task-audio-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-audio-task",
      }),
    );
  });

  it("失败的配音任务卡应展示 provider 错误码与原因", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-audio-task-failed",
        role: "assistant",
        content: "配音任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "audio_generate",
          taskId: "task-audio-failed-1",
          taskType: "audio_generate",
          prompt: "欢迎来到 Lime 多模态工作台。",
          title: "配音生成任务",
          status: "failed",
          artifactPath: ".lime/runtime/audio-generate/task-audio-failed-1.md",
          taskFilePath: ".lime/tasks/audio_generate/task-audio-failed-1.json",
          errorCode: "audio_provider_unconfigured",
          errorMessage:
            "未找到可用的 voice_generation provider/API Key: missing-provider。",
          statusMessage:
            "配音 Provider 未配置，请先在语音生成设置中选择可用 Provider；任务保留在 audio_generate，不会回退 legacy TTS。",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-audio-failed-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("执行失败");
    expect(previewCard?.textContent).toContain("audio_provider_unconfigured");
    expect(previewCard?.textContent).toContain(
      "未找到可用的 voice_generation provider/API Key",
    );
    expect(previewCard?.textContent).toContain("不会回退 legacy TTS");
  });

  it("转写任务消息卡应展示 transcript 路径与 provider 错误", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-transcription-task",
        role: "assistant",
        content: "转写任务已同步。",
        timestamp: now,
        taskPreview: {
          kind: "transcription_generate",
          taskId: "task-transcription-1",
          taskType: "transcription_generate",
          prompt: "请转写访谈音频",
          title: "内容转写任务",
          status: "complete",
          artifactPath:
            ".lime/runtime/transcription-generate/task-transcription-1.md",
          taskFilePath:
            ".lime/tasks/transcription_generate/task-transcription-1.json",
          transcriptPath: ".lime/runtime/transcripts/task-transcription-1.txt",
          language: "zh-CN",
          outputFormat: "txt",
          transcriptSegments: [
            {
              id: "segment-1",
              index: 1,
              startMs: 1000,
              endMs: 3500,
              speaker: "主持人",
              text: "欢迎来到 Lime 访谈。",
            },
          ],
          statusMessage:
            "转写结果已同步，工作区已从 transcript 读取可校对文本。",
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-transcription-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("内容转写");
    expect(previewCard?.textContent).toContain("请转写访谈音频");
    expect(previewCard?.textContent).toContain("转写结果");
    expect(previewCard?.textContent).toContain("task-transcription-1.txt");
    expect(previewCard?.textContent).toContain("1 段时间轴");
    expect(previewCard?.textContent).toContain("时间轴预览");
    expect(previewCard?.textContent).toContain("主持人：欢迎来到 Lime 访谈。");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "transcription_generate",
          taskId: "task-transcription-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-transcription-task",
      }),
    );
  });

  it("失败的转写任务卡应展示 transcript 错误码与原因", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-transcription-task-failed",
        role: "assistant",
        content: "转写任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "transcription_generate",
          taskId: "task-transcription-failed-1",
          taskType: "transcription_generate",
          prompt: "请转写访谈音频",
          title: "内容转写任务",
          status: "failed",
          artifactPath:
            ".lime/runtime/transcription-generate/task-transcription-failed-1.md",
          taskFilePath:
            ".lime/tasks/transcription_generate/task-transcription-failed-1.json",
          errorCode: "transcription_provider_unconfigured",
          errorMessage:
            "未找到可用的 audio_transcription provider/API Key: missing-provider。",
          statusMessage:
            "转写 Provider 未配置，请先在转写设置中选择可用 Provider；任务保留在 transcription_generate，不会回退 frontend ASR。",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-transcription-failed-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("执行失败");
    expect(previewCard?.textContent).toContain(
      "transcription_provider_unconfigured",
    );
    expect(previewCard?.textContent).toContain(
      "未找到可用的 audio_transcription provider/API Key",
    );
    expect(previewCard?.textContent).toContain("不会回退 frontend ASR");
  });

  it("联网搜图结果消息卡应展示缩略图候选", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-resource-search-preview",
        role: "assistant",
        content: "已找到一组图片素材候选。",
        timestamp: now,
        taskPreview: {
          kind: "modal_resource_search",
          taskId: "resource-search:tool-1",
          taskType: "modal_resource_search",
          prompt: "cozy coffee table",
          title: "Pexels 图片候选",
          status: "complete",
          artifactPath: ".lime/runtime/resource-search/tool-1.md",
          metaItems: ["Pexels", "3 个候选"],
          imageCandidates: [
            {
              id: "hit-1",
              thumbnailUrl: "https://pexels.example/1-thumb.jpg",
              contentUrl: "https://pexels.example/1.jpg",
              name: "cozy coffee table 1",
            },
            {
              id: "hit-2",
              thumbnailUrl: "https://pexels.example/2-thumb.jpg",
              contentUrl: "https://pexels.example/2.jpg",
              name: "cozy coffee table 2",
            },
            {
              id: "hit-3",
              thumbnailUrl: "https://pexels.example/3-thumb.jpg",
              contentUrl: "https://pexels.example/3.jpg",
              name: "cozy coffee table 3",
            },
          ],
        },
      },
    ];

    const container = render(messages);
    const media = container.querySelector(
      '[data-testid="task-message-preview-media-resource-search:tool-1"]',
    );

    expect(media).not.toBeNull();
    expect(
      container.querySelector('img[src="https://pexels.example/1-thumb.jpg"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pexels.example/2-thumb.jpg"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pexels.example/3-thumb.jpg"]'),
    ).toBeTruthy();
  });

  it("修图任务消息卡应收敛为裸结果图", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-edit-preview",
        role: "assistant",
        content: "修图任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-edit-1",
          prompt: "去掉背景里的广告牌，保留主体人物",
          mode: "edit",
          status: "complete",
          imageUrl: "https://example.com/edited.png",
          imageCount: 1,
          sourceImageUrl: "https://example.com/source.png",
          sourceImagePrompt: "原始街景海报",
          sourceImageRef: "img-source-1",
          sourceImageCount: 1,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-edit-1"]',
    );

    expect(previewCard?.textContent).toContain("图片编辑");
    expect(previewCard?.querySelector("img")).not.toBeNull();
    expect(previewCard?.textContent).not.toContain("已修图");
    expect(previewCard?.textContent).not.toContain("来源图");
    expect(previewCard?.textContent).not.toContain("原始街景海报");
  });

  it("图片任务完成但图片仍在工作台时，不应继续显示生成中占位", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-complete-without-image",
        role: "assistant",
        content: "图片任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-complete-without-image",
          prompt: "赛博青柠实验室，电影感光影",
          status: "complete",
          imageCount: 2,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-complete-without-image"]',
    );

    expect(previewCard?.textContent).toContain("图片暂时无法显示");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(previewCard?.textContent).not.toContain("图片任务卡");
  });

  it("图片任务已经完成时，不应继续向用户暴露同步中的过渡文案", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-complete-sync-copy",
        role: "assistant",
        content: "图片任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-complete-sync-copy",
          prompt: "广州塔清晨薄雾氛围图",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower-morning.png",
          imageCount: 1,
          statusMessage: "图片任务已提交，正在同步任务状态。",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-complete-sync-copy"]',
    );

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(previewCard?.textContent).not.toContain("正在同步任务状态");
    expect(previewCard?.textContent).not.toContain("图片任务已提交");
  });

  it("失败的图片任务卡应提供单独重试按钮，并继续保留打开查看能力", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-failed",
        role: "assistant",
        content: "图片任务失败。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-failed-1",
          prompt: "青柠品牌 KV",
          status: "failed",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(IMAGE_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-failed-1"]',
    ) as HTMLButtonElement | null;
    const retryButton = container.querySelector(
      '[data-testid="image-workbench-message-preview-action-task-failed-1-retry"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("生成失败");
    expect(retryButton?.textContent).toContain("重试");

    act(() => {
      retryButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "retry",
      taskId: "task-failed-1",
      projectId: "project-1",
      contentId: "content-1",
    });

    window.removeEventListener(IMAGE_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("生成中的图片任务卡应展示同会话占位，但不再展示取消按钮", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-running",
        role: "assistant",
        content: "图片任务处理中。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-running-1",
          prompt: "青柠宇航员海报",
          status: "running",
          phase: "queued",
          statusMessage: "任务已进入队列，等待图片服务分配执行槽位。",
          attemptCount: 2,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    expect(container.textContent).toContain("正在生成图片");
    expect(container.textContent).not.toContain(
      "任务已进入队列，等待图片服务分配执行槽位。",
    );
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-running-1-cancel"]',
      ),
    ).toBeNull();
  });

  it("失败的图片任务卡不暴露底层错误，原状态标记不可重试时不展示重试入口", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-failed-no-retry",
        role: "assistant",
        content: "图片任务失败。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-failed-no-retry",
          prompt: "青柠品牌 KV",
          status: "failed",
          retryable: false,
          statusMessage: "FAL 请求参数无效，请先调整配置。",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-failed-no-retry"]',
    );

    expect(previewCard?.textContent).toContain("生成失败");
    expect(previewCard?.textContent).not.toContain(
      "FAL 请求参数无效，请先调整配置。",
    );
    expect(previewCard?.textContent).not.toContain("不可重试");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-failed-no-retry-retry"]',
      ),
    ).toBeNull();
  });

  it("已取消的图片任务卡应显示独立状态并保留重试按钮", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-cancelled",
        role: "assistant",
        content: "图片任务已取消。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-cancelled-1",
          prompt: "青柠像素头像",
          status: "cancelled",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-cancelled-1"]',
    );

    expect(previewCard?.textContent).toContain("已取消");
    expect(previewCard?.textContent).not.toContain("打开查看");
    const retryButton = container.querySelector(
      '[data-testid="image-workbench-message-preview-action-task-cancelled-1-retry"]',
    );
    expect(retryButton).not.toBeNull();
    expect(retryButton?.textContent).toContain("重试");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-cancelled-1-open"]',
      ),
    ).toBeNull();
  });

  it("图片任务卡点击后应打开右侧查看区", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-cancelled-open",
        role: "assistant",
        content: "图片任务已取消。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-open-1",
          prompt: "青柠像素头像",
          status: "cancelled",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-open-1"]',
    ) as HTMLDivElement | null;

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "image_workbench",
        preview: expect.objectContaining({
          taskId: "task-open-1",
        }),
        selection: undefined,
      },
      expect.objectContaining({
        id: "msg-assistant-image-workbench-cancelled-open",
      }),
    );
    expect(previewCard?.className).toContain("cursor-pointer");
  });

  it("图片任务卡默认不再渲染任何底部操作按钮", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-actions-hidden",
        role: "assistant",
        content: "图片任务处理中。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-actions-hidden",
          prompt: "青柠宇航员海报",
          status: "running",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = render(messages);
    expect(
      container.querySelectorAll(
        '[data-testid^="image-workbench-message-preview-action-"]',
      ).length,
    ).toBe(0);
  });

  it("3x3 分镜消息卡应渲染九宫格摘要而不是单图卡", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-storyboard",
        role: "assistant",
        content: "3x3 分镜已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-storyboard-preview-1",
          prompt: "三国主要人物分镜",
          status: "complete",
          imageCount: 9,
          imageUrl: "https://example.com/storyboard-primary.png",
          previewImages: Array.from(
            { length: 9 },
            (_, index) => `https://example.com/storyboard-${index + 1}.png`,
          ),
          layoutHint: "storyboard_3x3",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const grid = container.querySelector(
      '[data-testid="image-workbench-message-preview-grid-task-storyboard-preview-1"]',
    ) as HTMLDivElement | null;

    expect(container.textContent).toContain("图片生成");
    expect(container.textContent).not.toContain(
      "3x3 分镜已经完成，可在右侧继续查看与使用。",
    );
    expect(container.textContent).not.toContain("9 张");
    expect(grid?.className).toContain("grid-cols-3");
    expect(grid?.querySelectorAll("img")).toHaveLength(9);
    expect(grid?.textContent).not.toContain("1");
    expect(grid?.textContent).not.toContain("9");
  });

  it("点击九宫格图片时应打开右侧工作台并带上选择项", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-storyboard-select",
        role: "assistant",
        content: "已生成章节配图。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-storyboard-select",
          prompt: "章节配图",
          status: "complete",
          imageCount: 3,
          imageUrl: "https://example.com/chapter-1.png",
          previewImages: [
            "https://example.com/chapter-1.png",
            "https://example.com/chapter-2.png",
            "https://example.com/chapter-3.png",
          ],
          layoutHint: "storyboard_3x3",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const secondImageTile = container.querySelector(
      '[data-testid="image-workbench-message-preview-media-task-storyboard-select-2"]',
    ) as HTMLDivElement | null;

    act(() => {
      secondImageTile?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "image_workbench",
        preview: expect.objectContaining({
          taskId: "task-storyboard-select",
        }),
        selection: {
          imageIndex: 1,
          imageUrl: "https://example.com/chapter-2.png",
        },
      },
      expect.objectContaining({
        id: "msg-assistant-image-workbench-storyboard-select",
      }),
    );
    expect(secondImageTile?.tagName.toLowerCase()).toBe("button");
  });

});
