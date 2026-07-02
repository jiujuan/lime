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

  it("图片生成人设在无模型正文时会给出自然起手", () => {
    const fallback = buildImageTaskAssistantContent({
      prompt: "一张广州塔，从花城汇看过去的春天的照片",
      mode: "generate",
      modelName: "fal-ai/nano-banana-pro",
    });

    expect(fallback).toContain("好啊");
    expect(fallback).toContain("广州塔");
    expect(fallback).not.toContain(["R", "ibbi"].join(""));
  });

  it("展示层在 task 没有 presentation caption 时会补自然收尾", () => {
    expect(
      buildImageWorkbenchCaption({
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        status: "complete",
        imageCount: 1,
      }),
    ).toContain("搞定");

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
        prompt_intent: "广州塔，从花城汇看过去的春天的照片",
        avoid_fixed_templates: true,
      },
      completion_caption_request: {
        source: "model_generated_at_tool_call",
        mode: "generate",
        prompt_intent: "广州塔，从花城汇看过去的春天的照片",
        avoid_fixed_templates: true,
      },
    });
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

  it("失败与取消安全文案资源应覆盖全部当前语言", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const agent = limeI18nResources[locale]?.agent || {};
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.failedDefault",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.cancelled",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.subjectFallback",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.intro.generate",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.intro.generate.withModel",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.complete",
      );
      expect(agent).toHaveProperty(
        "agentChat.imageWorkbenchPresentation.caption.partial",
      );
    }
  });
});
