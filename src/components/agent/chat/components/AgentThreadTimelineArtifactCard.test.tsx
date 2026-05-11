import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentThreadTimelineArtifactCard } from "./AgentThreadTimelineArtifactCard";
import type { AgentThreadItem } from "../types";
import { conversationProjectionStore } from "../projection/conversationProjectionStore";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

  vi.clearAllMocks();
  conversationProjectionStore.clearAgentUiProjectionEvents();
});

function createFileArtifactItem(
  overrides: Partial<Extract<AgentThreadItem, { type: "file_artifact" }>> = {},
): Extract<AgentThreadItem, { type: "file_artifact" }> {
  return {
    id: "artifact-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-03-28T01:00:00Z",
    completed_at: "2026-03-28T01:00:01Z",
    updated_at: "2026-03-28T01:00:01Z",
    type: "file_artifact",
    path: ".lime/artifacts/thread-1/analysis-20260328.artifact.json",
    source: "artifact_document_service",
    content: JSON.stringify({
      schemaVersion: "artifact_document.v1",
      artifactId: "artifact-document:demo",
      kind: "analysis",
      title: "季度复盘",
      status: "ready",
      language: "zh-CN",
      blocks: [
        {
          id: "hero-1",
          type: "hero_summary",
          summary: "本轮重点是补齐来源线索与交付节奏。",
        },
        {
          id: "body-1",
          type: "rich_text",
          contentFormat: "markdown",
          content: "这里是详细展开。",
          markdown: "这里是详细展开。",
        },
      ],
      sources: [{ id: "source-1", type: "file", label: "内部周报" }],
      metadata: {
        currentVersionId: "artifact-document:demo:v2",
        currentVersionNo: 2,
      },
    }),
    metadata: {
      artifact_id: "artifact-document:demo",
      artifact_block_id: ["hero-1", "body-1"],
    },
    ...overrides,
  };
}

