import { beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale, limeI18nResources } from "@/i18n/createI18n";
import {
  buildImageTaskAssistantContent,
  buildImageTaskPresentationContext,
} from "../workspace/imageTaskPersona";
import {
  buildImageWorkbenchCaption,
  buildImageWorkbenchProcessLines,
} from "./imageWorkbenchPresentation";

describe("imageWorkbenchPresentation", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("图片生成人设层只清理命令标签，不重写用户语义", () => {
    expect(
      buildImageTaskAssistantContent({
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        mode: "generate",
        modelName: "fal-ai/nano-banana-pro",
      }),
    ).toBe(
      "好啊，用 Nanobanana Pro 生成：一张广州塔，从花城汇看过去的春天的照片\n先获取下工具参数\n马上生成",
    );

    const shanghaiIntro = buildImageTaskAssistantContent({
      prompt: "一张外滩，从陆家嘴看过去的夜景的照片",
      mode: "generate",
      modelName: "fal-ai/nano-banana-pro",
    });
    expect(shanghaiIntro).toContain("一张外滩，从陆家嘴看过去的夜景的照片");
    expect(shanghaiIntro).not.toContain("一张从陆家嘴看外滩的夜景照片");
  });

  it("展示层过程和完成描述只做本地化收口，不把品味或画面细节硬编码进聊天展示层", () => {
    expect(buildImageWorkbenchProcessLines()).toEqual([
      "先获取下工具参数",
      "马上生成",
    ]);
    expect(
      buildImageWorkbenchCaption({
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        status: "complete",
        imageCount: 1,
      }),
    ).toBe(
      "搞定，图已经生成好了\n要调整的话直接说，我继续改",
    );

    expect(
      buildImageTaskPresentationContext({
        prompt: "一张广州塔，从花城汇看过去的春天的照片",
        mode: "generate",
        modelId: "fal-ai/nano-banana-pro",
      }),
    ).toMatchObject({
      completion_caption:
        "搞定，图已经生成好了\n要调整的话直接说，我继续改",
      result_captions: {
        complete:
          "搞定，图已经生成好了\n要调整的话直接说，我继续改",
      },
    });
  });

  it("图片生成人设文案覆盖英文 locale 资源，不污染全局语言", () => {
    expect(
      limeI18nResources["en-US"]?.agent?.[
        "agentChat.imageTaskPersona.intro.generateWithModel"
      ],
    ).toBe("Sure — generating with {{model}}: {{target}}");
  });
});
