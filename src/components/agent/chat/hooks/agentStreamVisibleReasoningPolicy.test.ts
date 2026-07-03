import { describe, expect, it } from "vitest";
import { shouldSurfaceReasoningEventAsVisibleProcess } from "./agentStreamVisibleReasoningPolicy";

describe("agentStreamVisibleReasoningPolicy", () => {
  it("后端明确标记 visible process summary 时应外显", () => {
    expect(
      shouldSurfaceReasoningEventAsVisibleProcess({
        type: "reasoning_delta",
        text: "先确认画面主体。",
        providerMetadata: {
          presentation: "visible_process_summary",
        },
      }),
    ).toBe(true);
  });

  it("图片命令 presentation reasoning 应作为可见引导保留", () => {
    expect(
      shouldSurfaceReasoningEventAsVisibleProcess({
        type: "reasoning_delta",
        reasoningId: "turn-1:image-presentation:planning",
        text: "先确认城市午后的光线。",
      }),
    ).toBe(true);
  });

  it("普通 reasoning 不应绕过全局 thinking 开关", () => {
    expect(
      shouldSurfaceReasoningEventAsVisibleProcess({
        type: "reasoning_delta",
        reasoningId: "turn-1:reasoning:planning",
        text: "普通内部推理。",
      }),
    ).toBe(false);
  });
});
