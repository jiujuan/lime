import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSkillCatalogCache,
  getSeededSkillCatalog,
  saveSkillCatalog,
  upsertLocalModelBoundImageCommandBinding,
} from "@/lib/api/skillCatalog";
import {
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
});
