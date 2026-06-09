import React from "react";
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { ResourceManagerPage } from "./ResourceManagerPage";
import { getResourceManagerSessionStorageKey } from "./resourceManagerSession";
import type { ResourceManagerSession } from "./types";

const hoistedMocks = vi.hoisted(() => ({
  mockOpenExternalUrlWithSystemBrowser: vi.fn(),
  mockOpenPathWithDefaultApp: vi.fn(),
  mockReadFilePreview: vi.fn(),
  mockRevealPathInFinder: vi.fn(),
}));

export const act = reactAct;
export const {
  mockOpenExternalUrlWithSystemBrowser,
  mockOpenPathWithDefaultApp,
  mockReadFilePreview,
  mockRevealPathInFinder,
} = hoistedMocks;

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser:
    hoistedMocks.mockOpenExternalUrlWithSystemBrowser,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
  openPathWithDefaultApp: hoistedMocks.mockOpenPathWithDefaultApp,
  revealPathInFinder: hoistedMocks.mockRevealPathInFinder,
}));

vi.mock("@/lib/api/fileBrowser", () => ({
  readFilePreview: hoistedMocks.mockReadFilePreview,
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostEventCapability: () => false,
  hasDesktopHostInvokeCapability: () => false,
}));

vi.mock("@/components/agent/chat/components/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <article data-testid="mock-markdown-renderer">{content}</article>
  ),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

export function renderPage(session: ResourceManagerSession | null) {
  localStorage.clear();
  if (session) {
    localStorage.setItem(
      getResourceManagerSessionStorageKey(session.id),
      JSON.stringify(session),
    );
    window.history.pushState({}, "", `/resource-manager?session=${session.id}`);
  } else {
    window.history.pushState({}, "", "/resource-manager?session=missing");
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ResourceManagerPage />);
  });
  mountedRoots.push({ root, container });
  return container;
}

export function updateTextInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function resetResourceManagerPageTest() {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mockOpenExternalUrlWithSystemBrowser.mockResolvedValue(undefined);
  mockReadFilePreview.mockResolvedValue({
    path: "/tmp/demo.txt",
    content: "来自文件的文本",
    isBinary: false,
    size: 7,
    error: null,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
}

export function cleanupResourceManagerPageTest() {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
}
