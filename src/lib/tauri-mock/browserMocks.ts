import { DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES } from "./runtimeToolInventoryMocks";

type MockBrowserSessionSync = (
  session: any,
  options?: { finalize?: boolean },
) => any;

type BrowserMocksOptions = {
  syncBrowserSessionState?: MockBrowserSessionSync;
};

let syncBrowserSessionState: MockBrowserSessionSync = (session: any) => session;

export function configureBrowserMocks(options: BrowserMocksOptions = {}) {
  syncBrowserSessionState =
    options.syncBrowserSessionState ?? ((session: any) => session);
}

type MockBrowserProfileRecord = {
  id: string;
  profile_key: string;
  name: string;
  description: string | null;
  site_scope: string | null;
  launch_url: string | null;
  transport_kind: "managed_cdp" | "existing_session";
  profile_dir: string;
  managed_profile_dir: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
};

type MockBrowserEnvironmentPresetRecord = {
  id: string;
  name: string;
  description: string | null;
  proxy_server: string | null;
  timezone_id: string | null;
  locale: string | null;
  accept_language: string | null;
  geolocation_lat: number | null;
  geolocation_lng: number | null;
  geolocation_accuracy_m: number | null;
  user_agent: string | null;
  platform: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  device_scale_factor: number | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
};

type MockBrowserConnectorSettings = {
  enabled: boolean;
  install_root_dir: string | null;
  install_dir: string | null;
  browser_action_capabilities: Array<{
    key: string;
    label: string;
    description: string;
    group: string;
    enabled: boolean;
  }>;
  system_connectors: Array<{
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    available: boolean;
    visible: boolean;
    authorization_status: string;
    last_error: string | null;
    capabilities: string[];
  }>;
};

type MockBrowserConnectorInstallStatus = {
  status: string;
  install_root_dir: string | null;
  install_dir: string | null;
  bundled_name: string;
  bundled_version: string;
  installed_name: string | null;
  installed_version: string | null;
  message: string | null;
};

const mockBrowserProfiles: MockBrowserProfileRecord[] = [
  {
    id: "browser-profile-general",
    profile_key: "general_browser_assist",
    name: "通用浏览器资料",
    description: "默认浏览器协助资料",
    site_scope: "通用",
    launch_url: "https://www.google.com/",
    transport_kind: "managed_cdp",
    profile_dir: "/tmp/lime/chrome_profiles/general_browser_assist",
    managed_profile_dir: "/tmp/lime/chrome_profiles/general_browser_assist",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_used_at: null,
    archived_at: null,
  },
];

const mockBrowserEnvironmentPresets: MockBrowserEnvironmentPresetRecord[] = [
  {
    id: "browser-environment-us-desktop",
    name: "美区桌面",
    description: "美国住宅代理 + 桌面视口",
    proxy_server: "http://127.0.0.1:7890",
    timezone_id: "America/Los_Angeles",
    locale: "en-US",
    accept_language: "en-US,en;q=0.9",
    geolocation_lat: 37.7749,
    geolocation_lng: -122.4194,
    geolocation_accuracy_m: 100,
    user_agent: "Mozilla/5.0",
    platform: "MacIntel",
    viewport_width: 1440,
    viewport_height: 900,
    device_scale_factor: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_used_at: null,
    archived_at: null,
  },
];

let mockBrowserConnectorSettings: MockBrowserConnectorSettings = {
  enabled: true,
  install_root_dir: "/mock/path/to/connectors",
  install_dir: "/mock/path/to/connectors/Lime Browser Connector",
  browser_action_capabilities: DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES.map(
    (capability) => ({ ...capability }),
  ),
  system_connectors: [
    {
      id: "reminders",
      label: "提醒事项",
      description: "读取和管理你的提醒事项和任务列表。",
      enabled: false,
      available: true,
      visible: true,
      authorization_status: "not_determined",
      last_error: null,
      capabilities: ["list_reminders", "create_reminder", "update_reminder"],
    },
    {
      id: "calendar",
      label: "日历",
      description: "读取和管理你的日历事件。",
      enabled: false,
      available: true,
      visible: true,
      authorization_status: "not_determined",
      last_error: null,
      capabilities: ["list_events", "create_event", "update_event"],
    },
    {
      id: "notes",
      label: "备忘录",
      description: "读取和创建你的备忘录。",
      enabled: false,
      available: true,
      visible: true,
      authorization_status: "not_determined",
      last_error: null,
      capabilities: ["list_notes", "read_note", "create_note"],
    },
    {
      id: "mail",
      label: "邮件",
      description: "读取邮件和创建草稿。",
      enabled: false,
      available: true,
      visible: true,
      authorization_status: "not_determined",
      last_error: null,
      capabilities: ["list_mailboxes", "read_messages", "create_draft"],
    },
    {
      id: "contacts",
      label: "通讯录",
      description: "搜索、读取和创建联系人。",
      enabled: false,
      available: true,
      visible: true,
      authorization_status: "not_determined",
      last_error: null,
      capabilities: ["search_contacts", "read_contact", "create_contact"],
    },
  ],
};

function normalizeMockBrowserActionCapabilityKey(key: string) {
  if (key === "scroll") {
    return "scroll_page";
  }
  if (key === "javascript_tool") {
    return "javascript";
  }
  return key;
}

function filterMockBrowserBackendCapabilities(capabilities: string[]) {
  const enabledCapabilities = new Set(
    mockBrowserConnectorSettings.browser_action_capabilities
      .filter((capability) => capability.enabled)
      .map((capability) => capability.key),
  );
  return capabilities.filter((capability) => {
    const normalized = normalizeMockBrowserActionCapabilityKey(capability);
    return (
      !DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES.some(
        (item) => item.key === normalized,
      ) || enabledCapabilities.has(normalized)
    );
  });
}

