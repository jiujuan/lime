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

  it("应把无文本抽取的 PDF / Excel / PPT 文档投影为系统打开 preview artifact", () => {
    const examples = [
      {
        filePath: "/tmp/research.pdf",
        mimeType: "application/pdf",
        filename: "research.pdf",
      },
      {
        filePath: "/tmp/budget.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "budget.xlsx",
      },
      {
        filePath: "/tmp/deck.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "deck.pptx",
      },
    ];

    for (const example of examples) {
      const projection = createPreviewArtifactFromFile({
        filePath: example.filePath,
        isBinary: true,
        mimeType: example.mimeType,
        now: 100,
      });

      expect(projection).toMatchObject({
        contentKind: "document",
        renderMode: "system_open",
        artifactType: "document",
        artifact: {
          title: example.filename,
          content: expect.stringContaining("暂不支持在工作台内嵌预览"),
          meta: expect.objectContaining({
            previewArtifact: true,
            isSourceBacked: true,
            source: "file",
            sourceRef: example.filePath,
            contentKind: "document",
            renderMode: "system_open",
            mimeType: example.mimeType,
            capabilities: expect.objectContaining({
              preview: false,
              systemOpen: true,
              reveal: true,
            }),
          }),
        },
      });
    }
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

  it("应把本地音视频投影为媒体 preview artifact", () => {
    const audio = createPreviewArtifactFromFile({
      filePath: "/tmp/audio/interview.wav",
      isBinary: true,
      mimeType: "audio/wav",
      now: 100,
    });
    const video = createPreviewArtifactFromFile({
      filePath: "/tmp/video/demo.mp4",
      isBinary: true,
      mimeType: "video/mp4",
      now: 100,
    });

    expect(audio).toMatchObject({
      contentKind: "audio",
      renderMode: "media",
      artifact: {
        content: "asset:///tmp/audio/interview.wav",
        meta: expect.objectContaining({
          contentKind: "audio",
          renderMode: "media",
          previewUrl: "asset:///tmp/audio/interview.wav",
        }),
      },
    });
    expect(video).toMatchObject({
      contentKind: "video",
      renderMode: "media",
      artifact: {
        content: "asset:///tmp/video/demo.mp4",
        meta: expect.objectContaining({
          contentKind: "video",
          renderMode: "media",
          previewUrl: "asset:///tmp/video/demo.mp4",
        }),
      },
    });
  });

  it("应支持 URL 与数据库记录作为 source-backed preview artifact", () => {
    const urlPreview = createPreviewArtifact({
      source: "url",
      sourceRef: "https://example.com/report",
      title: "在线报告",
      content: "# 在线报告",
      path: "https://example.com/report",
      now: 100,
    });
    const recordPreview = createPreviewArtifact({
      source: "database_record",
      sourceRef: "material:123",
      title: "素材记录",
      content: "素材摘要",
      path: "material:123",
      now: 100,
    });

    expect(urlPreview.artifact).toMatchObject({
      id: expect.stringMatching(/^preview-url-/),
      title: "在线报告",
      meta: expect.objectContaining({
        previewArtifact: true,
        isSourceBacked: true,
        source: "url",
        sourceRef: "https://example.com/report",
        contentKind: "markdown",
        renderMode: "inline",
        capabilities: expect.objectContaining({
          preview: true,
          edit: false,
          systemOpen: true,
        }),
      }),
    });
    expect(recordPreview.artifact).toMatchObject({
      id: expect.stringMatching(/^preview-database_record-/),
      title: "素材记录",
      meta: expect.objectContaining({
        previewArtifact: true,
        isSourceBacked: true,
        source: "database_record",
        sourceRef: "material:123",
        contentKind: "text",
        renderMode: "inline",
        capabilities: expect.objectContaining({
          preview: true,
          edit: false,
          systemOpen: false,
          reveal: false,
        }),
      }),
    });
  });

  it("应把应用入口投影为 app_shell 来源摘要，而不是普通文件预览", () => {
    const projection = createPreviewArtifact({
      source: "app",
      sourceRef: "agent-app:research",
      title: "研究工作台",
      content: "可继续整理来源和生成报告。",
      path: "agent-app:research",
      now: 100,
    });

    expect(projection).toMatchObject({
      contentKind: "app_shell",
      renderMode: "inline",
      artifactType: "document",
      artifact: {
        id: expect.stringMatching(/^preview-app-/),
        title: "研究工作台",
        content: "可继续整理来源和生成报告。",
        meta: expect.objectContaining({
          previewArtifact: true,
          isSourceBacked: true,
          source: "app",
          sourceRef: "agent-app:research",
          contentKind: "app_shell",
          renderMode: "inline",
          capabilities: expect.objectContaining({
            preview: true,
            edit: false,
            systemOpen: false,
            reveal: false,
          }),
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
