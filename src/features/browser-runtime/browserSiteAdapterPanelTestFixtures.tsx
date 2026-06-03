import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserSiteAdapterPanel } from "./BrowserSiteAdapterPanel";

interface MountedPanel {
  root: Root;
  container: HTMLDivElement;
}

const mountedPanels: MountedPanel[] = [];

export function createSiteAdapter(overrides: Record<string, unknown> = {}) {
  return {
    name: "github/search",
    domain: "github.com",
    description: "按关键词采集 GitHub 仓库搜索结果。",
    read_only: true,
    capabilities: ["search", "repository"],
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
    example_args: {
      query: "model context protocol",
      limit: 5,
    },
    example: 'github/search {"query":"model context protocol","limit":5}',
    auth_hint: "若需要完整结果，请先在浏览器中登录 GitHub。",
    ...overrides,
  };
}

export function createZhihuAdapter(overrides: Record<string, unknown> = {}) {
  return createSiteAdapter({
    name: "zhihu/search",
    domain: "www.zhihu.com",
    description: "按关键词采集知乎搜索结果。",
    capabilities: ["search", "research"],
    example_args: {
      query: "AI Agent",
      limit: 5,
    },
    example: 'zhihu/search {"query":"AI Agent","limit":5}',
    auth_hint: "请先在浏览器中登录知乎，再重试该命令。",
    ...overrides,
  });
}

export function createSiteRecommendation(overrides: Record<string, unknown> = {}) {
  return {
    adapter: createSiteAdapter({
      capabilities: ["search", "repository", "research"],
    }),
    reason:
      "已检测到资料 通用浏览器资料 当前停留在 github.com，可直接复用已连接的 Chrome 上下文。",
    profile_key: "general_browser_assist",
    target_id: "mock-target-1",
    entry_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    score: 100,
    ...overrides,
  };
}

export function createCatalogStatus(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    source_kind: "server_synced",
    registry_version: 3,
    directory: "/tmp/site-adapters/server-synced",
    catalog_version: "tenant-sync-1",
    tenant_id: "tenant-demo",
    synced_at: "2026-03-25T12:00:00.000Z",
    adapter_count: 1,
    ...overrides,
  };
}

export function createBrowserProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    profile_key: "general_browser_assist",
    name: "通用浏览器资料",
    description: "默认资料",
    site_scope: "github.com",
    launch_url: "https://github.com",
    transport_kind: "managed_cdp",
    profile_dir: "/tmp/profile",
    managed_profile_dir: "/tmp/managed-profile",
    created_at: "2026-03-24T00:00:00Z",
    updated_at: "2026-03-24T00:00:00Z",
    last_used_at: null,
    archived_at: null,
    ...overrides,
  };
}

export function createChromeBridgeStatus(overrides: Record<string, unknown> = {}) {
  return {
    observer_count: 0,
    control_count: 0,
    pending_command_count: 0,
    observers: [],
    controls: [],
    pending_commands: [],
    ...overrides,
  };
}

export function createChromeObserver(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "observer-1",
    profile_key: "research_attach",
    connected_at: "2026-03-24T00:00:00Z",
    user_agent: "Chrome",
    last_heartbeat_at: "2026-03-24T00:00:01Z",
    last_page_info: {
      title: "GitHub",
      url: "https://github.com/trending",
      markdown: "GitHub",
      updated_at: "2026-03-24T00:00:01Z",
    },
    ...overrides,
  };
}

export function createProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    name: "默认项目",
    workspaceType: "general",
    rootPath: "/tmp/project-1",
    isDefault: true,
    createdAt: 1,
    updatedAt: 1,
    isFavorite: false,
    isArchived: false,
    tags: [],
    ...overrides,
  };
}

export function createSiteRunResult(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    adapter: "github/search",
    domain: "github.com",
    profile_key: "general_browser_assist",
    session_id: "mock-cdp-session",
    target_id: "mock-target-1",
    entry_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    source_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    data: {
      items: [{ title: "mock repo", url: "https://github.com/mock/repo" }],
    },
    ...overrides,
  };
}

export async function renderPanel(
  props?: Partial<ComponentProps<typeof BrowserSiteAdapterPanel>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedPanels.push({ root, container });
  await act(async () => {
    root.render(
      <BrowserSiteAdapterPanel
        selectedProfileKey="general_browser_assist"
        variant="workspace"
        {...props}
      />,
    );
  });
  await flushMicrotasks();
  return container;
}

export function cleanupMountedBrowserSiteAdapterPanels() {
  while (mountedPanels.length > 0) {
    const mounted = mountedPanels.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
}

export async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

export function findInputByPlaceholder(
  container: HTMLElement,
  placeholder: string,
) {
  const input = Array.from(container.querySelectorAll("input")).find(
    (item) => item.placeholder === placeholder,
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`未找到输入框: ${placeholder}`);
  }
  return input;
}

export async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("HTMLInputElement.value setter 不存在");
    }
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

export async function flushMicrotasks(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