function buildMockBrowserBackendsStatus() {
  return {
    policy: {
      priority: ["aster_compat", "lime_extension_bridge", "cdp_direct"],
      auto_fallback: true,
    },
    bridge_observer_count: 1,
    bridge_control_count: 0,
    running_profile_count: 1,
    cdp_alive_profile_count: 1,
    aster_native_host_supported: true,
    aster_native_host_configured: false,
    backends: [
      {
        backend: "aster_compat",
        available: true,
        capabilities: filterMockBrowserBackendCapabilities([
          "navigate",
          "read_page",
          "tabs_context_mcp",
          "list_tabs",
        ]),
      },
      {
        backend: "lime_extension_bridge",
        available: true,
        capabilities: filterMockBrowserBackendCapabilities([
          "navigate",
          "read_page",
          "get_page_text",
          "find",
          "form_input",
          "tabs_context_mcp",
          "open_url",
          "click",
          "type",
          "scroll",
          "scroll_page",
          "get_page_info",
          "refresh_page",
          "go_back",
          "go_forward",
          "switch_tab",
          "list_tabs",
        ]),
      },
      {
        backend: "cdp_direct",
        available: true,
        capabilities: filterMockBrowserBackendCapabilities([
          "tabs_context_mcp",
          "navigate",
          "read_page",
          "get_page_text",
          "find",
          "click",
          "type",
          "scroll_page",
          "get_page_info",
          "read_console_messages",
          "read_network_requests",
          "javascript",
        ]),
      },
    ],
  };
}

let mockBrowserBackendsStatus = buildMockBrowserBackendsStatus();

let mockBrowserConnectorInstallStatus: MockBrowserConnectorInstallStatus = {
  status: "not_installed",
  install_root_dir: "/mock/path/to/connectors",
  install_dir: "/mock/path/to/connectors/Lime Browser Connector",
  bundled_name: "Lime Browser Connector",
  bundled_version: "0.1.0",
  installed_name: null,
  installed_version: null,
  message: "尚未导出浏览器连接器",
};

let mockChromeBridgeStatus = {
  observer_count: 0,
  control_count: 0,
  pending_command_count: 0,
  observers: [],
  controls: [],
  pending_commands: [],
};

const now = () => new Date().toISOString();
const mockBrowserSessionStates = new Map<string, any>();
let mockExistingSessionTabs = [
  {
    id: 101,
    index: 0,
    active: true,
    title: "微博首页",
    url: "https://weibo.com/home",
  },
  {
    id: 202,
    index: 1,
    active: false,
    title: "微博创作中心",
    url: "https://weibo.com/compose",
  },
];

const mockBundledSiteAdapters = [
  {
    name: "github/search",
    domain: "github.com",
    description: "按关键词采集 GitHub 仓库搜索结果。",
    read_only: true,
    capabilities: ["search", "repository", "research"],
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        limit: {
          type: "integer",
          description: "返回条目数量上限",
        },
      },
      required: ["query"],
    },
    example_args: {
      query: "model context protocol",
      limit: 5,
    },
    example: 'github/search {"query":"model context protocol","limit":5}',
    auth_hint: "若需要完整结果，请先在浏览器中登录 GitHub。",
  },
  {
    name: "zhihu/hot",
    domain: "www.zhihu.com",
    description: "采集知乎热榜问题列表。",
    read_only: true,
    capabilities: ["hot", "feed", "research"],
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "返回条目数量上限",
        },
      },
      required: [],
    },
    example_args: {
      limit: 5,
    },
    example: 'zhihu/hot {"limit":5}',
    auth_hint: "请先在浏览器中登录知乎，再重试该命令。",
  },
];

const mockSiteRecommendations = [
  {
    adapter: mockBundledSiteAdapters[0],
    reason:
      "已检测到资料 research_attach 当前停留在 github.com，可直接复用已连接的 Chrome 上下文。",
    profile_key: "research_attach",
    target_id: "mock-target-1",
    entry_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    score: 100,
  },
  {
    adapter: mockBundledSiteAdapters[1],
    reason:
      "资料 通用浏览器资料 已绑定站点范围 www.zhihu.com，可优先作为该适配器的执行上下文。",
    profile_key: "general_browser_assist",
    entry_url: "https://www.zhihu.com/hot",
    score: 72,
  },
];

let mockImportedSiteAdapters: any[] = [];
let mockServerSyncedSiteAdapters: any[] = [];

let mockSiteAdapterCatalogStatus: {
  exists: boolean;
  source_kind: "bundled" | "imported" | "server_synced";
  registry_version: number;
  directory: string;
  catalog_version?: string;
  tenant_id?: string;
  synced_at?: string;
  adapter_count: number;
} = {
  exists: false,
  source_kind: "bundled",
  registry_version: 1,
  directory: "/tmp/lime/site-adapters/server-synced",
  adapter_count: mockBundledSiteAdapters.length,
};

function getMockEffectiveSiteAdapters() {
  const merged = new Map<string, any>();
  for (const adapter of [
    ...mockBundledSiteAdapters,
    ...mockImportedSiteAdapters,
    ...mockServerSyncedSiteAdapters,
  ]) {
    const normalizedName = String(adapter?.name ?? "")
      .trim()
      .toLowerCase();
    if (!normalizedName) {
      continue;
    }
    merged.set(normalizedName, adapter);
  }
  return Array.from(merged.values());
}

function buildMockSiteCatalogStatus(
  sourceKind: "bundled" | "imported" | "server_synced",
  adapterCount: number,
  overrides?: Partial<{
    exists: boolean;
    registry_version: number;
    directory: string;
    catalog_version: string | null;
    tenant_id: string | null;
    synced_at: string | null;
  }>,
) {
  return {
    exists: overrides?.exists ?? sourceKind !== "bundled",
    source_kind: sourceKind,
    registry_version: overrides?.registry_version ?? 1,
    directory:
      overrides?.directory ??
      (sourceKind === "imported"
        ? "/tmp/lime/site-adapters/imported"
        : "/tmp/lime/site-adapters/server-synced"),
    catalog_version: overrides?.catalog_version ?? undefined,
    tenant_id: overrides?.tenant_id ?? undefined,
    synced_at: overrides?.synced_at ?? undefined,
    adapter_count: adapterCount,
  };
}

