import { describe, expect, it } from "vitest";

import {
  normalizeContentPostPlatform,
  parseContentPostPlatform,
  resolveContentPostPlatformLabel,
  resolveContentPostPlatformLaunchUrl,
  stripContentPostPromptDecorations,
} from "./contentPostPlatform";

describe("contentPostPlatform", () => {
  it("从同一平台定义归一化 alias、type、label 和启动 URL", () => {
    expect(normalizeContentPostPlatform("wechat_official_account")).toEqual({
      platformType: "wechat_official_account",
      platformLabel: "微信公众号后台",
    });
    expect(normalizeContentPostPlatform("Twitter / X")).toEqual({
      platformType: "x",
      platformLabel: "X / Twitter",
    });
    expect(resolveContentPostPlatformLabel("youtube")).toBe("YouTube");
    expect(resolveContentPostPlatformLaunchUrl("youtube")).toBe(
      "https://studio.youtube.com/",
    );
  });

  it("解析显式平台和前缀平台，并清理 prompt 装饰", () => {
    const explicit = parseContentPostPlatform(
      "平台:微信公众号后台 帮我整理成可直接发布的版本",
    );
    expect(explicit).toMatchObject({
      platformType: "wechat_official_account",
      platformLabel: "微信公众号后台",
      explicitPlatformText: "微信公众号后台",
    });
    expect(
      stripContentPostPromptDecorations(
        "平台:微信公众号后台 帮我整理成可直接发布的版本",
        explicit.explicitPlatformText,
      ),
    ).toBe("帮我整理成可直接发布的版本");

    const leading = parseContentPostPlatform(
      "xiaohongshu turn this draft into a ready-to-post version",
    );
    expect(leading).toMatchObject({
      platformType: "xiaohongshu",
      platformLabel: "小红书",
      leadingPlatformText: "xiaohongshu",
    });
  });

  it("默认不做 inline 平台识别，避免写文章误触发后台发布", () => {
    expect(parseContentPostPlatform("写一篇公众号文章")).toMatchObject({
      platformType: undefined,
      platformLabel: undefined,
    });
  });

  it("只在动作语境允许 inline 平台识别", () => {
    expect(
      parseContentPostPlatform("去微信公众号后台发布这篇文章", {
        includeInline: true,
      }),
    ).toMatchObject({
      platformType: "wechat_official_account",
      platformLabel: "微信公众号后台",
      inlinePlatformText: "微信公众号后台",
    });
  });
});
