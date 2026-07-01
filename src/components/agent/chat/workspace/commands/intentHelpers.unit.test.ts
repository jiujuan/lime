import { describe, expect, it } from "vitest";
import { isLikelyPlainImageGenerationRequest } from "./intentHelpers";

describe("intentHelpers", () => {
  it("明确中文画图句式应命中图片生成请求", () => {
    expect(isLikelyPlainImageGenerationRequest("画一张广州夏天的图")).toBe(
      true,
    );
    expect(isLikelyPlainImageGenerationRequest("生成一张城市夜景插画")).toBe(
      true,
    );
  });

  it("否定或提示词类请求不应被当作图片生成", () => {
    expect(isLikelyPlainImageGenerationRequest("不要画图，先分析方案")).toBe(
      false,
    );
    expect(
      isLikelyPlainImageGenerationRequest("帮我写一段生成图片的提示词"),
    ).toBe(false);
    expect(isLikelyPlainImageGenerationRequest("@配图 画一张广州夏天的图")).toBe(
      false,
    );
  });
});
