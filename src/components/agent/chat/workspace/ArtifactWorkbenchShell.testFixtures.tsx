import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { ArtifactWorkbenchShell } from "./ArtifactWorkbenchShell";
import {
  ArtifactWorkbenchDocumentInspector,
  useArtifactWorkbenchDocumentController,
} from "./artifactWorkbenchDocument";
import {
  areLightweightRenderersRegistered,
  registerLightweightRenderers,
} from "@/components/artifact/renderers";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { Artifact } from "@/lib/artifact/types";
import type { AgentThreadItem } from "../types";

vi.mock("@/lib/workspace/workbenchCanvas", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workspace/workbenchCanvas")>();
  const ReactModule = await import("react");

  const MockNotionEditor = ReactModule.forwardRef<
    { flushContent: () => string },
    {
      content: string;
      onCommit: (content: string) => void;
      onSave: (latestContent?: string) => void;
      onCancel: () => void;
    }
  >(({ content, onCommit, onSave, onCancel }, ref) => {
    const [value, setValue] = ReactModule.useState(content);

    ReactModule.useEffect(() => {
      setValue(content);
    }, [content]);

    ReactModule.useImperativeHandle(
      ref,
      () => ({
        flushContent: () => value,
      }),
      [value],
    );

    return (
      <div data-testid="mock-notion-editor">
        <textarea
          data-testid="mock-notion-editor-input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onCommit(event.target.value);
          }}
        />
        <button type="button" onClick={() => onSave(value)}>
          保存编辑器
        </button>
        <button type="button" onClick={onCancel}>
          取消编辑器
        </button>
      </div>
    );
  });

  MockNotionEditor.displayName = "MockNotionEditor";

  return {
    ...actual,
    NotionEditor: MockNotionEditor,
  };
});

export interface MountedShell {
  container: HTMLDivElement;
  root: Root;
}

const mountedShells: MountedShell[] = [];

export interface ArtifactWorkbenchHarnessOverrides extends Partial<
  Omit<
    React.ComponentProps<typeof ArtifactWorkbenchShell>,
    "documentController"
  >
> {
  onSaveArtifactDocument?: (
    artifact: Artifact,
    document: ArtifactDocumentV1,
  ) => Promise<void> | void;
  threadItems?: AgentThreadItem[];
  focusedBlockId?: string | null;
  blockFocusRequestKey?: number;
  onJumpToTimelineItem?: (itemId: string) => void;
}

export function createArtifactDocumentArtifact(
  options: {
    status?: "ready" | "draft" | "failed" | "archived";
    currentVersionStatus?: "ready" | "draft" | "failed" | "archived";
    meta?: Record<string, unknown>;
  } = {},
): Artifact {
  const status = options.status || "ready";
  const currentVersionStatus = options.currentVersionStatus || status;
  const content = JSON.stringify({
    schemaVersion: "artifact_document.v1",
    artifactId: "artifact-document:demo",
    kind: "analysis",
    title: "董事会季度复盘",
    status,
    language: "zh-CN",
    summary: "需要优先补齐来源与版本线索。",
    blocks: [
      {
        id: "hero-1",
        type: "hero_summary",
        summary: "核心摘要",
        sourceIds: ["source-1"],
      },
      {
        id: "body-1",
        type: "rich_text",
        contentFormat: "markdown",
        content: "正文内容",
        markdown: "正文内容",
        sourceIds: ["source-1"],
      },
    ],
    sources: [
      {
        id: "source-1",
        type: "web",
        label: "OpenAI Blog",
        locator: {
          url: "https://openai.com",
        },
      },
    ],
    metadata: {
      currentVersionId: "artifact-document:demo:v2",
      currentVersionNo: 2,
      currentVersionDiff: {
        baseVersionId: "artifact-document:demo:v1",
        baseVersionNo: 1,
        targetVersionId: "artifact-document:demo:v2",
        targetVersionNo: 2,
        updatedCount: 1,
        changedBlocks: [
          {
            blockId: "body-1",
            changeType: "updated",
            beforeText: "旧正文",
            afterText: "正文内容",
            summary: "更新 block 内容",
          },
        ],
      },
      versionHistory: [
        {
          id: "artifact-document:demo:v1",
          artifactId: "artifact-document:demo",
          versionNo: 1,
          title: "董事会季度复盘",
          summary: "第一版摘要",
          status: "ready",
        },
        {
          id: "artifact-document:demo:v2",
          artifactId: "artifact-document:demo",
          versionNo: 2,
          title: "董事会季度复盘",
          summary: "补齐来源与版本信息",
          status: currentVersionStatus,
        },
      ],
    },
  });

  return {
    id: "artifact-1",
    type: "document",
    title: "board-review.artifact.json",
    content,
    status: "complete",
    meta: {
      filePath: ".lime/artifacts/thread-1/board-review.artifact.json",
      filename: "board-review.artifact.json",
      language: "json",
      ...options.meta,
    },
    position: { start: 0, end: content.length },
    createdAt: 1,
    updatedAt: 1,
  };
}

