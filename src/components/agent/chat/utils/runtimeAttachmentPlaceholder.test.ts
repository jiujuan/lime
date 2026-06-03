import { describe, expect, it } from "vitest";

import {
  containsRuntimeAttachmentPlaceholder,
  isOnlyRuntimeAttachmentPlaceholderText,
  replaceRuntimeAttachmentPlaceholders,
  resolveRuntimeAttachmentTaskDisplayName,
} from "./runtimeAttachmentPlaceholder";

describe("runtimeAttachmentPlaceholder", () => {
  it("应把 legacy 图片 chip 识别为运行时附件占位，而不是展示层事实源", () => {
    expect(containsRuntimeAttachmentPlaceholder("[Image #1]")).toBe(true);
    expect(containsRuntimeAttachmentPlaceholder("参考 Image #2 继续处理")).toBe(
      true,
    );
    expect(containsRuntimeAttachmentPlaceholder("Image archive #2")).toBe(false);
  });

  it("应判断文本是否只包含运行时附件占位", () => {
    expect(
      isOnlyRuntimeAttachmentPlaceholderText("[Image #1], Image #2"),
    ).toBe(true);
    expect(isOnlyRuntimeAttachmentPlaceholderText("[Image #1] 请分析")).toBe(
      false,
    );
  });

  it("应通过统一替换函数隐藏内部占位符协议", () => {
    expect(
      replaceRuntimeAttachmentPlaceholders(
        "已收到 [Image #1] 和 Image #2",
        ({ index }) => `附件${index}`,
      ),
    ).toBe("已收到  附件1  和 附件2");
  });

  it("应把纯运行时附件任务标签转成可读名称", () => {
    expect(resolveRuntimeAttachmentTaskDisplayName("[Image #3]")).toBe(
      "图片任务 3",
    );
    expect(resolveRuntimeAttachmentTaskDisplayName("生成封面")).toBe("生成封面");
    expect(resolveRuntimeAttachmentTaskDisplayName("  ")).toBeNull();
  });
});