function normalizeMockSiteAdapterPayload(
  adapter: any,
  sourceKind: "imported" | "server_synced",
) {
  const name = String(adapter?.name ?? "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    domain: String(adapter?.domain ?? "example.com").trim() || "example.com",
    description:
      String(adapter?.description ?? "导入的站点适配器").trim() ||
      "导入的站点适配器",
    read_only: adapter?.read_only ?? adapter?.readOnly ?? true,
    capabilities: Array.isArray(adapter?.capabilities)
      ? adapter.capabilities.map((item: unknown) => String(item))
      : ["research"],
    input_schema: { type: "object" },
    example_args: {},
    example: String(adapter?.example ?? `${name} {}`),
    auth_hint:
      typeof adapter?.auth_hint === "string" ? adapter.auth_hint : undefined,
    source_kind: sourceKind,
    source_version:
      typeof adapter?.source_version === "string"
        ? adapter.source_version
        : typeof adapter?.sourceVersion === "string"
          ? adapter.sourceVersion
          : undefined,
  };
}

function parseMockImportedYamlBundle(bundle: string, sourceVersion?: string) {
  return bundle
    .split(/^---\s*$/m)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const site = item.match(/(?:^|\n)site:\s*([^\n]+)/)?.[1]?.trim();
      const name = item.match(/(?:^|\n)name:\s*([^\n]+)/)?.[1]?.trim();
      const domain = item.match(/(?:^|\n)domain:\s*([^\n]+)/)?.[1]?.trim();
      const description =
        item.match(/(?:^|\n)description:\s*([^\n]+)/)?.[1]?.trim() ??
        "从外部来源导入的站点适配器";
      if (!site || !name || !domain) {
        throw new Error(`第 ${index + 1} 个 YAML 文档缺少 site/name/domain`);
      }
      return {
        name: `${site}/${name}`,
        domain,
        description,
        read_only: true,
        capabilities: ["research"],
        input_schema: { type: "object" },
        example_args: {},
        example: `${site}/${name} {}`,
        source_kind: "imported",
        source_version: sourceVersion,
      };
    });
}

function upsertMockBrowserSessionState(launchResponse: any) {
  mockBrowserSessionStates.set(
    launchResponse.session.session_id,
    launchResponse.session,
  );
  return launchResponse;
}

function resolveMockBrowserSessionState(
  args: any,
  overrides?: Record<string, any>,
) {
  const sessionId = args?.request?.session_id ?? "mock-cdp-session";
  const existing = mockBrowserSessionStates.get(sessionId);
  if (existing) {
    const next = {
      ...existing,
      ...overrides,
      last_event_at: new Date().toISOString(),
    };
    mockBrowserSessionStates.set(sessionId, next);
    return next;
  }

  const fallback = launchMockBrowserSession({
    profile_key: "general_browser_assist",
    stream_mode: "both",
  }).session;
  const next = {
    ...fallback,
    session_id: sessionId,
    ...overrides,
    last_event_at: new Date().toISOString(),
  };
  mockBrowserSessionStates.set(sessionId, next);
  return next;
}

export function launchMockBrowserSession(request: any) {
  const profile = mockBrowserProfiles.find(
    (item) => item.id === request?.profile_id,
  );
  const environmentPreset = mockBrowserEnvironmentPresets.find(
    (item) => item.id === request?.environment_preset_id,
  );
  const profileKey =
    request?.profile_key ?? profile?.profile_key ?? "general_browser_assist";
  const url = request?.url ?? profile?.launch_url ?? "https://www.google.com/";
  const currentTime = new Date().toISOString();

  if (profile) {
    profile.last_used_at = currentTime;
    profile.updated_at = currentTime;
  }
  if (environmentPreset) {
    environmentPreset.last_used_at = currentTime;
    environmentPreset.updated_at = currentTime;
  }

  const isExistingSession = profile?.transport_kind === "existing_session";

  return upsertMockBrowserSessionState({
    profile: {
      success: true,
      reused: isExistingSession,
      browser_source: "system",
      browser_path:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      profile_dir: isExistingSession
        ? ""
        : `/tmp/lime/chrome_profiles/${profileKey}`,
      remote_debugging_port: 13001,
      pid: 12345,
      devtools_http_url: "http://127.0.0.1:13001/json/version",
    },
    session: {
      session_id: `mock-cdp-session-${profileKey}`,
      profile_key: profileKey,
      environment_preset_id:
        environmentPreset?.id ?? request?.environment?.preset_id,
      environment_preset_name:
        environmentPreset?.name ?? request?.environment?.preset_name,
      target_id: request?.target_id ?? "mock-target-1",
      target_title: profile?.name ?? "Mock Target",
      target_url: url,
      remote_debugging_port: 13001,
      ws_debugger_url: "ws://127.0.0.1:13001/devtools/page/mock-target-1",
      devtools_frontend_url:
        "/devtools/inspector.html?ws=127.0.0.1:13001/devtools/page/mock-target-1",
      stream_mode: request?.stream_mode ?? "both",
      transport_kind: "cdp_frames",
      lifecycle_state: "live",
      control_mode: "agent",
      last_page_info: {
        title: profile?.name ?? "Mock Target",
        url,
        markdown: `# ${profile?.name ?? "Mock Target"}\nURL: ${url}`,
        updated_at: currentTime,
      },
      last_event_at: currentTime,
      created_at: currentTime,
      connected: true,
    },
  });
}

