import { describe, expect, it, vi } from "vitest";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { resolveImageWorkbenchSkillRequest } from "./imageSkillLaunch";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("resolveImageWorkbenchSkillRequest", () => {
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
      },
    });
  });
});
