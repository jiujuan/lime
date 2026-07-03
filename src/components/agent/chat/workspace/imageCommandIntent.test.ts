import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { resolveImageWorkbenchCommandRequest } from "./imageCommandIntent";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("resolveImageWorkbenchCommandRequest", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("@Nanobanana Pro 应覆盖当前图片工作台模型选择", () => {
    const rawText =
      "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchCommandRequest({
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
        project_root_path: "/workspace/project-image-1",
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        raw_text: rawText,
        provider_id: "fal",
        model: "fal-ai/nano-banana-pro",
        executor_mode: "images_api",
        entry_source: "at_image_command",
        modality_contract_key: "image_generation",
        modality: "image",
        required_capabilities: expect.arrayContaining(["image_generation"]),
        routing_slot: "image_generation_model",
        runtime_contract: expect.objectContaining({
          contract_key: "image_generation",
          routing_slot: "image_generation_model",
          executor_binding: expect.objectContaining({
            executor_kind: "workflow",
            binding_key: "image_command",
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
            prompt_intent: "广州塔，从花城汇看过去的春天的照片",
            avoid_fixed_templates: true,
          },
          completion_caption_request: {
            source: "model_generated_at_tool_call",
            mode: "generate",
            prompt_intent: "广州塔，从花城汇看过去的春天的照片",
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

  it("普通 @配图 不应携带图片工作台旧选择，交由后端图片默认模型补齐", () => {
    const rawText = "@配图 画一张广州夏天的图";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchCommandRequest({
      rawText,
      parsedCommand: parsedCommand!,
      images: [],
      currentImageWorkbenchState: createInitialSessionImageWorkbenchState(),
      imageWorkbenchSelectedProviderId: "lime-hub",
      imageWorkbenchSelectedModelId: "gpt-image-1",
      imageWorkbenchSelectedSize: "1024x1024",
      imageWorkbenchSessionKey: "session-image-1",
      projectId: "project-image-1",
      projectRootPath: "/workspace/project-image-1",
      contentId: "content-image-1",
    });

    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        prompt: "画一张广州夏天的图",
      },
    });
    const imageTask = skillRequest?.requestContext["image_task"] as Record<
      string,
      unknown
    >;
    expect(imageTask).not.toHaveProperty("provider_id");
    expect(imageTask).not.toHaveProperty("model");
    expect(imageTask).not.toHaveProperty("executor_mode");
    expect(JSON.stringify(skillRequest?.requestContext)).not.toContain(
      "gpt-image-1",
    );
    expect(JSON.stringify(skillRequest?.requestContext)).not.toContain(
      "lime-hub",
    );
  });

  it("显式图片模型命令仍应携带目录声明的 provider/model 路由", () => {
    const rawText =
      "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchCommandRequest({
      rawText,
      parsedCommand: parsedCommand!,
      images: [],
      currentImageWorkbenchState: createInitialSessionImageWorkbenchState(),
      imageWorkbenchSelectedProviderId: "lime-hub",
      imageWorkbenchSelectedModelId: "gpt-image-1",
      imageWorkbenchSelectedSize: "1024x1024",
      imageWorkbenchSessionKey: "session-image-1",
      projectId: "project-image-1",
      projectRootPath: "/workspace/project-image-1",
      contentId: "content-image-1",
    });

    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        provider_id: "fal",
        model: "fal-ai/nano-banana-pro",
        executor_mode: "images_api",
      },
    });
  });

  it("current image_command_intent 应携带项目根，避免后端退到进程 cwd", () => {
    const rawText = "@配图 画一张广州夏天的图";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchCommandRequest({
      rawText,
      parsedCommand: parsedCommand!,
      images: [],
      currentImageWorkbenchState: createInitialSessionImageWorkbenchState(),
      imageWorkbenchSelectedProviderId: "openai",
      imageWorkbenchSelectedModelId: "gpt-image-2",
      imageWorkbenchSelectedSize: "1024x1024",
      imageWorkbenchSessionKey: "session-image-1",
      projectId: "project-image-1",
      projectRootPath: " /workspace/project-image-1 ",
      contentId: "content-image-1",
    });

    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        project_root_path: "/workspace/project-image-1",
        project_id: "project-image-1",
      },
    });
  });

  it("文稿 inline 配图应保留既有配图位和锚点上下文", () => {
    const rawText = "@配图 生成 桌面端内容工厂写作流程图，中文标签";
    const parsedCommand = parseImageWorkbenchCommand(rawText);

    const skillRequest = resolveImageWorkbenchCommandRequest({
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
      applyTarget: {
        kind: "canvas-insert",
        canvasType: "document",
        anchorHint: "section_end",
        slotId: "hero",
        sectionTitle: "开场",
        anchorText: "首图",
        actionLabel: "插入文稿",
        dispatchLabel: "已切回文稿，正在插入图片",
      },
    });

    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        usage: "document-inline",
        slot_id: "hero",
        anchor_hint: "section_end",
        anchor_section_title: "开场",
        anchor_text: "首图",
        requested_target: "generate",
      },
    });
  });
});
