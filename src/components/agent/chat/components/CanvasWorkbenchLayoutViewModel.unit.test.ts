import { describe, expect, it } from "vitest";
import type { DirectoryListing } from "@/lib/api/fileBrowser";
import type { Artifact } from "@/lib/artifact/types";
import {
  buildEntries,
  findChangeItemForSelection,
  isSavedContentBundleDirectory,
  isHtmlPreviewContext,
  isPendingChangeItem,
  normalizeCanvasWorkbenchPath,
  resolveChangeItemDisplayName,
  resolveChangeStatusClassName,
  resolveChangeStatusCopyKey,
  resolveCodingPreviewTabLabel,
  resolvePreviewContent,
  resolvePreviewPath,
  resolveSelectionContext,
  resolveSavedContentBundleRoot,
  resolveWorkspacePanelDisplayPath,
  resolveWorkspaceRelativeDisplayPath,
  resolveWorkspaceRelativePath,
  sortWorkspaceListingEntries,
  type CanvasWorkbenchTaskFile,
  type CanvasWorkbenchCopy,
} from "./CanvasWorkbenchLayoutViewModel";

function entry(
  name: string,
  isDir = false,
): DirectoryListing["entries"][number] {
  return {
    name,
    path: `/workspace/${name}`,
    isDir,
    size: 0,
    modifiedAt: 0,
  };
}

function createArtifact(
  id: string,
  filePath: string,
  content: string,
  updatedAt: number,
): Artifact {
  return {
    id,
    type: artifactDocType,
    title: filePath.split("/").pop() || filePath,
    content,
    status: "complete",
    meta: {
      filePath,
      filename: filePath.split("/").pop() || filePath,
      previewText: content,
    },
    position: { start: 0, end: content.length },
    createdAt: updatedAt - 100,
    updatedAt,
  };
}

function createTaskFile(
  id: string,
  name: string,
  content: string,
  updatedAt: number,
): CanvasWorkbenchTaskFile {
  return {
    id,
    name,
    type: taskDocType,
    content,
    version: 1,
    createdAt: updatedAt - 100,
    updatedAt,
  };
}

const copy: CanvasWorkbenchCopy = {
  kind: {
    artifact: "产物",
    currentDraft: "当前文稿",
    currentVersion: "当前",
    defaultDraft: "主稿",
    taskDocument: "文档",
    taskFile: "任务文件",
    version: "版本",
    versionTitle: (count) => `文稿版本 ${count}`,
    workspaceFile: "文件",
  },
  tab: {
    files: "文件",
    generated: "生成",
    tasks: "任务",
    sessionMain: "结果",
  },
  workspaceFile: {
    binaryUnsupported: "二进制文件暂不支持预览",
    readFailed: "读取文件失败",
  },
};

const artifactDocType = ["doc", "ument"].join("") as Artifact["type"];
const taskDocType = ["doc", "ument"].join("") as CanvasWorkbenchTaskFile["type"];

