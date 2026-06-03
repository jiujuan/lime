import { describe, expect, it } from "vitest";

import {
  containsInternalImagePlaceholder,
  isOnlyInternalImagePlaceholderText,
  replaceInternalImagePlaceholders,
  resolveInternalImageTaskDisplayName,
} from "./internalImagePlaceholder";

describe("internalImagePlaceholder compat", () => {
  it("应识别方括号和裸文本图片占位", () => {
    expect(containsInternalImagePlaceholder("[Image #1]")).toBe(true);
    expect(containsInternalImagePlaceholder("参考 Image #2 继续处理")).toBe(
      true,
    );
    expect(containsInternalImagePlaceholder("Image archive #2")).toBe(false);
  });

  it("应判断文本是否只有内部图片占位", () => {
    expect(isOnlyInternalImagePlaceholderText("[Image #1], Image #2")).toBe(
      true,
    );
    expect(isOnlyInternalImagePlaceholderText("[Image #1] 请分析")).toBe(false);
  });

  it("应把内部图片占位替换成展示文案", () => {
    expect(
      replaceInternalImagePlaceholders("已收到 [Image #1] 和 Image #2", "图片"),
    ).toBe("已收到  图片  和 图片");
  });

  it("应把纯图片任务标签转成可读名称", () => {
    expect(resolveInternalImageTaskDisplayName("[Image #3]")).toBe("图片任务 3");
    expect(resolveInternalImageTaskDisplayName("生成封面")).toBe("生成封面");
    expect(resolveInternalImageTaskDisplayName("  ")).toBeNull();
  });
});
