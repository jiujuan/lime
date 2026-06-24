import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { SearchResultPreviewItem } from "../utils/searchResultPreview";
import { InlineToolProcessStep } from "./InlineToolProcessStep";

export const openExternalUrlWithSystemBrowserMock = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: (...args: unknown[]) =>
    openExternalUrlWithSystemBrowserMock(...args),
}));

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

interface RenderOptions {
  isMessageStreaming?: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: unknown) => void;
  onOpenUrlPreview?: (item: SearchResultPreviewItem) => void;
  urlPreviewToolCalls?: ToolCallState[];
}

const mountedRoots: RenderResult[] = [];

export function renderTool(
  toolCall: ToolCallState,
  options?: RenderOptions,
): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InlineToolProcessStep
        toolCall={toolCall}
        isMessageStreaming={options?.isMessageStreaming}
        onFileClick={options?.onFileClick}
        onOpenSavedSiteContent={options?.onOpenSavedSiteContent}
        onOpenUrlPreview={options?.onOpenUrlPreview}
        urlPreviewToolCalls={options?.urlPreviewToolCalls}
      />,
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
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
  vi.clearAllMocks();
});
