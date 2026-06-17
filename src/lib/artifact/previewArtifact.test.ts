import { describe, expect, it, vi } from "vitest";
import {
  createPreviewArtifact,
  createPreviewArtifactFromFile,
  isPreviewArtifact,
} from "./previewArtifact";

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
}));

describe("previewArtifact", () => {
  it("应把 Markdown 文件投影为 source-backed document artifact", () => {
    const projection = createPreviewArtifactFromFile({
      filePath: "content-posts/report.md",
      content: "# 报告",
      now: 100,
    });

    expect(projection.contentKind).toBe("markdown");
    expect(projection.renderMode).toBe("canvas");
    expect(projection.artifact).toMatchObject({
      id: expect.stringMatching(/^preview-file-/),
      type: "document",
      title: "report.md",
      content: "# 报告",
      status: "complete",
      meta: expect.objectContaining({
        previewArtifact: true,
        isSourceBacked: true,
        source: "file",
        sourceRef: "content-posts/report.md",
        filePath: "content-posts/report.md",
        filename: "report.md",
        contentKind: "markdown",
        renderMode: "canvas",
        lifecycle: "transient",
      }),
    });
    expect(isPreviewArtifact(projection.artifact)).toBe(true);
  });

  it("应把 HTML 文件投影为支持独立窗口的 html artifact", () => {
    const projection = createPreviewArtifactFromFile({
      filePath: "/tmp/prototype.html",
      content: "<!doctype html><html></html>",
      now: 100,
    });

    expect(projection.artifact).toMatchObject({
      type: "html",
      meta: expect.objectContaining({
        contentKind: "html",
        renderMode: "external_window",
        sourcePath: "/tmp/prototype.html",
        capabilities: expect.objectContaining({
          externalWindow: true,
          systemOpen: true,
        }),
      }),
    });
  });

  it("应把 DOCX 文本抽取结果投影为 document_text", () => {
    const projection = createPreviewArtifactFromFile({
      filePath: "/tmp/谢晶_个人IP知识库v1.0_深澜智能.docx",
      content: "这是 DOCX 抽取文本",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      now: 100,
    });

    expect(projection.artifact).toMatchObject({
      type: "document",
      title: "谢晶_个人IP知识库v1.0_深澜智能.docx",
      content: "这是 DOCX 抽取文本",
      meta: expect.objectContaining({
        contentKind: "document",
        renderMode: "document_text",
      }),
    });
  });

  it("应把本地图片投影为可渲染文件 URL", () => {
    const projection = createPreviewArtifactFromFile({
      filePath: "/tmp/lime/images/hero.png",
      isBinary: true,
      mimeType: "image/png",
      now: 100,
    });

    expect(projection.artifact).toMatchObject({
      type: "document",
      content: "asset:///tmp/lime/images/hero.png",
      meta: expect.objectContaining({
        contentKind: "image",
        renderMode: "media",
        previewUrl: "asset:///tmp/lime/images/hero.png",
        capabilities: expect.objectContaining({
          preview: true,
          systemOpen: true,
        }),
      }),
    });
    expect(projection.artifact.content).not.toContain("<figure");
  });

  it("应支持消息附件传入显式预览 URL", () => {
    const projection = createPreviewArtifact({
      source: "session_file",
      sourceRef: "message-1:attachment:0",
      path: "message-1/attachment-1.png",
      isBinary: true,
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,aW1hZ2U=",
      now: 100,
    });

    expect(projection).toMatchObject({
      contentKind: "image",
      renderMode: "media",
      artifact: {
        content: "data:image/png;base64,aW1hZ2U=",
        meta: expect.objectContaining({
          source: "session_file",
          sourceRef: "message-1:attachment:0",
          renderMode: "media",
          previewUrl: "data:image/png;base64,aW1hZ2U=",
        }),
      },
    });
  });

  it("应保留二进制文件的系统打开能力，而不是丢弃预览对象", () => {
    const projection = createPreviewArtifact({
      source: "file",
      sourceRef: "/tmp/archive.zip",
      isBinary: true,
      now: 100,
    });

    expect(projection.artifact).toMatchObject({
      type: "document",
      status: "complete",
      meta: expect.objectContaining({
        contentKind: "binary",
        renderMode: "system_open",
        capabilities: expect.objectContaining({
          preview: false,
          systemOpen: true,
          reveal: true,
        }),
      }),
    });
    expect(projection.artifact.content).toContain("不支持在工作台内嵌预览");
  });
});
