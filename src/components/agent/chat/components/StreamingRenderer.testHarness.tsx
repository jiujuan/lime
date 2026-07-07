import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "i18next";
import { afterEach, beforeEach, vi } from "vitest";
import { parseAIResponseMock } from "./StreamingRenderer.testMocks";
import { StreamingRenderer } from "./StreamingRenderer";
import type {
  AgentToolCallState,
  AgentToolResultMetadata,
} from "@/lib/api/agentProtocol";
import type {
  ActionRequired,
  AgentRuntimeStatus,
  ContentPart,
  MessageMediaReference,
  WriteArtifactContext,
} from "../types";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

export interface StreamingRendererHarnessProps {
  content: string;
  isStreaming?: boolean;
  thinkingContent?: string;
  contentParts?: ContentPart[];
  renderA2UIInline?: boolean;
  runtimeStatus?: AgentRuntimeStatus;
  showRuntimeStatusInline?: boolean;
  toolCalls?: AgentToolCallState[];
  actionRequests?: ActionRequired[];
  promoteActionRequestsToA2UI?: boolean;
  onPermissionResponse?: (payload: unknown) => void;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
  onFileClick?: (fileName: string, content: string) => void;
  fileChangesUndoSessionId?: string | null;
  onOpenSavedSiteContent?: (target: {
    projectId: string;
    contentId: string;
    title?: string;
  }) => void;
  onOpenUrlPreview?: (item: unknown) => void;
  onOpenMediaReference?: (
    reference: MessageMediaReference,
    index: number,
  ) => void;
  suppressProcessFlow?: boolean;
  showContentBlockActions?: boolean;
  onQuoteContent?: (content: string) => void;
  markdownRenderMode?: "standard" | "light";
  readOnlyA2UI?: boolean;
  readOnlyActionRequests?: boolean;
}

export function installStreamingRendererTestHarness() {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    document.documentElement.lang = "zh-CN";
    if (i18n.isInitialized) {
      await i18n.changeLanguage("zh-CN");
    }
    parseAIResponseMock.mockImplementation((content: string) => ({
      parts: content.trim() ? [{ type: "text", content: content.trim() }] : [],
      hasA2UI: false,
      hasWriteFile: false,
      hasPending: false,
    }));
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) break;
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    document.documentElement.lang = "";
    vi.useRealTimers();
    vi.clearAllMocks();
  });
}

export function renderStreamingRendererHarness(
  props: StreamingRendererHarnessProps,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const rerender = (nextProps: StreamingRendererHarnessProps) => {
    act(() => {
      root.render(<StreamingRenderer {...nextProps} />);
    });
  };

  rerender(props);
  mountedRoots.push({ container, root });

  return { container, rerender };
}

export function createSavedSiteMetadata(): AgentToolResultMetadata {
  return {
    tool_family: "site",
    saved_project_id: "project-1",
    saved_content: {
      content_id: "content-1",
      project_id: "project-1",
      title: "Google Cloud Tech 文章导出",
      markdown_relative_path: "saved/x-article-export/article.md",
      images_relative_dir: "saved/x-article-export/images",
      image_count: 2,
    },
  };
}
