import { describe, expect, it } from "vitest";

import {
  isToolResultSuccessful,
  normalizeIncomingToolResult,
  normalizeToolResultImages,
} from "./agentChatToolResult";

describe("agentChatToolResult", () => {
  it("reported_success 为 true 时应覆盖非零 exit_code", () => {
    expect(
      isToolResultSuccessful({
        success: true,
        metadata: {
          exit_code: 1,
          reported_success: true,
        },
      }),
    ).toBe(true);
  });

  it("reported_success 为 false 时应优先判定失败", () => {
    expect(
      isToolResultSuccessful({
        success: true,
        metadata: {
          exit_code: 0,
          reported_success: false,
        },
      }),
    ).toBe(false);
  });

  it("应从 model-visible metadata 中归一化图片结果", () => {
    expect(
      normalizeToolResultImages(undefined, "", {
        model_visible_image: true,
        image_url: "data:image/png;base64,aW1hZ2U=",
        mime_type: "image/png",
      }),
    ).toEqual([
      {
        src: "data:image/png;base64,aW1hZ2U=",
        mimeType: "image/png",
        origin: "tool_payload",
      },
    ]);
  });

  it("归一化 incoming tool result 时应保留 metadata 图片预览", () => {
    const result = normalizeIncomingToolResult({
      success: true,
      output: "Viewed image: sample.png",
      metadata: {
        model_visible_image: true,
        image_url: "data:image/png;base64,c2FtcGxl",
        mime_type: "image/png",
      },
    });

    expect(result?.images).toEqual([
      {
        src: "data:image/png;base64,c2FtcGxl",
        mimeType: "image/png",
        origin: "tool_payload",
      },
    ]);
    expect(result?.output).not.toContain("base64");
  });
});
