import { describe, expect, it } from "vitest";
import { resolveGeneralCanvasFileContentType } from "./workspaceFilePreview";

describe("resolveGeneralCanvasFileContentType", () => {
  it("HTML 文件应作为可预览网页处理", () => {
    expect(
      resolveGeneralCanvasFileContentType("prototype.html", "<!doctype html>"),
    ).toEqual({ contentType: "html", language: "html" });

    expect(
      resolveGeneralCanvasFileContentType("preview.htm", "<html></html>"),
    ).toEqual({ contentType: "html", language: "html" });
  });

  it("常规代码文件仍应作为源码处理", () => {
    expect(
      resolveGeneralCanvasFileContentType("app.js", "console.log(1);"),
    ).toEqual({
      contentType: "code",
      language: "javascript",
    });
  });

  it("Markdown 文件仍应作为文档预览处理", () => {
    expect(resolveGeneralCanvasFileContentType("README.md", "# 标题")).toEqual({
      contentType: "markdown",
    });
  });
});