describe("CanvasWorkbenchLayoutViewModel", () => {
  it("应归一化 macOS 与 Windows 路径分隔符", () => {
    expect(normalizeCanvasWorkbenchPath("/workspace/src/index.md")).toBe(
      "/workspace/src/index.md",
    );
    expect(normalizeCanvasWorkbenchPath("C:\\workspace\\src\\index.md")).toBe(
      "C:/workspace/src/index.md",
    );
  });

  it("应把 workspace 内路径转成展示用相对路径", () => {
    expect(
      resolveWorkspaceRelativeDisplayPath(
        "/workspace",
        "/workspace/src/index.md",
      ),
    ).toBe("src/index.md");
    expect(
      resolveWorkspaceRelativeDisplayPath("/workspace", "/workspace"),
    ).toBe("workspace");
    expect(
      resolveWorkspaceRelativeDisplayPath(null, "src\\index.md"),
    ).toBe("src/index.md");
  });

  it("应把 workspace 内路径转成命令用相对路径，并拒绝外部绝对路径", () => {
    expect(resolveWorkspaceRelativePath("/workspace", "/workspace")).toBe("");
    expect(
      resolveWorkspaceRelativePath("/workspace", "/workspace/src/index.md"),
    ).toBe("src/index.md");
    expect(resolveWorkspaceRelativePath("/workspace", "src/index.md")).toBe(
      "src/index.md",
    );
    expect(
      resolveWorkspaceRelativePath("/workspace", "/tmp/outside.md"),
    ).toBeNull();
    expect(
      resolveWorkspaceRelativePath(
        "C:\\workspace",
        "C:\\workspace\\src\\index.md",
      ),
    ).toBe("src/index.md");
    expect(
      resolveWorkspaceRelativePath("C:\\workspace", "D:\\tmp\\outside.md"),
    ).toBeNull();
  });

  it("应识别已保存内容包根路径", () => {
    expect(
      resolveSavedContentBundleRoot(
        "/workspace",
        "/workspace/exports/x-article-export/latest/index.md",
      ),
    ).toBe("/workspace/exports/x-article-export/latest");
    expect(
      resolveSavedContentBundleRoot(
        "C:\\workspace",
        "C:\\workspace\\exports\\x-article-export\\latest\\index.md",
      ),
    ).toBe("C:\\workspace/exports/x-article-export/latest");
    expect(
      resolveSavedContentBundleRoot("/workspace", "/workspace/src/index.md"),
    ).toBeNull();
  });

  it("应为工作区面板根路径生成稳定展示路径", () => {
    expect(resolveWorkspacePanelDisplayPath("/workspace", "/workspace")).toBe(
      "/workspace",
    );
    expect(
      resolveWorkspacePanelDisplayPath(
        "/workspace",
        "/workspace/exports/x-article-export/latest",
      ),
    ).toBe("exports/x-article-export/latest");
    expect(resolveWorkspacePanelDisplayPath("/workspace", null)).toBeUndefined();
  });

  it("应识别内容包目录及其子目录", () => {
    expect(
      isSavedContentBundleDirectory(
        "/workspace",
        "/workspace/exports/x-article-export/latest",
      ),
    ).toBe(true);
    expect(
      isSavedContentBundleDirectory(
        "/workspace",
        "/workspace/exports/x-article-export/latest/images",
      ),
    ).toBe(true);
    expect(
      isSavedContentBundleDirectory("/workspace", "/workspace/exports"),
    ).toBe(false);
  });

  it("应按内容包语义排序目录项", () => {
    const sorted = sortWorkspaceListingEntries(
      [
        entry("manifest.json"),
        entry("cover.png"),
        entry("notes.txt"),
        entry("chapter.md"),
        entry("z-dir", true),
        entry("images", true),
        entry("skills", true),
        entry("Agents.md"),
        entry("index.md"),
        entry("assets", true),
      ],
      "/workspace/exports/x-article-export/latest",
      "/workspace",
    ).map((item) => item.name);

    expect(sorted).toEqual([
      "index.md",
      "Agents.md",
      "skills",
      "assets",
      "images",
      "z-dir",
      "chapter.md",
      "cover.png",
      "notes.txt",
      "manifest.json",
    ]);
  });

  it("普通目录应保持目录、Markdown、其他文件的扫描顺序", () => {
    const sorted = sortWorkspaceListingEntries(
      [
        entry("readme-10.md"),
        entry("image.png"),
        entry("src", true),
        entry("readme-2.md"),
        entry("docs", true),
      ],
      "/workspace",
      "/workspace",
    ).map((item) => item.name);

    expect(sorted).toEqual([
      "docs",
      "src",
      "readme-2.md",
      "readme-10.md",
      "image.png",
    ]);
  });

  it("应从 preview target 解析内容和可操作路径", () => {
    expect(
      resolvePreviewContent({
        kind: "default-canvas",
        title: "index.md",
        content: "# 正文",
        filePath: "index.md",
      }),
    ).toBe("# 正文");
    expect(
      resolvePreviewContent({
        kind: "synthetic-artifact",
        title: "draft.md",
        artifact: createArtifact("version-1", "draft.md", "# 版本正文", 10),
        filePath: "draft.md",
      }),
    ).toBe("# 版本正文");
    expect(
      resolvePreviewContent({
        kind: "loading",
        title: "draft.md",
        filePath: "draft.md",
      }),
    ).toBe("");
    expect(
      resolvePreviewPath({
        kind: "default-canvas",
        title: "draft.md",
        content: "",
        filePath: "draft.md",
        absolutePath: "/workspace/draft.md",
      }),
    ).toBe("/workspace/draft.md");
  });

  it("应识别 HTML 预览上下文并生成 coding 预览标签", () => {
    expect(
      isHtmlPreviewContext({
        title: "index.html",
        target: { kind: "empty", title: "empty" },
      }),
    ).toBe(true);
    expect(
      isHtmlPreviewContext({
        title: "index.md",
        selectionPath: "dist/app.htm",
        target: { kind: "empty", title: "empty" },
      }),
    ).toBe(true);
    expect(
      isHtmlPreviewContext({
        title: "index.md",
        target: { kind: "empty", title: "empty" },
      }),
    ).toBe(false);
    expect(
      resolveCodingPreviewTabLabel(
        {
          title: "index.html",
          tabLabel: "主页",
          target: { kind: "empty", title: "empty" },
        },
        "预览",
      ),
    ).toBe("预览 · 主页");
    expect(resolveCodingPreviewTabLabel(null, "预览")).toBe("预览");
  });

  it("应按 selection path / target path / 标题匹配变更项", () => {
    const items = [
      {
        id: "a",
        path: "src/app.ts",
        absolutePath: "/workspace/src/app.ts",
        status: "completed" as const,
      },
      {
        id: "b",
        path: "README.md",
        displayName: "README.md",
        status: "in_progress" as const,
      },
    ];

    expect(
      findChangeItemForSelection(items, {
        title: "App",
        selectionPath: "/workspace/SRC/APP.ts",
        target: { kind: "empty", title: "empty" },
      })?.id,
    ).toBe("a");
    expect(
      findChangeItemForSelection(items, {
        title: "README.md",
        target: { kind: "empty", title: "empty" },
      })?.id,
    ).toBe("b");
    expect(findChangeItemForSelection(items, null)).toBeNull();
  });

  it("应推导变更项展示名、pending 状态和状态样式", () => {
    expect(
      resolveChangeItemDisplayName({
        path: "/workspace/src/app.ts",
        displayName: "  ",
      }),
    ).toBe("app.ts");
    expect(isPendingChangeItem({ path: "src/app.ts", status: "in_progress" }))
      .toBe(true);
    expect(resolveChangeStatusCopyKey({ path: "src/app.ts", status: "failed" }))
      .toBe("agentChat.canvasWorkbench.coding.changes.status.failed");
    expect(
      resolveChangeStatusClassName({
        path: "src/app.ts",
        status: "completed",
      }),
    ).toContain("emerald");
    expect(resolveChangeStatusClassName({ path: "src/app.ts" })).toContain(
      "slate",
    );
  });

  it("应构造去重后的产物、任务文件 entry 列表", () => {
    const entries = buildEntries(
      [
        createArtifact("artifact-old", "draft.md", "上一版", 10),
        createArtifact("artifact-dup", "current.md", "应被任务文件覆盖", 20),
        createArtifact("artifact-new", "outline.md", "产物内容", 30),
      ],
      null,
      [
        createTaskFile("task-current", "current.md", "当前主稿", 40),
        createTaskFile("task-latest", "latest.md", "最新任务文件", 50),
      ],
      copy,
      "/workspace",
    );

    expect(entries.map((item) => item.key)).toEqual([
      "artifact:artifact-new",
      "artifact:artifact-old",
      "task:task-latest",
      "task:task-current",
    ]);
    expect(entries.find((item) => item.key === "task:task-current")).toMatchObject(
      {
        title: "current.md",
        absolutePath: "/workspace/current.md",
        badgeLabel: "文档",
        kindLabel: "任务文件",
      },
    );
  });

  it("应解析 default preview、workspace file 和 entry selection", () => {
    const artifact = createArtifact(
      "artifact-current",
      "draft.md",
      "当前产物",
      20,
    );
    const previousArtifact = createArtifact(
      "artifact-previous",
      "draft.md",
      "上一版产物",
      10,
    );
    const entries = buildEntries([previousArtifact, artifact], null, [], copy);
    const entryMap = new Map(entries.map((item) => [item.key, item]));

    expect(
      resolveSelectionContext({
        selectionKey: null,
        defaultPreview: {
          selectionKey: "default:draft.md",
          title: "draft.md",
          content: "主稿",
          filePath: "draft.md",
          absolutePath: "/workspace/draft.md",
          previousContent: "旧主稿",
        },
        entryMap,
        workspaceFileSelections: {},
        canvasState: null,
        artifacts: [previousArtifact, artifact],
        copy,
        workspaceRoot: "/workspace",
      }),
    ).toMatchObject({
      entrySource: "default-preview",
      title: "draft.md",
      content: "主稿",
      previousContent: "旧主稿",
      selectionPath: "/workspace/draft.md",
    });

    expect(
      resolveSelectionContext({
        selectionKey: "workspace-file:/workspace/src/app.ts",
        defaultPreview: null,
        entryMap,
        workspaceFileSelections: {
          "workspace-file:/workspace/src/app.ts": {
            path: "/workspace/src/app.ts",
            title: "app.ts",
            status: "ready",
            content: "export const app = true;",
          },
        },
        canvasState: null,
        artifacts: [],
        copy,
        workspaceRoot: "/workspace",
      }),
    ).toMatchObject({
      entrySource: "workspace-file",
      title: "app.ts",
      subtitle: "src/app.ts",
      content: "export const app = true;",
      previousContent: null,
    });

    const artifactSelection = resolveSelectionContext({
      selectionKey: "artifact:artifact-current",
      defaultPreview: null,
      entryMap,
      workspaceFileSelections: {},
      canvasState: null,
      artifacts: [previousArtifact, artifact],
      copy,
    });
    expect(artifactSelection).toMatchObject({
      entrySource: "artifact",
      title: "draft.md",
      content: "当前产物",
      previousContent: "上一版产物",
      selectionPath: "draft.md",
    });
  });
});
