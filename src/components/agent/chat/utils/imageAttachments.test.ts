import { describe, expect, it } from "vitest";

import {
  getClipboardImageCandidates,
  MAX_IMAGE_ATTACHMENT_BYTES,
  readImageAttachment,
  readMessageImageFromDataUrl,
} from "./imageAttachments";

describe("imageAttachments", () => {
  it("应只接受多模态主链支持的图片格式", () => {
    const png = new File(["image"], "screen.png", { type: "image/png" });
    const svg = new File(["<svg />"], "icon.svg", { type: "image/svg+xml" });

    const candidates = getClipboardImageCandidates({
      items: [],
      files: [png, svg],
    } as unknown as DataTransfer);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.mediaType).toBe("image/png");
  });

  it("读取 data URL 时应拒绝超过单图上限的图片", () => {
    const tooLargePayload = "a".repeat(
      Math.ceil(((MAX_IMAGE_ATTACHMENT_BYTES + 1) * 4) / 3),
    );

    expect(() =>
      readMessageImageFromDataUrl(`data:image/png;base64,${tooLargePayload}`),
    ).toThrow("image_too_large");
  });

  it("读取文件前应拒绝超过单图上限的图片", async () => {
    const file = new File(
      [new Uint8Array(MAX_IMAGE_ATTACHMENT_BYTES + 1)],
      "large.png",
      { type: "image/png" },
    );

    await expect(readImageAttachment(file)).rejects.toThrow("image_too_large");
  });
});