export function createStructuredEditableArtifact(): Artifact {
  const content = JSON.stringify({
    schemaVersion: "artifact_document.v1",
    artifactId: "artifact-document:editable",
    kind: "report",
    title: "结构化编辑演示",
    status: "ready",
    language: "zh-CN",
    summary: "用于验证章节头、摘要卡与提示块编辑。",
    blocks: [
      {
        id: "section-1",
        type: "section_header",
        title: "执行摘要",
        description: "先看结论，再看展开分析。",
      },
      {
        id: "hero-structured",
        type: "hero_summary",
        eyebrow: "董事会视角",
        title: "季度经营摘要",
        summary: "收入增长稳定，但需要关注交付效率。",
        highlights: ["收入增长 18%", "交付时延仍偏高"],
      },
      {
        id: "body-structured",
        type: "rich_text",
        contentFormat: "markdown",
        content: "这里是详细分析。",
        markdown: "这里是详细分析。",
      },
      {
        id: "callout-1",
        type: "callout",
        title: "风险提示",
        body: "第二季度需重点压缩项目交付周期。",
        content: "第二季度需重点压缩项目交付周期。",
        tone: "warning",
      },
    ],
    sources: [],
    metadata: {},
  });

  return {
    id: "artifact-structured",
    type: "document",
    title: "structured-edit.artifact.json",
    content,
    status: "complete",
    meta: {
      filePath: ".lime/artifacts/thread-1/structured-edit.artifact.json",
      filename: "structured-edit.artifact.json",
      language: "json",
    },
    position: { start: 0, end: content.length },
    createdAt: 1,
    updatedAt: 1,
  };
}

export function createTranscriptionDocumentArtifact(): Artifact {
  const content = JSON.stringify({
    schemaVersion: "artifact_document.v1",
    artifactId: "transcription-generate:task-transcription-1",
    kind: "brief",
    title: "内容转写任务",
    status: "ready",
    language: "zh-CN",
    summary: "用于验证 transcript 校对稿保存。",
    blocks: [
      {
        id: "transcript-segments",
        type: "table",
        title: "转写时间轴（可逐段编辑校对）",
        columns: ["时间", "说话人", "内容"],
        rows: [["00:01 - 00:03", "主持人", "欢迎来到 Lime 访谈节目。"]],
      },
      {
        id: "transcript-text",
        type: "code_block",
        title: "转写文本（可编辑校对）",
        language: "text",
        code: "欢迎来到 Lime 访谈节目。",
      },
    ],
    sources: [
      {
        id: "transcript-file",
        type: "file",
        label: "transcript output",
        locator: {
          path: ".lime/runtime/transcripts/task-transcription-1.txt",
        },
        reliability: "primary",
      },
    ],
    metadata: {
      taskId: "task-transcription-1",
      taskType: "transcription_generate",
      modalityContractKey: "audio_transcription",
      transcriptPath: ".lime/runtime/transcripts/task-transcription-1.txt",
      transcriptText: "欢迎来到 Lime 访谈节目。",
      transcriptSegments: [
        {
          id: "segment-1",
          index: 1,
          startMs: 1000,
          endMs: 3000,
          speaker: "主持人",
          text: "欢迎来到 Lime 访谈节目。",
        },
      ],
      transcriptCorrectionEnabled: true,
      transcriptCorrectionStatus: "available",
      transcriptCorrectionSource: "artifact_document_version",
    },
  });

  return {
    id: "artifact-transcription",
    type: "document",
    title: "task-transcription-1.artifact.json",
    content,
    status: "complete",
    meta: {
      filePath:
        ".lime/runtime/transcription-generate/task-transcription-1.artifact.json",
      filename: "task-transcription-1.artifact.json",
      language: "json",
    },
    position: { start: 0, end: content.length },
    createdAt: 1,
    updatedAt: 1,
  };
}