export const browserMocks: Record<string, (args?: any) => any> = {
  list_browser_environment_presets_cmd: (args: any) => {
    const includeArchived = Boolean(args?.request?.include_archived);
    return mockBrowserEnvironmentPresets.filter(
      (preset) => includeArchived || preset.archived_at === null,
    );
  },
  save_browser_environment_preset_cmd: (args: any) => {
    const request = args?.request ?? {};
    const now = new Date().toISOString();
    const existingIndex = mockBrowserEnvironmentPresets.findIndex(
      (preset) => preset.id === request.id,
    );
    if (existingIndex >= 0) {
      const existing = mockBrowserEnvironmentPresets[existingIndex];
      const next = {
        ...existing,
        name: request.name ?? existing.name,
        description: request.description ?? null,
        proxy_server: request.proxy_server ?? null,
        timezone_id: request.timezone_id ?? null,
        locale: request.locale ?? null,
        accept_language: request.accept_language ?? null,
        geolocation_lat: request.geolocation_lat ?? null,
        geolocation_lng: request.geolocation_lng ?? null,
        geolocation_accuracy_m: request.geolocation_accuracy_m ?? null,
        user_agent: request.user_agent ?? null,
        platform: request.platform ?? null,
        viewport_width: request.viewport_width ?? null,
        viewport_height: request.viewport_height ?? null,
        device_scale_factor: request.device_scale_factor ?? null,
        updated_at: now,
      };
      mockBrowserEnvironmentPresets[existingIndex] = next;
      return next;
    }
    const created = {
      id: request.id ?? `browser-environment-${Date.now()}`,
      name: request.name ?? "未命名环境",
      description: request.description ?? null,
      proxy_server: request.proxy_server ?? null,
      timezone_id: request.timezone_id ?? null,
      locale: request.locale ?? null,
      accept_language: request.accept_language ?? null,
      geolocation_lat: request.geolocation_lat ?? null,
      geolocation_lng: request.geolocation_lng ?? null,
      geolocation_accuracy_m: request.geolocation_accuracy_m ?? null,
      user_agent: request.user_agent ?? null,
      platform: request.platform ?? null,
      viewport_width: request.viewport_width ?? null,
      viewport_height: request.viewport_height ?? null,
      device_scale_factor: request.device_scale_factor ?? null,
      created_at: now,
      updated_at: now,
      last_used_at: null,
      archived_at: null,
    };
    mockBrowserEnvironmentPresets.unshift(created);
    return created;
  },
  archive_browser_environment_preset_cmd: (args: any) => {
    const preset = mockBrowserEnvironmentPresets.find(
      (item) => item.id === args?.request?.id,
    );
    if (!preset || preset.archived_at) {
      return false;
    }
    const now = new Date().toISOString();
    preset.archived_at = now;
    preset.updated_at = now;
    return true;
  },
  restore_browser_environment_preset_cmd: (args: any) => {
    const preset = mockBrowserEnvironmentPresets.find(
      (item) => item.id === args?.request?.id,
    );
    if (!preset || !preset.archived_at) {
      return false;
    }
    preset.archived_at = null;
    preset.updated_at = new Date().toISOString();
    return true;
  },
  list_browser_profiles_cmd: (args: any) => {
    const includeArchived = Boolean(args?.request?.include_archived);
    return mockBrowserProfiles.filter(
      (profile) => includeArchived || profile.archived_at === null,
    );
  },
  save_browser_profile_cmd: (args: any) => {
    const request = args?.request ?? {};
    const now = new Date().toISOString();
    const profileKey = request.profile_key ?? `profile_${Date.now()}`;
    const existingIndex = mockBrowserProfiles.findIndex(
      (profile) => profile.id === request.id,
    );
    if (existingIndex >= 0) {
      const existing = mockBrowserProfiles[existingIndex];
      const nextTransportKind =
        request.transport_kind ?? existing.transport_kind;
      const nextManagedProfileDir =
        nextTransportKind === "existing_session"
          ? null
          : `/tmp/lime/chrome_profiles/${existing.profile_key}`;
      const next = {
        ...existing,
        name: request.name ?? existing.name,
        description: request.description ?? null,
        site_scope: request.site_scope ?? null,
        launch_url: request.launch_url ?? null,
        transport_kind: nextTransportKind,
        profile_dir: nextManagedProfileDir ?? "",
        managed_profile_dir: nextManagedProfileDir,
        updated_at: now,
      };
      mockBrowserProfiles[existingIndex] = next;
      return next;
    }
    const transportKind = request.transport_kind ?? "managed_cdp";
    const managedProfileDir =
      transportKind === "existing_session"
        ? null
        : `/tmp/lime/chrome_profiles/${profileKey}`;
    const created = {
      id: request.id ?? `browser-profile-${Date.now()}`,
      profile_key: profileKey,
      name: request.name ?? "未命名资料",
      description: request.description ?? null,
      site_scope: request.site_scope ?? null,
      launch_url: request.launch_url ?? null,
      transport_kind: transportKind,
      profile_dir: managedProfileDir ?? "",
      managed_profile_dir: managedProfileDir,
      created_at: now,
      updated_at: now,
      last_used_at: null,
      archived_at: null,
    };
    mockBrowserProfiles.unshift(created);
    return created;
  },
  archive_browser_profile_cmd: (args: any) => {
    const profile = mockBrowserProfiles.find(
      (item) => item.id === args?.request?.id,
    );
    if (!profile || profile.archived_at) {
      return false;
    }
    const now = new Date().toISOString();
    profile.archived_at = now;
    profile.updated_at = now;
    return true;
  },
  restore_browser_profile_cmd: (args: any) => {
    const profile = mockBrowserProfiles.find(
      (item) => item.id === args?.request?.id,
    );
    if (!profile || !profile.archived_at) {
      return false;
    }
    profile.archived_at = null;
    profile.updated_at = new Date().toISOString();
    return true;
  },
  launch_browser_session: (args: any) => {
    return launchMockBrowserSession(args?.request);
  },
  launch_browser_profile_runtime_assist_cmd: (args: any) =>
    launchMockBrowserSession({
      profile_id: args?.request?.id,
      url: args?.request?.url,
      environment_preset_id: args?.request?.environment_preset_id,
      target_id: args?.request?.target_id,
      open_window: args?.request?.open_window,
      stream_mode: args?.request?.stream_mode,
    }),
  get_chrome_profile_sessions: () =>
    mockBrowserProfiles
      .filter((profile) => profile.archived_at === null)
      .map((profile) => ({
        profile_key: profile.profile_key,
        browser_source: "system",
        browser_path:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        profile_dir: profile.profile_dir,
        remote_debugging_port: 13001,
        pid: 12345,
        started_at: now(),
        last_url: profile.launch_url ?? "https://www.google.com/",
      })),
  close_chrome_profile_session: () => true,
  cleanup_gui_smoke_chrome_profiles: () => ({
    matched_profiles: [],
    removed_profiles: [],
    skipped_profiles: [],
    terminated_process_count: 0,
  }),
  open_browser_runtime_debugger_window: () => ({ success: true }),
  close_browser_runtime_debugger_window: () => ({ success: true }),
  launch_browser_runtime_assist: (args: any) =>
    launchMockBrowserSession({
      profile_id: args?.request?.profile_id,
      profile_key: args?.request?.profile_key,
      url: args?.request?.url,
      environment_preset_id: args?.request?.environment?.preset_id,
      environment: args?.request?.environment,
      target_id: args?.request?.target_id,
      open_window: args?.request?.open_window,
      stream_mode: args?.request?.stream_mode,
    }),
  site_list_adapters: () => getMockEffectiveSiteAdapters(),
  site_recommend_adapters: (args: any) => {
    const rawLimit = Number(
      args?.request?.limit ?? mockSiteRecommendations.length,
    );
    const limit = Number.isFinite(rawLimit)
      ? Math.max(0, Math.floor(rawLimit))
      : mockSiteRecommendations.length;
    return mockSiteRecommendations.slice(0, limit);
  },
  site_search_adapters: (args: any) => {
    const query = String(args?.request?.query ?? "")
      .trim()
      .toLowerCase();
    const effectiveAdapters = getMockEffectiveSiteAdapters();
    if (!query) {
      return effectiveAdapters;
    }
    return effectiveAdapters.filter(
      (adapter) =>
        adapter.name.toLowerCase().includes(query) ||
        adapter.domain.toLowerCase().includes(query) ||
        adapter.description.toLowerCase().includes(query) ||
        adapter.capabilities.some((item: string) =>
          item.toLowerCase().includes(query),
        ),
    );
  },
  site_get_adapter_info: (args: any) => {
    const name = String(args?.request?.name ?? "");
    const adapter = getMockEffectiveSiteAdapters().find(
      (item) => item.name === name,
    );
    if (!adapter) {
      throw new Error("未找到对应的站点适配器");
    }
    return adapter;
  },
  site_get_adapter_launch_readiness: (args: any) => {
    const request = args?.request ?? {};
    const adapterName = String(request.adapter_name ?? "");
    const adapter = getMockEffectiveSiteAdapters().find(
      (item) => item.name === adapterName,
    );
    if (!adapter) {
      throw new Error("未找到对应的站点适配器");
    }

    const requestedProfileKey =
      typeof request.profile_key === "string" ? request.profile_key.trim() : "";
    const requestedTargetId =
      typeof request.target_id === "string" ? request.target_id.trim() : "";
    const matchingTab = mockExistingSessionTabs.find((tab) =>
      tab.url?.toLowerCase().includes(adapter.domain.replace(/^www\./, "")),
    );

    if (requestedProfileKey === "general_browser_assist") {
      return {
        status: "requires_browser_runtime",
        adapter: adapter.name,
        domain: adapter.domain,
        profile_key: requestedProfileKey,
        message:
          "当前资料属于 Lime 托管浏览器，不允许在 Claw 内静默接管执行；请改走浏览器工作台。",
        report_hint:
          "Claw 不会在后台偷偷启动浏览器；请先进入浏览器工作台连接真实浏览器并打开目标站点页面，再返回 Claw 重试。",
      };
    }

    if (requestedTargetId || matchingTab) {
      return {
        status: "ready",
        adapter: adapter.name,
        domain: adapter.domain,
        profile_key: requestedProfileKey || "attached-site-session",
        target_id:
          requestedTargetId || String(matchingTab?.id ?? "mock-target-1"),
        message: `已检测到 ${adapter.domain} 的真实浏览器页面，Claw 可以直接复用当前会话执行。`,
      };
    }

    return {
      status: "requires_browser_runtime",
      adapter: adapter.name,
      domain: adapter.domain,
      message: `当前没有检测到已附着到真实浏览器的 ${adapter.domain} 页面，请先去浏览器工作台连接浏览器并打开目标页面。`,
      report_hint:
        "Claw 不会在后台偷偷启动浏览器；请先进入浏览器工作台连接真实浏览器并打开目标站点页面，再返回 Claw 重试。",
    };
  },
  site_get_adapter_catalog_status: () => mockSiteAdapterCatalogStatus,
  site_apply_adapter_catalog_bootstrap: (args: any) => {
    const payload =
      args?.request?.payload?.siteAdapterCatalog ??
      args?.request?.payload?.site_adapter_catalog ??
      args?.request?.payload;
    const syncedAdapters: Array<{ name?: unknown }> = Array.isArray(
      payload?.adapters,
    )
      ? payload.adapters
      : [];
    mockServerSyncedSiteAdapters = syncedAdapters
      .map((adapter) =>
        normalizeMockSiteAdapterPayload(adapter, "server_synced"),
      )
      .filter(Boolean);
    mockSiteAdapterCatalogStatus = buildMockSiteCatalogStatus(
      "server_synced",
      mockServerSyncedSiteAdapters.length,
      {
        exists: syncedAdapters.length > 0,
        registry_version:
          Number.isFinite(payload?.registry_version) &&
          payload.registry_version > 0
            ? payload.registry_version
            : 1,
        directory: "/tmp/lime/site-adapters/server-synced",
        catalog_version:
          payload?.catalogVersion ??
          payload?.catalog_version ??
          payload?.version ??
          null,
        tenant_id: payload?.tenantId ?? payload?.tenant_id ?? null,
        synced_at: payload?.syncedAt ?? payload?.synced_at ?? null,
      },
    );
    return mockSiteAdapterCatalogStatus;
  },
  site_import_adapter_yaml_bundle: (args: any) => {
    const yamlBundle = String(args?.request?.yaml_bundle ?? "").trim();
    if (!yamlBundle) {
      throw new Error("请先输入外部来源 YAML");
    }

    mockImportedSiteAdapters = parseMockImportedYamlBundle(
      yamlBundle,
      typeof args?.request?.source_version === "string"
        ? args.request.source_version
        : undefined,
    );
    const catalogVersion =
      typeof args?.request?.catalog_version === "string"
        ? args.request.catalog_version
        : undefined;
    mockSiteAdapterCatalogStatus = buildMockSiteCatalogStatus(
      "imported",
      mockImportedSiteAdapters.length,
      {
        directory: "/tmp/lime/site-adapters/imported",
        catalog_version: catalogVersion ?? null,
      },
    );
    return {
      directory: "/tmp/lime/site-adapters/imported",
      adapter_count: mockImportedSiteAdapters.length,
      catalog_version: catalogVersion,
    };
  },
  site_clear_adapter_catalog_cache: () => {
    mockImportedSiteAdapters = [];
    mockServerSyncedSiteAdapters = [];
    mockSiteAdapterCatalogStatus = buildMockSiteCatalogStatus(
      "bundled",
      mockBundledSiteAdapters.length,
      {
        exists: false,
      },
    );
    return mockSiteAdapterCatalogStatus;
  },
  site_run_adapter: (args: any) => {
    const request = args?.request ?? {};
    const adapterName = String(request.adapter_name ?? "");
    if (
      request.require_attached_session &&
      (!request.profile_key || request.profile_key === "general_browser_assist")
    ) {
      return {
        ok: false,
        adapter: adapterName || "github/search",
        domain: adapterName.startsWith("zhihu")
          ? "www.zhihu.com"
          : "github.com",
        profile_key: request.profile_key ?? "general_browser_assist",
        entry_url: "https://example.com/mock-site",
        error_code: "attached_session_required",
        error_message:
          "当前执行链路没有附着到真实浏览器会话，请先去浏览器工作台连接目标站点后重试。",
        report_hint:
          "Claw 不会在后台偷偷启动浏览器；请先进入浏览器工作台连接真实浏览器并打开目标站点页面，再返回 Claw 重试。",
      };
    }
    const targetContentId =
      typeof request.content_id === "string" && request.content_id.trim()
        ? request.content_id.trim()
        : null;
    const targetProjectId =
      typeof request.project_id === "string" && request.project_id.trim()
        ? request.project_id.trim()
        : null;
    const title =
      typeof request.save_title === "string" && request.save_title.trim()
        ? request.save_title.trim()
        : targetContentId
          ? "当前主稿"
          : `站点采集 ${adapterName || "github/search"} 2026-03-25 12:00:00`;
    const bundleRootDir =
      adapterName === "x/article-export"
        ? "exports/x-article-export/mock-article"
        : undefined;
    return {
      ok: true,
      adapter: adapterName || "github/search",
      domain: adapterName.startsWith("zhihu") ? "www.zhihu.com" : "github.com",
      profile_key: request.profile_key ?? "general_browser_assist",
      session_id: "mock-cdp-session",
      target_id: "mock-target-1",
      entry_url: "https://example.com/mock-site",
      source_url: "https://example.com/mock-site",
      data: {
        items: [
          {
            title: "Mock item 1",
            url: "https://example.com/mock-site/item-1",
          },
          {
            title: "Mock item 2",
            url: "https://example.com/mock-site/item-2",
          },
        ],
        echo_args: request.args ?? {},
      },
      saved_content:
        targetContentId || targetProjectId
          ? {
              content_id: targetContentId || "mock-site-content-1",
              project_id: targetProjectId || "mock-current-project",
              title,
              project_root_path: "/mock/projects/current",
              bundle_relative_dir: bundleRootDir,
              markdown_relative_path: bundleRootDir
                ? `${bundleRootDir}/index.md`
                : undefined,
              images_relative_dir: bundleRootDir
                ? `${bundleRootDir}/images`
                : undefined,
              meta_relative_path: bundleRootDir
                ? `${bundleRootDir}/meta.json`
                : undefined,
              image_count: bundleRootDir ? 3 : undefined,
            }
          : undefined,
      saved_project_id:
        targetContentId || targetProjectId
          ? targetProjectId || "mock-current-project"
          : undefined,
      saved_by: targetContentId
        ? "explicit_content"
        : targetProjectId
          ? "explicit_project"
          : undefined,
    };
  },
  site_debug_run_adapter: (args: any) => {
    const request = args?.request ?? {};
    const adapterName = String(request.adapter_name ?? "");
    return {
      ok: true,
      adapter: adapterName || "github/search",
      domain: adapterName.startsWith("zhihu") ? "www.zhihu.com" : "github.com",
      profile_key: request.profile_key ?? "general_browser_assist",
      session_id: "mock-cdp-session",
      target_id: "mock-target-1",
      entry_url: "https://example.com/mock-site",
      source_url: "https://example.com/mock-site",
      data: {
        items: [
          {
            title: "Mock item 1",
            url: "https://example.com/mock-site/item-1",
          },
        ],
        echo_args: request.args ?? {},
        debug: true,
      },
    };
  },
  site_save_adapter_result: (args: any) => {
    const request = args?.request ?? {};
    const contentId =
      typeof request.content_id === "string" && request.content_id.trim()
        ? request.content_id.trim()
        : null;
    const projectId =
      typeof request.project_id === "string" && request.project_id.trim()
        ? request.project_id.trim()
        : "mock-project";
    const adapterName = String(
      request.run_request?.adapter_name ??
        request.result?.adapter ??
        "github/search",
    );
    const title =
      typeof request.save_title === "string" && request.save_title.trim()
        ? request.save_title.trim()
        : contentId
          ? "当前主稿"
          : `站点采集 ${adapterName} 2026-03-25 12:00:00`;
    return {
      content_id: contentId || "mock-site-content-1",
      project_id: projectId,
      title,
    };
  },
  open_chrome_profile_window: () => ({
    success: true,
    reused: false,
    browser_source: "system",
    browser_path:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    profile_dir: "/tmp/lime/chrome_profiles/search_google",
    remote_debugging_port: 13001,
    pid: 12345,
    devtools_http_url: "http://127.0.0.1:13001/json/version",
  }),
  get_chrome_bridge_endpoint_info: () => ({
    server_running: true,
    host: "127.0.0.1",
    port: 8999,
    observer_ws_url:
      "ws://127.0.0.1:8999/lime-chrome-observer/Lime_Key=proxy_cast",
    control_ws_url:
      "ws://127.0.0.1:8999/lime-chrome-control/Lime_Key=proxy_cast",
    bridge_key: "proxy_cast",
  }),
  get_chrome_bridge_status: () => mockChromeBridgeStatus,
  disconnect_browser_connector_session: () => {
    const disconnectedObserverCount = mockChromeBridgeStatus.observer_count;
    const disconnectedControlCount = mockChromeBridgeStatus.control_count;
    mockChromeBridgeStatus = {
      ...mockChromeBridgeStatus,
      observer_count: 0,
      control_count: 0,
      pending_command_count: 0,
      observers: [],
      controls: [],
      pending_commands: [],
    };
    return {
      disconnected_observer_count: disconnectedObserverCount,
      disconnected_control_count: disconnectedControlCount,
      status: mockChromeBridgeStatus,
    };
  },
  get_browser_connector_settings_cmd: () => mockBrowserConnectorSettings,
  set_browser_connector_install_root_cmd: (args: any) => {
    const installRootDir =
      typeof args?.request?.install_root_dir === "string" &&
      args.request.install_root_dir.trim()
        ? args.request.install_root_dir.trim()
        : "/mock/path/to/connectors";
    mockBrowserConnectorSettings = {
      ...mockBrowserConnectorSettings,
      install_root_dir: installRootDir,
      install_dir: `${installRootDir}/Lime Browser Connector`,
    };
    mockBrowserConnectorInstallStatus = {
      ...mockBrowserConnectorInstallStatus,
      install_root_dir: installRootDir,
      install_dir: `${installRootDir}/Lime Browser Connector`,
    };
    return mockBrowserConnectorSettings;
  },
  set_browser_connector_enabled_cmd: (args: any) => {
    mockBrowserConnectorSettings = {
      ...mockBrowserConnectorSettings,
      enabled: args?.enabled !== false,
    };
    return mockBrowserConnectorSettings;
  },
  set_system_connector_enabled_cmd: (args: any) => {
    const request = args?.request ?? {};
    mockBrowserConnectorSettings = {
      ...mockBrowserConnectorSettings,
      system_connectors: mockBrowserConnectorSettings.system_connectors.map(
        (connector) =>
          connector.id === request.id
            ? {
                ...connector,
                enabled: request.enabled === true,
                authorization_status:
                  request.enabled === true ? "authorized" : "not_determined",
                last_error: null,
              }
            : connector,
      ),
    };
    return mockBrowserConnectorSettings;
  },
  set_browser_action_capability_enabled_cmd: (args: any) => {
    const request = args?.request ?? {};
    const targetKey = normalizeMockBrowserActionCapabilityKey(
      String(request.key ?? ""),
    );
    mockBrowserConnectorSettings = {
      ...mockBrowserConnectorSettings,
      browser_action_capabilities:
        mockBrowserConnectorSettings.browser_action_capabilities.map(
          (capability) =>
            capability.key === targetKey
              ? {
                  ...capability,
                  enabled: request.enabled !== false,
                }
              : capability,
        ),
    };
    mockBrowserBackendsStatus = buildMockBrowserBackendsStatus();
    return mockBrowserConnectorSettings;
  },
  get_browser_connector_install_status_cmd: () =>
    mockBrowserConnectorInstallStatus,
  install_browser_connector_extension_cmd: (args: any) => {
    const installRootDir =
      typeof args?.request?.install_root_dir === "string" &&
      args.request.install_root_dir.trim()
        ? args.request.install_root_dir.trim()
        : (mockBrowserConnectorSettings.install_root_dir ??
          "/mock/path/to/connectors");
    const installDir = `${installRootDir}/Lime Browser Connector`;
    mockBrowserConnectorSettings = {
      ...mockBrowserConnectorSettings,
      install_root_dir: installRootDir,
      install_dir: installDir,
    };
    mockBrowserConnectorInstallStatus = {
      ...mockBrowserConnectorInstallStatus,
      status: "installed",
      install_root_dir: installRootDir,
      install_dir: installDir,
      installed_name: "Lime Browser Connector",
      installed_version: mockBrowserConnectorInstallStatus.bundled_version,
      message: "已安装最新版本浏览器连接器",
    };
    return {
      install_root_dir: installRootDir,
      install_dir: installDir,
      bundled_name: "Lime Browser Connector",
      bundled_version: mockBrowserConnectorInstallStatus.bundled_version,
      installed_version: mockBrowserConnectorInstallStatus.bundled_version,
      auto_config_path: `${installDir}/auto_config.json`,
    };
  },
  open_browser_extensions_page_cmd: () => true,
  open_browser_remote_debugging_page_cmd: () => true,
  open_browser_connector_guide_window: () => ({ success: true }),
  chrome_bridge_execute_command: (args: any) => ({
    success: true,
    request_id: `mock-${Date.now()}`,
    command: args?.request?.command ?? "get_page_info",
    message: "mock command result",
    data:
      args?.request?.command === "list_tabs"
        ? {
            tabs: mockExistingSessionTabs,
          }
        : undefined,
    page_info: {
      title: "Mock Page",
      url: "https://example.com",
      markdown: "# Mock Page\nURL: https://example.com",
      updated_at: new Date().toISOString(),
    },
  }),
  get_browser_backend_policy: () => ({
    priority: ["aster_compat", "lime_extension_bridge", "cdp_direct"],
    auto_fallback: true,
  }),
  set_browser_backend_policy: (args: any) => ({
    priority: args?.policy?.priority ?? [
      "aster_compat",
      "lime_extension_bridge",
      "cdp_direct",
    ],
    auto_fallback: args?.policy?.auto_fallback ?? true,
  }),
  get_browser_backends_status: () => mockBrowserBackendsStatus,
  list_cdp_targets: () => [
    {
      id: "mock-target-1",
      title: "Mock Target",
      url: "https://example.com",
      target_type: "page",
      web_socket_debugger_url:
        "ws://127.0.0.1:13001/devtools/page/mock-target-1",
      devtools_frontend_url:
        "/devtools/inspector.html?ws=127.0.0.1:13001/devtools/page/mock-target-1",
    },
  ],
  open_cdp_session: (args: any) => ({
    session_id: "mock-cdp-session",
    profile_key: args?.request?.profile_key ?? "search_google",
    target_id: args?.request?.target_id ?? "mock-target-1",
    target_title: "Mock Target",
    target_url: "https://example.com",
    remote_debugging_port: 13001,
    ws_debugger_url: "ws://127.0.0.1:13001/devtools/page/mock-target-1",
    devtools_frontend_url:
      "/devtools/inspector.html?ws=127.0.0.1:13001/devtools/page/mock-target-1",
    stream_mode: undefined,
    last_page_info: {
      title: "Mock Target",
      url: "https://example.com",
      markdown: "# Mock Target\nURL: https://example.com",
      updated_at: new Date().toISOString(),
    },
    last_event_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    connected: true,
  }),
  close_cdp_session: () => true,
  start_browser_stream: (args: any) => ({
    session_id: args?.request?.session_id ?? "mock-cdp-session",
    profile_key: "search_google",
    target_id: "mock-target-1",
    target_title: "Mock Target",
    target_url: "https://example.com",
    remote_debugging_port: 13001,
    ws_debugger_url: "ws://127.0.0.1:13001/devtools/page/mock-target-1",
    stream_mode: args?.request?.mode ?? "both",
    last_page_info: {
      title: "Mock Target",
      url: "https://example.com",
      markdown: "# Mock Target\nURL: https://example.com",
      updated_at: new Date().toISOString(),
    },
    last_event_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    connected: true,
  }),
  stop_browser_stream: (args: any) => ({
    session_id: args?.request?.session_id ?? "mock-cdp-session",
    profile_key: "search_google",
    target_id: "mock-target-1",
    target_title: "Mock Target",
    target_url: "https://example.com",
    remote_debugging_port: 13001,
    ws_debugger_url: "ws://127.0.0.1:13001/devtools/page/mock-target-1",
    stream_mode: undefined,
    last_page_info: {
      title: "Mock Target",
      url: "https://example.com",
      markdown: "# Mock Target\nURL: https://example.com",
      updated_at: new Date().toISOString(),
    },
    last_event_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    connected: true,
  }),
  get_browser_session_state: (args: any) =>
    syncBrowserSessionState(resolveMockBrowserSessionState(args)),
  take_over_browser_session: (args: any) =>
    syncBrowserSessionState(
      resolveMockBrowserSessionState(args, {
        lifecycle_state: "human_controlling",
        control_mode: "human",
        human_reason: args?.request?.human_reason ?? "已进入人工接管",
      }),
    ),
  release_browser_session: (args: any) =>
    syncBrowserSessionState(
      resolveMockBrowserSessionState(args, {
        lifecycle_state: "waiting_for_human",
        control_mode: "shared",
        human_reason: args?.request?.human_reason ?? "等待你确认是否继续执行",
      }),
    ),
  resume_browser_session: (args: any) =>
    syncBrowserSessionState(
      resolveMockBrowserSessionState(args, {
        lifecycle_state: "agent_resuming",
        control_mode: "agent",
        human_reason: args?.request?.human_reason ?? "人工处理完成，继续执行",
      }),
      { finalize: true },
    ),
  get_browser_event_buffer: () => ({
    events: [],
    next_cursor: 0,
  }),
  browser_execute_action: (args: any) => {
    const backend = args?.request?.backend ?? "aster_compat";
    const action = args?.request?.action ?? "navigate";
    const requestId = `browser-mock-${Date.now()}`;

    if (action === "list_tabs") {
      return {
        success: true,
        backend,
        action,
        request_id: requestId,
        data: {
          message: "mock tabs loaded",
          data: {
            tabs: mockExistingSessionTabs,
          },
        },
        attempts: [
          {
            backend,
            success: true,
            message: "执行成功",
          },
        ],
      };
    }

    if (action === "switch_tab") {
      const target = String(args?.request?.args?.target ?? "");
      mockExistingSessionTabs = mockExistingSessionTabs.map((tab) => ({
        ...tab,
        active: String(tab.id) === target,
      }));
      const activeTab =
        mockExistingSessionTabs.find((tab) => tab.active) ??
        mockExistingSessionTabs[0];
      return {
        success: true,
        backend,
        action,
        request_id: requestId,
        data: {
          message: "mock tab switched",
          page_info: activeTab
            ? {
                title: activeTab.title,
                url: activeTab.url,
                markdown: `# ${activeTab.title}\nURL: ${activeTab.url}`,
                updated_at: now(),
              }
            : undefined,
        },
        attempts: [
          {
            backend,
            success: true,
            message: "执行成功",
          },
        ],
      };
    }

    return {
      success: true,
      backend,
      session_id: "mock-cdp-session",
      target_id: "mock-target-1",
      action,
      request_id: requestId,
      data: {
        message: "mock browser action executed",
      },
      attempts: [
        {
          backend,
          success: true,
          message: "执行成功",
        },
      ],
    };
  },
  get_browser_action_audit_logs: (args: any) => {
    const now = new Date().toISOString();
    const count = Math.min(Number(args?.limit ?? 20), 200);
    return Array.from({ length: Math.max(1, count) }, (_, idx) => ({
      id: `audit-mock-${idx + 1}`,
      created_at: now,
      kind: idx % 2 === 0 ? "launch" : "action",
      action: idx % 2 === 0 ? undefined : "navigate",
      profile_key: "default",
      profile_id: idx % 2 === 0 ? "browser-profile-general" : undefined,
      requested_backend: idx % 2 === 0 ? undefined : "aster_compat",
      selected_backend: idx % 2 === 0 ? undefined : "aster_compat",
      success: true,
      attempts:
        idx % 2 === 0
          ? []
          : [
              {
                backend: "aster_compat",
                success: true,
                message: "执行成功",
              },
            ],
      environment_preset_id:
        idx % 2 === 0 ? "browser-environment-us-desktop" : undefined,
      environment_preset_name: idx % 2 === 0 ? "美区桌面" : undefined,
      target_id: idx % 2 === 0 ? "mock-target-1" : undefined,
      session_id: idx % 2 === 0 ? "mock-cdp-session" : undefined,
      url: idx % 2 === 0 ? "https://example.com" : undefined,
      reused: idx % 2 === 0 ? false : undefined,
      open_window: idx % 2 === 0 ? true : undefined,
      stream_mode: idx % 2 === 0 ? "both" : undefined,
      browser_source: idx % 2 === 0 ? "system" : undefined,
      remote_debugging_port: idx % 2 === 0 ? 13001 : undefined,
    }));
  },
};