function renderCard(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
  props?: {
    timestamp?: string | null;
    onFileClick?: (fileName: string, content: string) => void;
    onOpenArtifactFromTimeline?: (target: {
      filePath: string;
      content: string;
      timelineItemId: string;
      blockId?: string;
      artifactId?: string;
    }) => void;
    sourceMessageId?: string;
    onSaveFileArtifactAsKnowledge?: (source: {
      messageId: string;
      content: string;
      sourceName?: string;
      description?: string | null;
    }) => void;
  },
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AgentThreadTimelineArtifactCard
        item={item}
        timestamp={props?.timestamp || "09:00"}
        onFileClick={props?.onFileClick}
        onOpenArtifactFromTimeline={props?.onOpenArtifactFromTimeline}
        sourceMessageId={props?.sourceMessageId}
        onSaveFileArtifactAsKnowledge={props?.onSaveFileArtifactAsKnowledge}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("AgentThreadTimelineArtifactCard", () => {
  it("结构化 artifact 文稿应收敛为可读结果卡而不是原始 JSON", () => {
    const container = renderCard(createFileArtifactItem(), {
      onOpenArtifactFromTimeline: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="timeline-file-artifact-card"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("季度复盘");
    expect(container.textContent).toContain("分析");
    expect(container.textContent).toContain("可阅读");
    expect(container.textContent).toContain("文稿服务");
    expect(container.textContent).toContain("2 个区块");
    expect(container.textContent).toContain("1 条来源");
    expect(container.textContent).toContain("V2");
    expect(container.textContent).toContain(
      "定位到 本轮重点是补齐来源线索与交付节奏。",
    );
    expect(container.textContent).not.toContain("可保存到项目资料");
    expect(container.textContent).not.toContain("保存这份文档");
    expect(container.textContent).not.toContain("artifact_document_service");
    expect(container.textContent).not.toContain("schemaVersion");
    expect(container.textContent).not.toContain('"artifactId"');
  });

  it("普通 JSON 文件也不应把原始结构直接摊在聊天区", () => {
    const container = renderCard(
      createFileArtifactItem({
        path: ".lime/artifacts/thread-1/runtime-state.json",
        source: "artifact_snapshot",
        content: JSON.stringify({
          queue: ["turn-1"],
          retryable: true,
        }),
        metadata: {},
      }),
    );

    expect(container.textContent).toContain("已同步");
    expect(container.textContent).toContain(
      "包含结构化结果，点击在画布中查看完整内容。",
    );
    expect(container.textContent).not.toContain('"queue"');
    expect(container.textContent).not.toContain('"retryable"');
  });

  it("首屏省略 artifact 正文时应使用 metadata 渲染卡片摘要", () => {
    const container = renderCard(
      createFileArtifactItem({
        content: undefined,
        metadata: {
          artifact_id: "artifact-document:demo",
          artifactTitle: "季度复盘",
          artifactKind: "analysis",
          artifactStatus: "ready",
          artifactVersionNo: 2,
          previewText: "本轮重点是补齐来源线索与交付节奏。",
        },
      }),
      {
        onOpenArtifactFromTimeline: vi.fn(),
      },
    );

    expect(container.textContent).toContain("季度复盘");
    expect(container.textContent).toContain("分析");
    expect(container.textContent).toContain("可阅读");
    expect(container.textContent).toContain("V2");
    expect(container.textContent).toContain(
      "本轮重点是补齐来源线索与交付节奏。",
    );
    expect(container.textContent).not.toContain("schemaVersion");
  });

  it("应从 AgentUI projection store 显示 artifact 标准投影状态", () => {
    conversationProjectionStore.recordAgentUiProjectionEvents([
      {
        type: "artifact.preview.ready",
        sourceType: "artifact_snapshot",
        sequence: 1,
        timestamp: "2026-03-28T01:00:02Z",
        sessionId: "session-artifact-1",
        threadId: "thread-1",
        turnId: "turn-1",
        artifactId: "artifact-document:demo",
        owner: "artifact",
        scope: "artifact",
        phase: "completed",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        payload: { status: "ready" },
      },
    ]);

    const container = renderCard(createFileArtifactItem());

    const badge = container.querySelector(
      '[data-testid="timeline-file-artifact-agentui"]',
    ) as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("AgentUI Artifact 预览");
    expect(badge?.getAttribute("title")).toContain(
      "Agent UI 标准投影",
    );
    expect(badge?.getAttribute("title")).toContain("产物快照");
    expect(badge?.getAttribute("title")).not.toContain("artifact_snapshot");
  });

  it("Markdown 文件产物应明确标识为可沉淀的 Document 产物", () => {
    const onSaveFileArtifactAsKnowledge = vi.fn();
    const content =
      "# 谢晶营销文案包 v1.0\n\n## 视频号口播\n这是一份可以进入项目资料的营销文案产物，包含口播、朋友圈和私信话术。";
    const container = renderCard(
      createFileArtifactItem({
        path: "outputs/谢晶_营销文案包_KnowledgeV2_E2E.md",
        source: "tool_result",
        content,
        metadata: {
          artifactTitle: "谢晶营销文案包 v1.0",
        },
      }),
      {
        sourceMessageId: "assistant-message-1",
        onSaveFileArtifactAsKnowledge,
      },
    );

    expect(container.textContent).toContain("Document 产物");
    expect(container.textContent).toContain("可保存到项目资料");
    expect(container.textContent).toContain("保存这份文档");

    const saveButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("保存这份文档"));

    expect(saveButton).not.toBeUndefined();

    act(() => {
      saveButton?.click();
    });

    expect(onSaveFileArtifactAsKnowledge).toHaveBeenCalledWith({
      messageId: "assistant-message-1",
      content,
      sourceName: "谢晶_营销文案包_KnowledgeV2_E2E.md",
      description: "谢晶营销文案包 v1.0",
    });
  });
});
