import { describe, expect, it } from "vitest";
import {
  extractGeminiImageUrlFromPayload,
  extractImageBase64FromResponsesStreamEvent,
  extractImageUrlFromPayload,
  extractImageUrlFromText,
  normalizeImageUrl,
  wrapBase64AsDataUrl,
} from "./imageResponseParsers";

describe("imageResponseParsers", () => {
  it("应从文本和 JSON 负载中提取图片地址", () => {
    expect(extractImageUrlFromText("![result](/images/generated.png)")).toBe(
      "/images/generated.png",
    );

    expect(
      extractImageUrlFromPayload({
        output: [
          {
            content: [
              {
                image_url: {
                  url: "https://cdn.example.com/generated.png",
                },
              },
            ],
          },
        ],
      }),
    ).toBe("https://cdn.example.com/generated.png");
  });

  it("应归一化相对路径和 base64 图片", () => {
    expect(
      normalizeImageUrl(
        "https://provider.example.com/v1/images/generations",
        "images/result.png",
      ),
    ).toBe("https://provider.example.com/images/result.png");

    expect(wrapBase64AsDataUrl("a".repeat(128))).toBe(
      `data:image/png;base64,${"a".repeat(128)}`,
    );
  });

  it("应识别 Gemini 嵌套图片输出", () => {
    expect(
      extractGeminiImageUrlFromPayload({
        interaction: {
          steps: [
            {
              output_image: {
                data: "g".repeat(128),
              },
            },
          ],
        },
      }),
    ).toBe(`data:image/png;base64,${"g".repeat(128)}`);
  });

  it("应从 Responses SSE 图片事件中提取 base64", () => {
    const base64Image = "r".repeat(128);

    expect(
      extractImageBase64FromResponsesStreamEvent(
        [
          "event: response.output_item.done",
          `data: ${JSON.stringify({
            item: {
              type: "image_generation_call",
              result: base64Image,
            },
          })}`,
        ].join("\n"),
      ),
    ).toBe(base64Image);
  });
});
