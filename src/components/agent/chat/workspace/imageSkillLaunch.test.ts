import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { resolveImageWorkbenchSkillRequest } from "./imageSkillLaunch";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("resolveImageWorkbenchSkillRequest", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("@Nanobanana Pro 应覆盖当前图片工作台模型选择", () => {
    const rawText =
      "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchSkillRequest({
      rawText,
      parsedCommand: parsedCommand!,
      images: [],
      currentImageWorkbenchState: createInitialSessionImageWorkbenchState(),
      imageWorkbenchSelectedProviderId: "openai",
      imageWorkbenchSelectedModelId: "gpt-image-2",
      imageWorkbenchSelectedSize: "1024x1024",
      imageWorkbenchSessionKey: "session-image-1",
      projectId: "project-image-1",
      projectRootPath: "/workspace/project-image-1",
      contentId: "content-image-1",
    });

    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        mode: "generate",
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        raw_text: rawText,
        provider_id: "fal",
        model: "fal-ai/nano-banana-pro",
        persona_context: {
          version: "lime-image-persona-v1",
          persona_id: "lime_image_creator",
        },
        presentation: {
          version: "lime-image-chat-v1",
          assistant_intro:
            "好啊，用 Nanobanana Pro 生成：一张广州塔，从花城汇看过去的春天的照片\n先获取下工具参数\n马上生成",
          completion_caption:
            "搞定，图已经生成好了\n要调整的话直接说，我继续改",
        },
        taste_context: {
          version: "lime-image-taste-v1",
          source: "taste_layer",
          memory_sources: ["explicit_prompt"],
        },
      },
    });
    expect(JSON.stringify(skillRequest?.requestContext)).not.toMatch(
      new RegExp(["ri", "bbi"].join(""), "i"),
    );
  });
});