export function createAdvancedEditableArtifact(): Artifact {
  const content = JSON.stringify({
    schemaVersion: "artifact_document.v1",
    artifactId: "artifact-document:advanced-editable",
    kind: "analysis",
    title: "更多结构化块编辑演示",
    status: "ready",
    language: "zh-CN",
    summary: "用于验证更多结构化 block 的编辑回写。",
    blocks: [
      {
        id: "section-advanced",
        type: "section_header",
        title: "重点跟进",
        description: "围绕经营动作做块级编辑。",
      },
      {
        id: "keypoints-1",
        type: "key_points",
        title: "关键结论",
        items: ["收入保持增长", "交付效率需要治理"],
      },
      {
        id: "table-1",
        type: "table",
        title: "经营对比表",
        columns: ["维度", "现状", "动作"],
        rows: [
          ["收入", "稳定", "继续追踪"],
          ["交付", "偏慢", "压缩周期"],
        ],
      },
      {
        id: "checklist-1",
        type: "checklist",
        title: "推进清单",
        items: [
          { id: "task-1", text: "梳理重点客户", state: "todo" },
          { id: "task-2", text: "压缩交付周期", state: "doing" },
        ],
      },
      {
        id: "metric-1",
        type: "metric_grid",
        title: "经营指标",
        metrics: [
          {
            id: "metric-1-a",
            label: "ARR",
            value: "18%",
            note: "同比增长",
            tone: "success",
          },
          {
            id: "metric-1-b",
            label: "交付时延",
            value: "12 天",
            note: "仍高于目标",
            tone: "warning",
          },
        ],
      },
      {
        id: "quote-1",
        type: "quote",
        text: "交付效率会直接影响下季度毛利。",
        attribution: "COO 周会",
      },
      {
        id: "code-1",
        type: "code_block",
        title: "执行脚本",
        language: "bash",
        code: "npm run verify:local",
      },
    ],
    sources: [],
    metadata: {},
  });

  return {
    id: "artifact-advanced-structured",
    type: "document",
    title: "advanced-structured-edit.artifact.json",
    content,
    status: "complete",
    meta: {
      filePath:
        ".lime/artifacts/thread-1/advanced-structured-edit.artifact.json",
      filename: "advanced-structured-edit.artifact.json",
      language: "json",
    },
    position: { start: 0, end: content.length },
    createdAt: 1,
    updatedAt: 1,
  };
}

export function createArtifactTimelineItems(): AgentThreadItem[] {
  return [
    {
      id: "thread-item-body",
      thread_id: "thread-1",
      turn_id: "turn-1",
      sequence: 4,
      status: "completed",
      started_at: "2026-03-25T10:00:00Z",
      completed_at: "2026-03-25T10:00:01Z",
      updated_at: "2026-03-25T10:00:01Z",
      type: "file_artifact",
      path: ".lime/artifacts/thread-1/board-review.artifact.json",
      source: "artifact_snapshot",
      content: createArtifactDocumentArtifact().content,
      metadata: {
        artifact_id: "artifact-document:demo",
        artifact_block_id: "body-1",
      },
    },
  ];
}

export function renderShell(
  artifact: Artifact,
  overrides: ArtifactWorkbenchHarnessOverrides = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const {
    onSaveArtifactDocument,
    threadItems,
    focusedBlockId,
    blockFocusRequestKey,
    onJumpToTimelineItem,
    ...shellOverrides
  } = overrides;

  function ShellHarness() {
    const controller = useArtifactWorkbenchDocumentController({
      artifact,
      onSaveArtifactDocument,
      threadItems,
      focusedBlockId,
      blockFocusRequestKey,
      onJumpToTimelineItem,
    });

    return (
      <ArtifactWorkbenchShell
        artifact={artifact}
        artifactOverlay={null}
        isStreaming={false}
        showPreviousVersionBadge={false}
        viewMode="preview"
        onViewModeChange={() => {}}
        previewSize="desktop"
        onPreviewSizeChange={() => {}}
        onCloseCanvas={() => {}}
        {...shellOverrides}
        documentController={controller}
      />
    );
  }

  act(() => {
    root.render(<ShellHarness />);
  });

  mountedShells.push({ container, root });
  return container;
}

export function renderWorkbench(
  artifact: Artifact,
  overrides: ArtifactWorkbenchHarnessOverrides = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const {
    onSaveArtifactDocument,
    threadItems,
    focusedBlockId,
    blockFocusRequestKey,
    onJumpToTimelineItem,
    ...shellOverrides
  } = overrides;

  function WorkbenchHarness() {
    const controller = useArtifactWorkbenchDocumentController({
      artifact,
      onSaveArtifactDocument,
      threadItems,
      focusedBlockId,
      blockFocusRequestKey,
      onJumpToTimelineItem,
    });

    return (
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]">
        <ArtifactWorkbenchShell
          artifact={artifact}
          artifactOverlay={null}
          isStreaming={false}
          showPreviousVersionBadge={false}
          viewMode="preview"
          onViewModeChange={() => {}}
          previewSize="desktop"
          onPreviewSizeChange={() => {}}
          onCloseCanvas={() => {}}
          {...shellOverrides}
          documentController={controller}
        />
        <ArtifactWorkbenchDocumentInspector
          controller={controller}
          testId="artifact-workbench-document-inspector"
          containerClassName="min-h-0 border-l border-slate-200 bg-slate-50/70"
          tabsClassName="flex h-full min-h-0 flex-col p-4"
        />
      </div>
    );
  }

  act(() => {
    root.render(<WorkbenchHarness />);
  });

  mountedShells.push({ container, root });
  return container;
}

export function setTextControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();

  if (!areLightweightRenderersRegistered()) {
    registerLightweightRenderers();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  while (mountedShells.length > 0) {
    const mounted = mountedShells.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});
