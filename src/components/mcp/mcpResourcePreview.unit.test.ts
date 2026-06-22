import { describe, expect, it } from "vitest";
import {
  buildMcpResourcePreview,
  MCP_RESOURCE_TEXT_PREVIEW_CHAR_LIMIT,
} from "./mcpResourcePreview";

describe("buildMcpResourcePreview", () => {
  it("截断超长文本并保留隐藏字符数量", () => {
    const text =
      "A".repeat(MCP_RESOURCE_TEXT_PREVIEW_CHAR_LIMIT) + "TAIL_CONTENT";

    const preview = buildMcpResourcePreview({
      uri: "file://demo/large.txt",
      mime_type: "text/plain",
      text,
    });

    expect(preview.kind).toBe("text");
    if (preview.kind !== "text") {
      return;
    }
    expect(preview.text).toHaveLength(MCP_RESOURCE_TEXT_PREVIEW_CHAR_LIMIT);
    expect(preview.text).not.toContain("TAIL_CONTENT");
    expect(preview.truncated).toBe(true);
    expect(preview.hiddenChars).toBe("TAIL_CONTENT".length);
    expect(preview.totalChars).toBe(text.length);
  });

  it("按 MIME 类型区分图像和普通二进制摘要", () => {
    const imagePreview = buildMcpResourcePreview({
      uri: "file://demo/logo.png",
      mime_type: "image/png",
      blob: "aGVsbG8=",
    });
    const blobPreview = buildMcpResourcePreview({
      uri: "file://demo/archive.bin",
      mime_type: "application/octet-stream",
      blob: "aGVsbG8=",
    });

    expect(imagePreview.kind).toBe("image");
    expect(blobPreview.kind).toBe("blob");
    if (imagePreview.kind === "image") {
      expect(imagePreview.byteCount).toBe(5);
      expect(imagePreview.encodedLength).toBe("aGVsbG8=".length);
    }
    if (blobPreview.kind === "blob") {
      expect(blobPreview.byteCount).toBe(5);
      expect(blobPreview.encodedLength).toBe("aGVsbG8=".length);
    }
  });
});
