import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSkillCatalogCache,
  upsertLocalModelBoundImageCommandBinding,
} from "@/lib/api/skillCatalog";
import { parseImageWorkbenchCommand } from "./imageWorkbenchCommand";
import { buildMentionCommandReplayText } from "./mentionCommandReplayText";

describe("buildMentionCommandReplayText local image commands", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    clearSkillCatalogCache();
  });

  it("应把 @Nano Banana 2 回放成 image_generate 同构参数", () => {
    upsertLocalModelBoundImageCommandBinding({
      trigger: "@Nano Banana 2",
      providerId: "fal",
      modelId: "fal-ai/nano-banana-2",
      executorMode: "images_api",
    });
    const parsedCommand = parseImageWorkbenchCommand(
      "@Nano Banana 2 生成一张广州塔，从花城汇看过去的春天的照片",
    );

    expect(
      buildMentionCommandReplayText({
        commandKey: "image_model_nano_banana_2",
        parsedCommand: parsedCommand!,
      }),
    ).toBe("一张广州塔，从花城汇看过去的春天的照片");
  });
});
