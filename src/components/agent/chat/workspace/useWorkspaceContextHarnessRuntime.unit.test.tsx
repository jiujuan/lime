import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceContextHarnessRuntime } from "./useWorkspaceContextHarnessRuntime";
import type { Message } from "../types";

const mockUseThemeContextWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../hooks", () => ({
  useThemeContextWorkspace: mockUseThemeContextWorkspace,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mockUseThemeContextWorkspace.mockReturnValue({
    generalWorkbenchEnabled: true,
    enabled: true,
    contextSearchQuery: "",
    setContextSearchQuery: vi.fn(),
    contextSearchMode: "web",
    setContextSearchMode: vi.fn(),
    contextSearchLoading: false,
    contextSearchError: null,
    contextSearchBlockedReason: null,
    submitContextSearch: vi.fn(),
    addTextContext: vi.fn(),
    addLinkContext: vi.fn(),
    addFileContext: vi.fn(),
    sidebarContextItems: [],
    toggleContextActive: vi.fn(),
    getContextDetail: vi.fn(),
    contextBudget: {
      activeCount: 0,
      activeCountLimit: 12,
      estimatedTokens: 0,
      tokenLimit: 32000,
    },
    activityLogs: [],
    activeContextPrompt: "",
    prepareActiveContextPrompt: vi.fn(),
  });
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

function mountHook(initialProps: {
  enabled: boolean;
  prefetchEnabled?: boolean;
  messages?: Message[];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  let latestValue: ReturnType<typeof useWorkspaceContextHarnessRuntime> | null =
    null;

  function TestComponent() {
    latestValue = useWorkspaceContextHarnessRuntime({
      enabled: initialProps.enabled,
      prefetchEnabled: initialProps.prefetchEnabled,
      projectId: "project-1",
      activeTheme: "general",
      messages: initialProps.messages ?? [],
      providerType: "openai",
      model: "gpt-4o-mini",
      mappedTheme: "general",
      isSending: false,
      projectMemory: null,
      harnessState: {
        pendingApprovals: [],
        hasSignals: false,
      },
    });
    return null;
  }

  act(() => {
    root.render(React.createElement(TestComponent));
  });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

describe("useWorkspaceContextHarnessRuntime", () => {
  it("应把预热开关透传到上下文工作台", () => {
    mountHook({ enabled: true, prefetchEnabled: false });

    expect(mockUseThemeContextWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        prefetchEnabled: false,
      }),
    );
  });
});
