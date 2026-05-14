import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSkillCatalogCache,
  getSeededSkillCatalog,
  saveSkillCatalog,
  upsertLocalModelBoundImageCommandBinding,
} from "@/lib/api/skillCatalog";
import {
  buildImageGenerateSkillSlashCommand,
  parseImageWorkbenchCommand,
  shouldRouteImageWorkbenchCommandToSkill,
} from "./imageWorkbenchCommand";

describe("parseImageWorkbenchCommand", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    clearSkillCatalogCache();
  });

  function bindLocalNanoBanana2Command(): void {
    upsertLocalModelBoundImageCommandBinding({
      trigger: "@Nano Banana 2",
      providerId: "fal",
      modelId: "fal-ai/nano-banana-2",
      executorMode: "images_api",
    });
  }

  it("应解析生成命令的数量与比例", () => {
    const result = parseImageWorkbenchCommand(
      "@配图 生成 公众号头图，科技感，16:9，出 4 张",
    );

    expect(result).toMatchObject({
      trigger: "@配图",
      mode: "generate",
      count: 4,
      aspectRatio: "16:9",
      size: "1792x1024",
      prompt: "公众号头图，科技感",
    });
  });

  it("@配图 未显式声明数量时应保持单张默认值", () => {
    const result = parseImageWorkbenchCommand("@配图 生成 三国人物群像");

    expect(result).toMatchObject({
      trigger: "@配图",
      mode: "generate",
      count: 1,
      prompt: "三国人物群像",
    });
  });

  it("未在目录声明的图片模型 @命令不应自动变成 API 入口", () => {
    expect(
      parseImageWorkbenchCommand(
        "@Nano Banana 2 生成一张广州塔，从花城汇看过去的春天的照片",
      ),
    ).toBeNull();
  });

  it("@分镜 未显式声明数量时应默认按九宫格分镜处理", () => {
    const result = parseImageWorkbenchCommand("@分镜 生成 三国人物群像");

    expect(result).toMatchObject({
      trigger: "@分镜",
      mode: "generate",
      count: 9,
      layoutHint: "storyboard_3x3",
      prompt: "三国人物群像",
    });
  });

  it("@分镜 遇到 3x3 分镜提示时应解析成九宫格布局", () => {
    const result = parseImageWorkbenchCommand(
      "@分镜 生成 三国主要人物，3x3 分镜，电影感",
    );

    expect(result).toMatchObject({
      trigger: "@分镜",
      mode: "generate",
      count: 9,
      layoutHint: "storyboard_3x3",
      prompt: "三国主要人物，电影感",
    });
  });

  it("@分镜 显式声明非九宫格数量时应保留通用多图数量", () => {
    const result = parseImageWorkbenchCommand(
      "@分镜 生成 三国人物群像，出 6 张",
    );

    expect(result).toMatchObject({
      trigger: "@分镜",
      mode: "generate",
      count: 6,
      layoutHint: undefined,
      prompt: "三国人物群像",
    });
  });

  it("应解析编辑命令的目标图引用", () => {
    const result = parseImageWorkbenchCommand(
      "@image 编辑 #img-2 去掉文字，保留主体",
    );

    expect(result).toMatchObject({
      trigger: "@image",
      mode: "edit",
      targetRef: "img-2",
      prompt: "去掉文字，保留主体",
    });
  });

  it("应把 @修图 默认解析为编辑命令", () => {
    const result = parseImageWorkbenchCommand(
      "@修图 #img-2 去掉角标，保留主体",
    );

    expect(result).toMatchObject({
      trigger: "@修图",
      mode: "edit",
      targetRef: "img-2",
      prompt: "去掉角标，保留主体",
    });
  });

  it("应把 @重绘 默认解析为重绘命令", () => {
    const result = parseImageWorkbenchCommand("@重绘 #img-7 更偏插画风，4:5");

    expect(result).toMatchObject({
      trigger: "@重绘",
      mode: "variation",
      targetRef: "img-7",
      aspectRatio: "4:5",
      size: "864x1152",
      prompt: "更偏插画风",
    });
  });

  it("应兼容 @Vision 1，并继续走视觉生成主链", () => {
    const result = parseImageWorkbenchCommand(
      "@Vision 1 春日咖啡品牌主视觉海报，4:5",
    );

    expect(result).toMatchObject({
      trigger: "@Vision 1",
      mode: "generate",
      count: 1,
      aspectRatio: "4:5",
      size: "864x1152",
      prompt: "春日咖啡品牌主视觉海报",
    });
  });

  it("应解析 @Nanobanana Pro，并固定到 Nanobanana Pro 模型", () => {
    const result = parseImageWorkbenchCommand(
      "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片",
    );

    expect(result).toMatchObject({
      trigger: "@Nanobanana Pro",
      mode: "generate",
      count: 1,
      providerId: "fal",
      modelId: "fal-ai/nano-banana-pro",
      prompt: "一张广州塔，从花城汇看过去的春天的照片",
    });
  });

  it("应解析内置 @GPT Images 2，并固定到 GPT Images 2 模型", () => {
    const result = parseImageWorkbenchCommand(
      "@GPT Images 2 画一张虞美人霸王别姬的图",
    );

    expect(result).toMatchObject({
      commandKey: "image_generate_gpt_images_2",
      trigger: "@GPT Images 2",
      mode: "generate",
      count: 1,
      modelId: "gpt-images-2",
      executorMode: "responses_image_generation",
      prompt: "画一张虞美人霸王别姬的图",
    });
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: result!,
      }),
    ).toBe(true);
  });

  it("应解析本地声明的 @Nano Banana 2 为图片模型绑定命令", () => {
    bindLocalNanoBanana2Command();

    const result = parseImageWorkbenchCommand(
      "@Nano Banana 2 生成一张广州塔，从花城汇看过去的春天的照片",
    );

    expect(result).toMatchObject({
      commandKey: "image_model_nano_banana_2",
      trigger: "@Nano Banana 2",
      mode: "generate",
      count: 1,
      providerId: "fal",
      modelId: "fal-ai/nano-banana-2",
      entrySource: "at_nano_banana_2_model_command",
      executorMode: "images_api",
      prompt: "一张广州塔，从花城汇看过去的春天的照片",
    });
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: result!,
      }),
    ).toBe(true);
  });

  it("本地绑定的 @GPT Images 2 应覆盖内置同名命令并保留 Provider 路由", () => {
    upsertLocalModelBoundImageCommandBinding({
      trigger: "@GPT Images 2",
      providerId: "yunwu.ai",
      modelId: "gpt-image-2",
      executorMode: "responses_image_generation",
    });

    const result = parseImageWorkbenchCommand(
      "@GPT Images 2 画一张虞美人霸王别姬的图",
    );

    expect(result).toMatchObject({
      commandKey: "image_model_gpt_images_2",
      trigger: "@GPT Images 2",
      providerId: "yunwu.ai",
      modelId: "gpt-image-2",
      entrySource: "at_gpt_images_2_model_command",
      executorMode: "responses_image_generation",
      prompt: "画一张虞美人霸王别姬的图",
    });
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: result!,
      }),
    ).toBe(true);
  });

  it("应解析 Lime Cloud 或本地目录声明的图片模型绑定命令", () => {
    const seeded = getSeededSkillCatalog();
    saveSkillCatalog(
      {
        ...seeded,
        version: "tenant-image-command-2026-05-14",
        tenantId: "tenant-image-command",
        syncedAt: "2026-05-14T00:00:00.000Z",
        entries: [
          {
            id: "command:image-model:gpt_images_2",
            kind: "command",
            title: "GPT Images 2",
            summary: "使用 GPT Images 2 创建标准图片任务。",
            command_key: "image_model_gpt_images_2",
            triggers: [{ mode: "mention", prefix: "@GPT Images 2" }],
            binding: {
              skill_id: "image_generate",
              execution_kind: "task_queue",
              request_defaults: {
                image_workbench: "true",
                model_bound_image_task: "true",
                entry_source: "at_gpt_images_2_model_command",
                provider_id: "airgate-openai-images",
                model_id: "gpt-images-2",
                executor_mode: "responses_image_generation",
                bindingSource: "lime_cloud",
              },
            },
            render_contract: {
              result_kind: "image_gallery",
              detail_kind: "media_detail",
              supports_streaming: true,
              supports_timeline: true,
            },
          },
          ...seeded.entries,
        ],
      },
      "bootstrap_sync",
    );

    const result = parseImageWorkbenchCommand(
      "@GPT Images 2 生成一张产品发布会主视觉",
    );

    expect(result).toMatchObject({
      commandKey: "image_model_gpt_images_2",
      trigger: "@GPT Images 2",
      providerId: "airgate-openai-images",
      modelId: "gpt-images-2",
      entrySource: "at_gpt_images_2_model_command",
      executorMode: "responses_image_generation",
      prompt: "一张产品发布会主视觉",
    });
  });

  it("@Nano Banana 2 带附件时不应跳过普通附件处理", () => {
    bindLocalNanoBanana2Command();

    const parsed = parseImageWorkbenchCommand("@Nano Banana 2 参考这张图重绘");

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
        attachedImageCount: 1,
      }),
    ).toBe(false);
  });

  it("未显式声明动作但带目标图时应默认为变体", () => {
    const result = parseImageWorkbenchCommand("/image #img-7 更偏插画风，4:5");

    expect(result).toMatchObject({
      trigger: "/image",
      mode: "variation",
      targetRef: "img-7",
      aspectRatio: "4:5",
      size: "864x1152",
      prompt: "更偏插画风",
    });
  });

  it("非图片命令应返回空", () => {
    expect(parseImageWorkbenchCommand("帮我总结一下这段代码")).toBeNull();
  });

  it("纯文本生成命令应路由到 image_generate skill", () => {
    const parsed = parseImageWorkbenchCommand(
      "@配图 生成 公众号头图，科技感，16:9，出 4 张",
    );

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
      }),
    ).toBe(true);
    expect(buildImageGenerateSkillSlashCommand(parsed!)).toBe(
      "/image_generate 生成 公众号头图，科技感，16:9，出 4 张",
    );
  });

  it("@分镜 纯文本生成命令也应复用 image_generate skill 主链", () => {
    const parsed = parseImageWorkbenchCommand(
      "@分镜 生成 三国主要人物，3x3 分镜",
    );

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
      }),
    ).toBe(true);
    expect(buildImageGenerateSkillSlashCommand(parsed!)).toBe(
      "/image_generate 生成 三国主要人物，3x3 分镜",
    );
  });

  it("带引用图的编辑命令不应直接路由到 skill", () => {
    const parsed = parseImageWorkbenchCommand(
      "@image 编辑 #img-2 去掉文字，保留主体",
    );

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
      }),
    ).toBe(false);
  });

  it("@修图 不应被路由到 image_generate skill", () => {
    const parsed = parseImageWorkbenchCommand(
      "@修图 #img-2 提亮肤色并保留主体",
    );

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
      }),
    ).toBe(false);
  });

  it("@修图 转发到 slash skill 时应补齐编辑语义", () => {
    const parsed = parseImageWorkbenchCommand(
      "@修图 #img-2 提亮肤色并保留主体",
    );

    expect(parsed).not.toBeNull();
    expect(buildImageGenerateSkillSlashCommand(parsed!)).toBe(
      "/image_generate 编辑 #img-2 提亮肤色并保留主体",
    );
  });

  it("@重绘 不应被路由到 image_generate skill，并应补齐重绘语义", () => {
    const parsed = parseImageWorkbenchCommand("@重绘 #img-7 更偏插画风");

    expect(parsed).not.toBeNull();
    expect(
      shouldRouteImageWorkbenchCommandToSkill({
        parsedCommand: parsed!,
      }),
    ).toBe(false);
    expect(buildImageGenerateSkillSlashCommand(parsed!)).toBe(
      "/image_generate 重绘 #img-7 更偏插画风",
    );
  });
});
