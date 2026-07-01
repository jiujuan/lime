import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale, limeI18nResources } from "@/i18n/createI18n";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import {
  clearSkillCatalogCache,
  upsertLocalModelBoundImageCommandBinding,
} from "@/lib/api/skillCatalog";
import type { MessageImageWorkbenchPreview } from "../types";
import {
  buildImageTaskAssistantContent,
  buildImageTaskPresentationContext,
} from "../workspace/imageTaskPersona";
import {
  buildImageWorkbenchCaption,
  resolveImageWorkbenchPreviewModelLabel,
} from "./imageWorkbenchPresentation";

describe("imageWorkbenchPresentation", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await changeLimeLocale("zh-CN");
  });

  afterEach(() => {
    window.localStorage.clear();
    clearSkillCatalogCache();
  });

  it("图片生成人设不再提供可见固定铺垫，正常聊天正文应来自模型流式输出", () => {
    const fallback = buildImageTaskAssistantContent({
      prompt: "一张广州塔，从花城汇看过去的春天的照片",
      mode: "generate",
      modelName: "fal-ai/nano-banana-pro",
    });

    expect(fallback).toBe("");
    expect(fallback).not.toContain("先获取下工具参数");
    expect(fallback).not.toContain("马上生成");
    expect(fallback).not.toContain("Nanobanana Pro");
  });

  it("展示层不再为成功结果注入固定收尾模板，收尾文案由模型写入 task presentation", () => {
    expect(
      buildImageWorkbenchCaption({
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        status: "complete",
        imageCount: 1,
      }),
    ).toBeNull();

    const presentation = buildImageTaskPresentationContext({
      prompt: "一张广州塔，从花城汇看过去的春天的照片",
      mode: "generate",
      modelId: "fal-ai/nano-banana-pro",
    });

    expect(presentation).toMatchObject({
      opening_guidance: {
        source: "model_stream",
        avoid_fixed_templates: true,
        avoid_visible_process_lines: true,
      },
      message_contract: {
        preserve_intro_during_stream: false,
        prefer_model_stream_text: true,
      },
      assistant_intro_request: {
        source: "model_generated_before_tool",
        mode: "generate",
        prompt_intent: "一张广州塔，从花城汇看过去的春天的照片",
        avoid_fixed_templates: true,
      },
      completion_caption_request: {
        source: "model_generated_at_tool_call",
        mode: "generate",
        prompt_intent: "一张广州塔，从花城汇看过去的春天的照片",
        avoid_fixed_templates: true,
      },
    });
    expect(presentation).not.toHaveProperty("assistant_intro");
    expect(presentation).not.toHaveProperty("completion_caption");
    expect(presentation).not.toHaveProperty("result_captions");
    expect(presentation).not.toHaveProperty("process_lines");
  });

  it("失败说明不把底层服务错误直接展示到聊天结果里", () => {
    expect(
      buildImageWorkbenchCaption({
        prompt: "一张青柠极简插画",
        status: "failed",
        statusMessage:
          'Fal HTTP 403: {"detail":"User is locked. Reason: Exhausted balance."}',
      }),
    ).toBe("这次没有生成成功");
  });

  it("模型绑定 @命令的轻卡名称应沿用当前目录标题，而不是只看内置目录或模型 ID", () => {
    upsertLocalModelBoundImageCommandBinding({
      trigger: "@GPT Images 2",
      providerId: "yunwu.ai",
      modelId: "gpt-image-2",
      executorMode: "responses_image_generation",
    });

    expect(
      resolveImageWorkbenchPreviewModelLabel({
        taskId: "task-image-1",
        mode: "generate",
        prompt: "虞美人霸王别姬",
        status: "running",
        modelName: "gpt-image-2",
      } satisfies MessageImageWorkbenchPreview),
    ).toBe("GPT Images 2");
  });

  it("运行合同模型应覆盖轻卡里的旧模型名", () => {
    expect(
      resolveImageWorkbenchPreviewModelLabel({
        taskId: "task-image-model-updated",
        mode: "generate",
        prompt: "最新模型青柠主视觉",
        status: "complete",
        modelName: "fal-ai/nano-banana-pro",
        runtimeContract: {
          model: "fal-ai/nano-banana-pro-v2",
        },
      } satisfies MessageImageWorkbenchPreview),
    ).toBe("Nano Banana Pro V2");
  });

  it("旧固定寒暄与成功收尾资源不再作为展示事实源", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const agent = limeI18nResources[locale]?.agent || {};
      expect(agent).not.toHaveProperty(
        "agentChat.imageTaskPersona.fallback.generate",
      );
      expect(agent).not.toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.completeDefault",
      );
      expect(agent).not.toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.partialDefault",
      );
    }
  });
});
