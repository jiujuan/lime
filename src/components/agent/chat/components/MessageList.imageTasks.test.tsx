import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  IMAGE_WORKBENCH_FOCUS_EVENT,
  mockStreamingRenderer,
  render,
  renderZh,
} from "./MessageList.testHarness";
import type {
  Message,
} from "./MessageList.testHarness";

describe("MessageList image tasks", () => {
  it("图片任务消息卡应在聊天区渲染预览并支持展开图片画布", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench",
        role: "assistant",
        content: "图片生成已完成，共生成 1 张。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-1",
          prompt: "一颗戴耳机的青柠，科技感插画风格",
          status: "complete",
          imageUrl: "https://example.com/generated.png",
          imageCount: 1,
          size: "1024x1024",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    let focusDetail: Record<string, unknown> | null = null;
    const handleFocus = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      focusDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-1"]',
    ) as HTMLDivElement | null;

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).not.toContain("一颗戴耳机的青柠");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(container.textContent).not.toContain("图片生成已完成");
    expect(previewCard?.className).not.toContain("max-w-[620px]");
    expect(
      previewCard?.querySelector(
        '[data-testid="image-workbench-message-preview-single-media-task-1"]',
      )?.className,
    ).toContain("w-[358px]");
    expect(previewCard?.querySelector("img")).not.toBeNull();

    act(() => {
      previewCard?.click();
    });

    expect(focusDetail).toEqual({
      projectId: "project-1",
      contentId: "content-1",
    });
    window.removeEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);
  });

  it("图片任务消息应隐藏旧提交详情表，只保留自然正文和轻量工具条", async () => {
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-verbose-template",
        role: "assistant",
        content:
          "好的！我来为你生成一张三国群像海报。\n\n任务已创建成功！这里是生成详情：\n\n| 项目 | 内容 |\n| --- | --- |\n| 画面构图 | 刘关张桃园三结义居中 |\n| 风格 | 国风电影感 |\n| 尺寸 | 1792 x 1024 |\n| 色调 | 墨黑、赤红、暗金 |\n| 模型 | fal-ai/nano-banana-pro |\n| 状态 | 已进入队列，正在生成中... |\n\n生成完成后图片会显示在对话中，稍等一下即可看到效果。",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "task-verbose-template",
          prompt: "三国主要人物群像海报",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/three-kingdoms.png",
          imageCount: 1,
          runtimeContract: {
            model: "fal-ai/nano-banana-pro",
          },
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-verbose-template"]',
    );

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).toContain("Nanobanana Pro");
    expect(container.textContent).not.toContain("任务已创建成功");
    expect(container.textContent).not.toContain("这里是生成详情");
    expect(container.textContent).not.toContain("画面构图");
    expect(container.textContent).not.toContain("已进入队列");
    expect(container.textContent).not.toContain("稍等一下即可看到效果");
    expect(previewCard?.querySelector("img")).not.toBeNull();
  });

  it("图片任务消息应在同一条 assistant 回复里保留自然铺垫、轻卡、图片和结果描述", async () => {
    const messages: Message[] = [
      {
        id: "msg-user-image-workbench-natural",
        role: "user",
        content: "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片",
        timestamp: new Date(),
      },
      {
        id: "msg-assistant-image-workbench-natural",
        role: "assistant",
        content: "收到，我按花城汇视角来生成广州塔的春天照片。",
        timestamp: new Date(),
        usage: {
          input_tokens: 31_000,
          output_tokens: 120,
          cached_input_tokens: 0,
        },
        contentParts: [
          { type: "text", text: "我先按你的描述创建异步图片任务" },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-image-natural",
              name: "limeCreateImageGenerationTask",
              arguments: "{}",
              status: "completed",
              startTime: new Date(),
              endTime: new Date(),
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-image-natural",
            name: "limeCreateImageGenerationTask",
            arguments: "{}",
            status: "completed",
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-natural-image",
          prompt: "一张广州塔，从花城汇看过去的春天的照片",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower.png",
          imageCount: 1,
          modelName: "fal-ai/nano-banana-pro",
          caption: null,
        },
      },
    ];

    const container = await renderZh(messages);
    const text = container.textContent || "";
    const leadRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );

    expect(text).toContain("收到，我按花城汇视角来生成广州塔的春天照片。");
    expect(text).not.toContain("先获取下工具参数");
    expect(text).not.toContain("马上生成");
    expect(text).toContain("图片生成");
    expect(text).toContain("Nanobanana Pro");
    expect(text).not.toContain("我继续改");
    expect(
      container.querySelector('[data-testid="token-usage-display"]'),
    ).not.toBeNull();
    expect(text).not.toContain("limeCreateImageGenerationTask");
    expect(text).not.toContain("异步图片任务");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-assistant-header"]',
      ),
    ).toBeNull();
    expect(leadRenderer).not.toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "收到，我按花城汇视角来生成广州塔的春天照片。",
        suppressProcessFlow: false,
        toolCalls: expect.arrayContaining([
          expect.objectContaining({ id: "tool-image-natural" }),
        ]),
        contentParts: undefined,
      }),
    );
    expect(
      container.querySelector('[data-testid="message-user-command-tag"]')
        ?.textContent,
    ).toBe("@Nanobanana Pro");
    expect(
      container.querySelector('[data-testid="message-user-command-content"]')
        ?.textContent,
    ).toContain("广州塔");
    expect(leadRenderer).not.toBeNull();
  });

  it("同一会话连续两次图片生成应分别保留用户指令、自然铺垫和对应轻卡", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-image-turn-1",
        role: "user",
        content: "@配图 生成一张广州塔春天照片",
        timestamp: now,
      },
      {
        id: "msg-assistant-image-turn-1",
        role: "assistant",
        content: "我先生成广州塔春天照片，保留春天的光线和城市视角。",
        timestamp: new Date(now.getTime() + 1_000),
        thinkingContent: "先判断广州塔照片的季节和视角。",
        contentParts: [
          { type: "thinking", text: "先判断广州塔照片的季节和视角。" },
          {
            type: "text",
            text: "我先生成广州塔春天照片，保留春天的光线和城市视角。",
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-image-turn-1",
          prompt: "广州塔春天照片",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower.png",
          imageCount: 1,
          modelName: "gpt-images-2",
          caption: "第一张已经好了，可以继续调春天氛围。",
        },
      },
      {
        id: "msg-user-image-turn-2",
        role: "user",
        content: "@配图 再生成一张青柠极简插画",
        timestamp: new Date(now.getTime() + 2_000),
      },
      {
        id: "msg-assistant-image-turn-2",
        role: "assistant",
        content: "这次换成青柠极简插画，我会把画面压得更干净。",
        timestamp: new Date(now.getTime() + 3_000),
        thinkingContent: "再判断青柠插画的极简构图。",
        contentParts: [
          { type: "thinking", text: "再判断青柠插画的极简构图。" },
          {
            type: "text",
            text: "这次换成青柠极简插画，我会把画面压得更干净。",
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-image-turn-2",
          prompt: "青柠极简插画",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/lime-minimal.png",
          imageCount: 1,
          modelName: "gpt-images-2",
          caption: "第二张也好了，可以继续改构图。",
        },
      },
    ];

    const container = await renderZh(messages);
    const commandTags = Array.from(
      container.querySelectorAll('[data-testid="message-user-command-tag"]'),
    ).map((node) => node.textContent);
    const leadTexts = mockStreamingRenderer.mock.calls
      .map((call) => call[0].content as string | undefined)
      .filter((content): content is string => Boolean(content));

    expect(commandTags).toEqual(["@配图", "@配图"]);
    expect(leadTexts).toEqual([
      "我先生成广州塔春天照片，保留春天的光线和城市视角。",
      "这次换成青柠极简插画，我会把画面压得更干净。",
    ]);
    expect(
      mockStreamingRenderer.mock.calls.map((call) => call[0].thinkingContent),
    ).toEqual(["先判断广州塔照片的季节和视角。", "再判断青柠插画的极简构图。"]);
    expect(
      mockStreamingRenderer.mock.calls.every(
        (call) => !call[0].toolCalls && !call[0].contentParts,
      ),
    ).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-turn-1"]',
      )?.textContent,
    ).toContain("第一张已经好了");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-turn-2"]',
      )?.textContent,
    ).toContain("第二张也好了");
    expect(container.textContent).not.toContain("任务 ID");
    expect(container.textContent).not.toContain("任务已提交");
  });

  it("用户消息带已安装 Skill route 时应保留 @ Skill 标签展示", async () => {
    const container = await renderZh([
      {
        id: "msg-user-installed-skill",
        role: "user",
        content: "帮我写一篇关于三国的故事",
        timestamp: new Date(),
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "brand-product-knowledge-builder",
          skillName: "brand-product-knowledge-builder",
        },
      } as Message,
    ]);

    const skillTag = container.querySelector(
      '[data-testid="message-user-skill-tag"]',
    );

    expect(skillTag?.textContent).toContain("@");
    expect(skillTag?.textContent).toContain("brand-product-knowledge-builder");
    expect(
      container.querySelector('[data-testid="message-user-command-tag"]'),
    ).toBeNull();
    expect(container.textContent).toContain("帮我写一篇关于三国的故事");
  });

  it("用户消息仅通过 builtin command route 进入时，也应保留 @命令 标签展示", async () => {
    const container = await renderZh([
      {
        id: "msg-user-builtin-route-only-image-command",
        role: "user",
        content: "生成一张广州塔，从花城汇看过去的春天照片",
        timestamp: new Date(),
        inputCapabilityRoute: {
          kind: "builtin_command",
          commandKey: "image_generate",
          commandPrefix: "@配图",
        },
      } as Message,
    ]);

    expect(
      container.querySelector('[data-testid="message-user-command-tag"]')
        ?.textContent,
    ).toBe("@配图");
    expect(
      container.querySelector('[data-testid="message-user-command-content"]')
        ?.textContent,
    ).toContain("广州塔");
  });

  it("历史助手消息没有图片轻卡时，也不应继续展示旧图片任务详情模板", async () => {
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-legacy-template-only",
        role: "assistant",
        content:
          "好的，我来为你生成一张青柠插画！\n\n✅ 青柠插画生成任务已创建\n\n任务 ID: 013dbd1b-0fc0-45de-a1c8-f78489ccc11c\nPrompt：一颗鲜嫩的青柠，水彩插画风格\n参数：\n🎨 风格：水彩插画\n📐 尺寸：1024×1024\n🤖 模型：fal-ai/nano-banana-pro\n🔧 Provider：fal\n任务已提交进入队列，你可以在 图片工作台（Image Workbench）中查看生成进度和最终结果。稍后如果已生成，你可以直接打开查看~",
        timestamp: new Date(),
      },
    ];

    const container = await renderZh(messages);

    expect(container.textContent).not.toContain("任务 ID");
    expect(container.textContent).not.toContain("Image Workbench");
    expect(container.textContent).not.toContain("生成进度和最终结果");
    expect(container.textContent).not.toContain("稍后如果已生成");
  });

  it("图片任务消息卡不应在聊天区展示 LimeCore 策略输入标签", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-policy",
        role: "assistant",
        content: "图片生成已完成，共生成 1 张。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-policy-1",
          prompt: "一颗戴耳机的青柠，科技感插画风格",
          status: "complete",
          imageUrl: "https://example.com/generated.png",
          imageCount: 1,
          size: "1024x1024",
          projectId: "project-1",
          contentId: "content-1",
          runtimeContract: {
            contractKey: "image_generation",
            routingSlot: "image_task",
            limecorePolicyEvaluationStatus: "input_gap",
            limecorePolicyEvaluationDecision: "ask",
            limecorePolicyEvaluationPendingRefs: [
              "model_catalog",
              "provider_offer",
              "tenant_feature_flags",
            ],
          },
        },
      },
    ];

    const container = render(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-policy-1"]',
    );

    expect(previewCard?.textContent).toContain("Image Generation");
    expect(previewCard?.textContent).not.toContain(
      "LimeCore 策略输入待命中: 3",
    );
  });

  it("图片任务消息应保留思考并把内部工具过程折叠到同一回复里", () => {
    const container = render(
      [
        {
          id: "msg-assistant-image-workbench-process-flow",
          role: "assistant",
          content: "已成功提交分镜任务。",
          timestamp: new Date(),
          contentParts: [
            { type: "thinking", text: "先执行图片技能。" },
            { type: "text", text: "已成功提交分镜任务。" },
          ],
          toolCalls: [
            {
              id: "tool-image-skill",
              name: "skill",
              arguments: JSON.stringify({ skill: "image_generate" }),
              status: "completed",
              result: {
                success: true,
                output: "processing",
              },
              startTime: new Date(),
              endTime: new Date(),
            },
          ],
          imageWorkbenchPreview: {
            taskId: "task-image-process-flow",
            prompt: "三国主要人物分镜",
            status: "running",
            imageCount: 9,
            expectedImageCount: 9,
            layoutHint: "storyboard_3x3",
            projectId: "project-1",
            contentId: "content-1",
          },
        } as Message,
      ],
      {
        currentTurnId: "turn-image-process-flow",
        turns: [
          {
            id: "turn-image-process-flow",
            thread_id: "thread-image-process-flow",
            prompt_text: "@分镜 生成三国人物分镜",
            status: "completed",
            started_at: "2026-04-24T01:36:56Z",
            completed_at: "2026-04-24T01:37:12Z",
            created_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
          },
        ],
        threadItems: [
          {
            id: "summary-image-process-flow",
            thread_id: "thread-image-process-flow",
            turn_id: "turn-image-process-flow",
            sequence: 1,
            status: "completed",
            started_at: "2026-04-24T01:36:56Z",
            completed_at: "2026-04-24T01:37:12Z",
            updated_at: "2026-04-24T01:37:12Z",
            type: "turn_summary",
            text: "已完成思考 3 步，正在提交图片任务",
          },
        ],
      },
    );

    expect(mockStreamingRenderer).toHaveBeenCalledTimes(1);
    const rendererProps = mockStreamingRenderer.mock.calls[0]?.[0] as
      | {
          content?: string;
          thinkingContent?: string;
          contentParts?: unknown[];
          toolCalls?: unknown[];
        }
      | undefined;
    expect(rendererProps).toMatchObject({
      content: "",
      thinkingContent: "先执行图片技能。",
      suppressProcessFlow: false,
    });
    expect(rendererProps?.contentParts).toBeUndefined();
    expect(rendererProps?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-image-skill" }),
    ]);
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-process-flow"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

  it("旧图片提交过程消息没有轻卡时应隐藏协议正文并折叠保留过程", () => {
    const container = render(
      [
        {
          id: "msg-assistant-image-submit-leak",
          role: "assistant",
          content:
            "我来为你生成一张广州塔从花城汇视角的春天照片。图片生成任务已提交！正在为你生成从花城汇看广州塔的春天照片。",
          timestamp: new Date(),
          isThinking: true,
          contentParts: [
            { type: "thinking", text: "开始中 广州塔春天照片" },
            {
              type: "text",
              text: '进度：正在生成工具输入：{"prompt":"广州塔"}',
            },
          ],
          toolCalls: [
            {
              id: "tool-image-generate",
              name: "lime_create_image_generation_task",
              arguments: JSON.stringify({ prompt: "广州塔" }),
              status: "completed",
              result: { success: true },
              startTime: new Date(),
              endTime: new Date(),
            },
          ],
        } as Message,
      ],
      {
        currentTurnId: "turn-image-submit-leak",
        turns: [
          {
            id: "turn-image-submit-leak",
            thread_id: "thread-image-submit-leak",
            prompt_text: "@Nanobanana Pro 生成广州塔春天照片",
            status: "running",
            started_at: "2026-04-24T01:36:56Z",
            created_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
          },
        ],
        threadItems: [
          {
            id: "summary-image-submit-leak",
            thread_id: "thread-image-submit-leak",
            turn_id: "turn-image-submit-leak",
            sequence: 1,
            status: "in_progress",
            started_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
            type: "turn_summary",
            text: '进度：正在生成工具输入：{"prompt":"广州塔"}',
          },
        ],
      },
    );

    expect(container.textContent).not.toContain("图片生成任务已提交");
    expect(container.textContent).not.toContain("工具输入");
    expect(mockStreamingRenderer).toHaveBeenCalledTimes(1);
    const rendererProps = mockStreamingRenderer.mock.calls[0]?.[0] as
      | {
          content?: string;
          contentParts?: unknown[];
          rawContent?: string;
          suppressProcessFlow?: boolean;
          toolCalls?: unknown[];
        }
      | undefined;
    expect(rendererProps).toMatchObject({
      content: "",
      rawContent: "",
      suppressProcessFlow: false,
    });
    expect(rendererProps?.contentParts).toEqual([
      { type: "thinking", text: "开始中 广州塔春天照片" },
    ]);
    expect(rendererProps?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-image-generate" }),
    ]);
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

});
