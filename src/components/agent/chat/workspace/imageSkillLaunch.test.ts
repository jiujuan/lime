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
        entry_source: "at_image_command",
        modality_contract_key: "image_generation",
        modality: "image",
        required_capabilities: expect.arrayContaining(["image_generation"]),
        routing_slot: "image_generation_model",
        runtime_contract: expect.objectContaining({
          contract_key: "image_generation",
          routing_slot: "image_generation_model",
          executor_binding: expect.objectContaining({
            executor_kind: "skill",
            binding_key: "image_generate",
          }),
        }),
        persona_context: {
          version: "lime-image-persona-v1",
          persona_id: "lime_image_creator",
        },
        presentation: {
          version: "lime-image-chat-v1",
          opening_guidance: {
            source: "model_stream",
            avoid_fixed_templates: true,
            avoid_visible_process_lines: true,
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
        },
        taste_context: {
          version: "lime-image-taste-v1",
          source: "taste_layer",
          memory_sources: ["explicit_prompt"],
        },
      },
    });
    const serializedContext = JSON.stringify(skillRequest?.requestContext);
    expect(serializedContext).not.toContain("先获取下工具参数");
    expect(serializedContext).not.toContain("马上生成");
    expect(serializedContext).not.toMatch(
      new RegExp(["ri", "bbi"].join(""), "i"),
    );
  });
});
