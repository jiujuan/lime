/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import type { TaskFile } from "./TaskFiles";
import {
  CanvasWorkbenchLayout,
  type CanvasWorkbenchPreviewTarget,
} from "./CanvasWorkbenchLayout";
import type { ArtifactWorkbenchDocumentController } from "../workspace/artifactWorkbenchDocument";

type MockResizeObserverCallback = (
  entries: Array<{
    target: Element;
    contentRect: {
      width: number;
      height: number;
    };
  }>,
  observer: unknown,
) => void;

const hoisted = vi.hoisted(
  () => ({
    mockListDirectory: vi.fn(),
    mockToast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    resizeObserverState: {
      width: 1280,
      observers: [] as Array<{
        callback: MockResizeObserverCallback;
        target: Element | null;
      }>,
    },
  }),
);

export const mockListDirectory = hoisted.mockListDirectory;
export const mockToast = hoisted.mockToast;
const resizeObserverState = hoisted.resizeObserverState;

vi.mock("sonner", () => ({
  toast: hoisted.mockToast,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "zh-CN",
    },
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "agentChat.canvasWorkbench.close": "关闭画布工作台",
        "agentChat.canvasWorkbench.kind.artifact": "产物",
        "agentChat.canvasWorkbench.kind.currentDraft": "当前文稿",
        "agentChat.canvasWorkbench.kind.currentVersion": "当前",
        "agentChat.canvasWorkbench.kind.defaultDraft": "主稿",
        "agentChat.canvasWorkbench.kind.taskDocument": "文档",
        "agentChat.canvasWorkbench.kind.taskFile": "任务文件",
        "agentChat.canvasWorkbench.kind.version": "版本",
        "agentChat.canvasWorkbench.kind.versionTitle": `文稿版本 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.kind.workspaceFile": "文件",
        "agentChat.canvasWorkbench.tabs.files": "文件",
        "agentChat.canvasWorkbench.tabs.generated": "生成",
        "agentChat.canvasWorkbench.tabs.tasks": "任务",
        "agentChat.canvasWorkbench.tabs.sessionMain": "结果",
        "agentChat.canvasWorkbench.tabs.switchAria": `切换画布标签-${String(
          options?.label ?? "",
        )}`,
        "agentChat.canvasWorkbench.tabs.closeFileAria": `关闭文件标签-${String(
          options?.label ?? "",
        )}`,
        "agentChat.canvasWorkbench.workspaceFile.binaryUnsupported":
          "该文件为二进制内容，暂不支持画布文本预览。",
        "agentChat.canvasWorkbench.workspaceFile.readFailed": "读取文件失败",
        "agentChat.canvasWorkbench.clipboard.unsupported":
          "当前环境不支持剪贴板写入",
        "agentChat.canvasWorkbench.clipboard.copied": "已复制路径",
        "agentChat.canvasWorkbench.clipboard.copyFailed": "复制路径失败",
        "agentChat.canvasWorkbench.workspace.loadFailed": `读取目录失败：${String(
          options?.message ?? "",
        )}`,
        "agentChat.canvasWorkbench.workspace.expandDirectoryAria": `展开目录-${String(
          options?.name ?? "",
        )}`,
        "agentChat.canvasWorkbench.workspace.collapseDirectoryAria": `折叠目录-${String(
          options?.name ?? "",
        )}`,
        "agentChat.canvasWorkbench.workspace.selectFileAria": `选择工作区文件-${String(
          options?.name ?? "",
        )}`,
        "agentChat.canvasWorkbench.workspace.unavailable":
          "当前工作区路径不可用，暂时无法浏览项目文件。",
        "agentChat.canvasWorkbench.workspace.empty":
          "当前会话没有绑定可浏览的工作区目录。",
        "agentChat.canvasWorkbench.workspace.resultDir": "结果目录",
        "agentChat.canvasWorkbench.workspace.projectDir": "项目目录",
        "agentChat.canvasWorkbench.workspace.loading": "正在加载目录...",
        "agentChat.canvasWorkbench.workspace.emptyDirectory": "暂无目录内容。",
        "agentChat.canvasWorkbench.team.empty": "当前没有可展示的生成结果。",
        "agentChat.fileManager.column.name": "名称",
        "agentChat.fileManager.column.modified": "修改日期",
        "agentChat.fileManager.column.size": "大小",
        "agentChat.canvasWorkbench.actions.copyPath": "复制路径",
        "agentChat.canvasWorkbench.actions.revealPath": "显示位置",
        "agentChat.canvasWorkbench.actions.openPath": "打开",
        "agentChat.canvasWorkbench.actions.download": "下载",
        "agentChat.canvasWorkbench.coding.tabs.preview": "预览",
        "agentChat.canvasWorkbench.coding.tabs.files": "文件",
        "agentChat.canvasWorkbench.coding.tabs.changes": "变更",
        "agentChat.canvasWorkbench.coding.tabs.outputs": "输出",
        "agentChat.canvasWorkbench.coding.tabs.logs": "日志",
        "agentChat.canvasWorkbench.coding.preview.htmlBadge": "HTML",
        "agentChat.canvasWorkbench.coding.preview.empty":
          "还没有可预览的编程结果。",
        "agentChat.canvasWorkbench.coding.preview.staticHtmlHint":
          "当前展示静态 HTML 预览。",
        "agentChat.canvasWorkbench.coding.preview.toolbar.refresh": "刷新预览",
        "agentChat.canvasWorkbench.coding.preview.toolbar.address": "预览地址",
        "agentChat.canvasWorkbench.coding.preview.toolbar.staticHtml":
          "静态 HTML",
        "agentChat.canvasWorkbench.coding.preview.toolbar.ready": "预览就绪",
        "agentChat.canvasWorkbench.coding.preview.toolbar.enterFullscreen":
          "全屏预览",
        "agentChat.canvasWorkbench.coding.preview.toolbar.exitFullscreen":
          "退出全屏",
        "agentChat.canvasWorkbench.coding.changes.empty":
          "还没有可对比的文件变更。",
        "agentChat.canvasWorkbench.coding.changes.noBaseline":
          "当前文件还没有上一版本可对比。",
        "agentChat.canvasWorkbench.coding.changes.title": "当前文件变更",
        "agentChat.canvasWorkbench.coding.changes.badge": `变更 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.coding.changes.queueTitle": "本轮文件变更",
        "agentChat.canvasWorkbench.coding.changes.queueSummary": `${String(
          options?.count ?? 0,
        )} 个文件，${String(options?.pending ?? 0)} 个仍在写入`,
        "agentChat.canvasWorkbench.coding.changes.checkpointBadge": `快照 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.coding.changes.source": `来源：${String(
          options?.source ?? "",
        )}`,
        "agentChat.canvasWorkbench.coding.changes.detailTitle": "当前文件",
        "agentChat.canvasWorkbench.coding.changes.latestCheckpoint": `最近快照：${String(
          options?.path ?? "",
        )}`,
        "agentChat.canvasWorkbench.coding.changes.noDiffBadge": "暂无 diff",
        "agentChat.canvasWorkbench.coding.changes.noDiff":
          "当前变更只有文件摘要，暂时没有上一版 diff。",
        "agentChat.canvasWorkbench.coding.changes.status.completed": "已写入",
        "agentChat.canvasWorkbench.coding.changes.status.inProgress": "写入中",
        "agentChat.canvasWorkbench.coding.changes.status.failed": "失败",
        "agentChat.canvasWorkbench.coding.outputs.empty":
          "本轮还没有可展示的输出。",
        "agentChat.canvasWorkbench.coding.logs.empty":
          "本轮还没有可展示的日志。",
        "agentChat.canvasWorkbench.documentInspector.title": "当前文稿",
        "agentChat.canvasWorkbench.documentInspector.summaryFallback":
          "当前结构化文稿已接入文档检查器，可继续查看概览、来源、版本与编辑状态。",
        "agentChat.canvasWorkbench.documentInspector.expand":
          "展开当前文稿检查器",
        "agentChat.canvasWorkbench.documentInspector.collapse":
          "折叠当前文稿检查器",
        "agentChat.canvasWorkbench.documentInspector.expandShort": "展开",
        "agentChat.canvasWorkbench.documentInspector.collapseShort": "收起",
        "agentChat.canvasWorkbench.documentInspector.sourceCount": `来源 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.documentInspector.versionCount": `版本 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.documentInspector.diffCount": `差异 ${String(
          options?.count ?? 0,
        )}`,
        "agentChat.canvasWorkbench.document.view.preview": "正文",
        "agentChat.canvasWorkbench.document.view.previewAria":
          "切换文档视图-正文",
        "agentChat.canvasWorkbench.document.view.changes": "变更",
        "agentChat.canvasWorkbench.document.view.changesAria":
          "切换文档视图-变更",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/lib/api/fileBrowser", () => ({
  listDirectory: hoisted.mockListDirectory,
}));

export interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
  rerender: (props: CanvasWorkbenchLayoutProps) => void;
}

export type CanvasWorkbenchLayoutProps = React.ComponentProps<
  typeof CanvasWorkbenchLayout
>;

const mountedRoots: MountedHarness[] = [];

export function createArtifact(
  id: string,
  filePath: string,
  content: string,
  updatedAt: number,
): Artifact {
  return {
    id,
    type: "document",
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

export function createTaskFile(
  id: string,
  name: string,
  content: string,
  updatedAt: number,
): TaskFile {
  return {
    id,
    name,
    type: "document",
    content,
    version: 1,
    createdAt: updatedAt - 100,
    updatedAt,
  };
}

export function createMockArtifactDocumentController(
  overrides: Partial<ArtifactWorkbenchDocumentController> = {},
): ArtifactWorkbenchDocumentController {
  const versionHistory = [
    {
      id: "artifact-document:demo:v1",
      artifactId: "artifact-document:demo",
      versionNo: 1,
      title: "董事会季度复盘",
      summary: "第一版摘要",
      status: "ready" as const,
      createdAt: "2026-03-25T10:00:00Z",
    },
    {
      id: "artifact-document:demo:v2",
      artifactId: "artifact-document:demo",
      versionNo: 2,
      title: "董事会季度复盘",
      summary: "补齐来源与版本信息",
      status: "ready" as const,
      createdAt: "2026-03-26T10:00:00Z",
    },
  ];
  const currentVersionDiff = {
    baseVersionId: "artifact-document:demo:v1",
    baseVersionNo: 1,
    targetVersionId: "artifact-document:demo:v2",
    targetVersionNo: 2,
    updatedCount: 1,
    addedCount: 0,
    removedCount: 0,
    movedCount: 0,
    changedBlocks: [
      {
        blockId: "body-1",
        changeType: "updated" as const,
        beforeText: "旧正文",
        afterText: "正文内容",
        summary: "更新 block 内容",
      },
    ],
  };
  const editableDraft = {
    editorKind: "rich_text" as const,
    markdown: "正文内容",
  };
  const selectedEditableBlock = {
    blockId: "body-1",
    label: "正文块 1",
    detail: "正文",
    editorKind: "rich_text" as const,
    draft: editableDraft,
  };
  const document: ArtifactDocumentV1 = {
    schemaVersion: "artifact_document.v1",
    artifactId: "artifact-document:demo",
    kind: "analysis" as const,
    title: "董事会季度复盘",
    status: "ready" as const,
    language: "zh-CN",
    summary: "需要优先补齐来源与版本线索。",
    blocks: [
      {
        id: "body-1",
        type: "rich_text" as const,
        contentFormat: "markdown" as const,
        content: "正文内容",
        markdown: "正文内容",
      },
    ],
    sources: [
      {
        id: "source-1",
        type: "web" as const,
        label: "OpenAI Blog",
        locator: {
          url: "https://openai.com",
        },
      },
    ],
    metadata: {
      currentVersionId: "artifact-document:demo:v2",
      currentVersionNo: 2,
      currentVersionDiff,
      versionHistory,
    },
  };

  return {
    artifact: createArtifact(
      "artifact-doc",
      ".lime/artifacts/thread-1/board-review.artifact.json",
      JSON.stringify(document),
      40,
    ),
    document,
    currentVersion: versionHistory[1],
    currentVersionDiff,
    versionHistory,
    sourceLinks: [
      {
        artifactId: "artifact-document:demo",
        blockId: "body-1",
        sourceId: "source-1",
        sourceType: "web",
        sourceRef: "https://openai.com",
        label: "OpenAI Blog",
      },
    ],
    timelineLinksByBlockId: {},
    recoveryPresentation: null,
    canEditDocument: true,
    canMarkAsReady: false,
    inspectorTab: "overview",
    setInspectorTab: vi.fn(),
    editableBlocks: [selectedEditableBlock],
    draftByBlockId: {
      "body-1": editableDraft,
    },
    selectedEditableBlock,
    selectedEditableDraft: editableDraft,
    selectedTimelineLink: null,
    isSavingEdit: false,
    isUpdatingRecoveryState: false,
    editSaveError: null,
    recoveryActionError: null,
    lastSavedAt: null,
    rendererViewportRef: { current: null },
    focusBlock: vi.fn(),
    selectEditableBlock: vi.fn(),
    handleEditDraftChange: vi.fn(),
    handleEditCancel: vi.fn(),
    handleEditSave: vi.fn(async () => undefined),
    handleContinueEditing: vi.fn(),
    handleMarkAsReady: vi.fn(async () => undefined),
    onJumpToTimelineItem: vi.fn(),
    ...overrides,
  };
}

export function MockArtifactDocumentPreview({
  controller,
  target,
  onArtifactDocumentControllerChange,
}: {
  controller: ArtifactWorkbenchDocumentController | null;
  target: CanvasWorkbenchPreviewTarget;
  onArtifactDocumentControllerChange?: (
    controller: ArtifactWorkbenchDocumentController | null,
  ) => void;
}) {
  React.useEffect(() => {
    onArtifactDocumentControllerChange?.(
      target.kind === "artifact" ? controller : null,
    );
    return () => {
      onArtifactDocumentControllerChange?.(null);
    };
  }, [controller, onArtifactDocumentControllerChange, target.kind]);

  return (
    <div data-testid="preview-panel">
      {target.kind}:{target.title}
    </div>
  );
}

export function mountHarness(
  props: CanvasWorkbenchLayoutProps,
): MountedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentProps = props;

  act(() => {
    root.render(<CanvasWorkbenchLayout {...currentProps} />);
  });

  const harness: MountedHarness = {
    container,
    root,
    rerender: (nextProps) => {
      currentProps = nextProps;
      act(() => {
        root.render(<CanvasWorkbenchLayout {...currentProps} />);
      });
    },
  };

  mountedRoots.push(harness);
  return harness;
}

export function mount(
  props: CanvasWorkbenchLayoutProps,
): HTMLDivElement {
  return mountHarness(props).container;
}

export async function flushEffects(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export async function resizeWorkbench(width: number, height = 720) {
  resizeObserverState.width = width;
  await act(async () => {
    resizeObserverState.observers.forEach((observer) => {
      if (!observer.target) {
        return;
      }
      observer.callback(
        [
          {
            target: observer.target,
            contentRect: {
              width,
              height,
            },
          },
        ],
        {},
      );
    });
    await Promise.resolve();
  });
}

export function clickByAriaLabel(container: HTMLElement, ariaLabel: string) {
  const element = container.querySelector(
    `[aria-label="${ariaLabel}"]`,
  ) as HTMLElement | null;
  if (!element) {
    throw new Error(`未找到元素: ${ariaLabel}`);
  }

  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  resizeObserverState.width = 1280;
  resizeObserverState.observers = [];

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      private callback: MockResizeObserverCallback;
      private target: Element | null = null;

      constructor(callback: MockResizeObserverCallback) {
        this.callback = callback;
      }

      observe = (target: Element) => {
        this.target = target;
        resizeObserverState.observers.push({
          callback: this.callback,
          target,
        });
        this.callback(
          [
            {
              target,
              contentRect: {
                width: resizeObserverState.width,
                height: 720,
              },
            },
          ],
          this,
        );
      };

      unobserve = () => {};

      disconnect = () => {
        resizeObserverState.observers = resizeObserverState.observers.filter(
          (observer) =>
            observer.callback !== this.callback ||
            observer.target !== this.target,
        );
      };
    },
  );

  mockListDirectory.mockImplementation(async (path: string) => {
    if (path === "/workspace") {
      return {
        path,
        parentPath: null,
        error: null,
        entries: [
          {
            name: ".lime",
            path: "/workspace/.lime",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
          {
            name: "exports",
            path: "/workspace/exports",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
          {
            name: "output",
            path: "/workspace/output",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
          {
            name: ".DS_Store",
            path: "/workspace/.DS_Store",
            isDir: false,
            size: 10,
            modifiedAt: 100,
          },
          {
            name: "output_image.jpg",
            path: "/workspace/output_image.jpg",
            isDir: false,
            size: 512,
            modifiedAt: 100,
          },
          {
            name: "README.md",
            path: "/workspace/README.md",
            isDir: false,
            size: 128,
            modifiedAt: 100,
          },
          {
            name: "src",
            path: "/workspace/src",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
        ],
      };
    }

    if (path === "/workspace/src") {
      return {
        path,
        parentPath: "/workspace",
        error: null,
        entries: [
          {
            name: "binary.dat",
            path: "/workspace/src/binary.dat",
            isDir: false,
            size: 2048,
            modifiedAt: 100,
          },
        ],
      };
    }

    if (path === "/workspace/exports/x-article-export/latest") {
      return {
        path,
        parentPath: "/workspace/exports/x-article-export",
        error: null,
        entries: [
          {
            name: "manifest.json",
            path: "/workspace/exports/x-article-export/latest/manifest.json",
            isDir: false,
            size: 1024,
            modifiedAt: 100,
          },
          {
            name: "images",
            path: "/workspace/exports/x-article-export/latest/images",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
          {
            name: "skills",
            path: "/workspace/exports/x-article-export/latest/skills",
            isDir: true,
            size: 0,
            modifiedAt: 100,
          },
          {
            name: "Agents.md",
            path: "/workspace/exports/x-article-export/latest/Agents.md",
            isDir: false,
            size: 256,
            modifiedAt: 100,
          },
          {
            name: "index.md",
            path: "/workspace/exports/x-article-export/latest/index.md",
            isDir: false,
            size: 2048,
            modifiedAt: 100,
          },
        ],
      };
    }

    return {
      path,
      parentPath: "/workspace",
      error: null,
      entries: [],
    };
  });

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
    },
  });

  Object.defineProperty(globalThis.URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:canvas-workbench"),
  });
  Object.defineProperty(globalThis.URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });

  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});
