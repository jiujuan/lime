import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GeneralWorkbenchContextBudget,
  GeneralWorkbenchContextItem,
} from "./generalWorkbenchContextData";
import { GeneralWorkbenchContextPanel } from "./GeneralWorkbenchContextPanel";

const { mockOpenExternalUrlWithSystemBrowser } = vi.hoisted(() => ({
  mockOpenExternalUrlWithSystemBrowser: vi.fn(),
}));

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: (...args: unknown[]) =>
    mockOpenExternalUrlWithSystemBrowser(...args),
}));

vi.mock("react-i18next", async () => {
  const { agentZhCNResource } = await import("@/i18n/agentResources");
  const agentZhCN = agentZhCNResource as Record<string, string>;

  const interpolate = (template: string, values: Record<string, unknown>) =>
    template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) => {
      const value = values[name.trim()];
      return value == null ? "" : String(value);
    });

  return {
    useTranslation: () => ({
      i18n: { language: "zh-CN" },
      t: (key: string, options?: Record<string, unknown>) => {
        const template = agentZhCN[key] ?? key;
        return options ? interpolate(template, options) : template;
      },
    }),
  };
});

interface MountedRoot {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedRoot[] = [];

const contextBudget: GeneralWorkbenchContextBudget = {
  activeCount: 1,
  activeCountLimit: 12,
  estimatedTokens: 600,
  tokenLimit: 32000,
};

function createSearchResult(
  overrides: Partial<GeneralWorkbenchContextItem> = {},
): GeneralWorkbenchContextItem {
  return {
    id: "search:context-1",
    name: "品牌趋势观察",
    source: "search",
    searchMode: "web",
    query: "品牌 2026",
    previewText: "品牌讨论聚焦产品定位、渠道节奏与转化质量。",
    citations: [
      {
        title: "官方博客",
        url: "https://example.com/blog",
      },
    ],
    createdAt: new Date("2026-06-09T10:00:00.000Z").getTime(),
    active: true,
    ...overrides,
  };
}

function renderPanel(selectedSearchResult: GeneralWorkbenchContextItem) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <GeneralWorkbenchContextPanel
        contextItems={[selectedSearchResult]}
        searchContextItems={[selectedSearchResult]}
        orderedContextItems={[selectedSearchResult]}
        selectedSearchResult={selectedSearchResult}
        latestSearchLabel="最近检索 06/09 10:00"
        contextBudget={contextBudget}
        contextSearchQuery="品牌"
        contextSearchMode="web"
        contextSearchLoading={false}
        contextSearchError={null}
        contextSearchBlockedReason={null}
        isSearchActionDisabled={false}
        searchInputRef={{ current: null }}
        onContextSearchQueryChange={vi.fn()}
        onContextSearchModeChange={vi.fn()}
        onSubmitContextSearch={vi.fn()}
        onOpenAddContextDialog={vi.fn()}
        onSelectSearchResult={vi.fn()}
        onToggleContextActive={vi.fn()}
        addContextDialogOpen={false}
        addTextDialogOpen={false}
        addLinkDialogOpen={false}
        contextDraftText=""
        contextDraftLink=""
        contextCreateLoading={false}
        contextCreateError={null}
        contextDropActive={false}
        onCloseAllContextDialogs={vi.fn()}
        onChooseContextFile={vi.fn()}
        onDropContextFile={vi.fn()}
        onOpenTextContextDialog={vi.fn()}
        onOpenLinkContextDialog={vi.fn()}
        onContextDraftTextChange={vi.fn()}
        onContextDraftLinkChange={vi.fn()}
        onContextDropActiveChange={vi.fn()}
        onSubmitTextContext={vi.fn()}
        onSubmitLinkContext={vi.fn()}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

function getCitationLink(container: HTMLElement): HTMLAnchorElement {
  const link = container.querySelector<HTMLAnchorElement>(
    'a[href="https://example.com/blog"], a[href="#local-note"]',
  );
  if (!link) {
    throw new Error("未找到引用链接");
  }
  return link;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockOpenExternalUrlWithSystemBrowser.mockResolvedValue(undefined);
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
});

describe("GeneralWorkbenchContextPanel citation links", () => {
  it("http 引用链接应走 Desktop Host 外链网关", async () => {
    const container = renderPanel(createSearchResult());
    const link = getCitationLink(container);

    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      link.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://example.com/blog",
    );
  });

  it("非 http 引用链接保留原生语义", async () => {
    const container = renderPanel(
      createSearchResult({
        citations: [{ title: "本地段落", url: "#local-note" }],
      }),
    );
    const link = getCitationLink(container);

    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBeNull();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      link.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(mockOpenExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
  });
});
