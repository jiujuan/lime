type MockToolSpec = {
  name: string;
  description: string;
  capabilities: string[];
  source: string;
  tags: string[];
  input_examples_count: number;
  permission_plane?: "session_allowlist" | "parameter_restricted";
  workspace_default_allow?: boolean;
  execution_warning_policy?: string;
  execution_restriction_profile?: string;
  execution_sandbox_profile?: string;
};

export const DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES = [
  {
    key: "tabs_context_mcp",
    label: "标签页概览",
    description: "读取当前已附着标签页的上下文摘要。",
    group: "read",
    enabled: true,
  },
  {
    key: "list_tabs",
    label: "列出标签页",
    description: "列出当前浏览器标签页。",
    group: "read",
    enabled: true,
  },
  {
    key: "tabs_create_mcp",
    label: "新建标签页",
    description: "创建新的浏览器标签页。",
    group: "write",
    enabled: true,
  },
  {
    key: "read_page",
    label: "页面快照",
    description: "抓取当前页面快照。",
    group: "read",
    enabled: true,
  },
  {
    key: "get_page_text",
    label: "页面文本",
    description: "读取当前页面文本内容。",
    group: "read",
    enabled: true,
  },
  {
    key: "get_page_info",
    label: "页面信息",
    description: "读取页面标题、URL 与快照信息。",
    group: "read",
    enabled: true,
  },
  {
    key: "find",
    label: "页面内查找",
    description: "在当前页面中查找文本。",
    group: "read",
    enabled: true,
  },
  {
    key: "read_console_messages",
    label: "控制台消息",
    description: "读取浏览器控制台消息。",
    group: "read",
    enabled: true,
  },
  {
    key: "read_network_requests",
    label: "网络请求",
    description: "读取页面网络请求记录。",
    group: "read",
    enabled: true,
  },
  {
    key: "navigate",
    label: "导航",
    description: "导航到目标地址。",
    group: "write",
    enabled: true,
  },
  {
    key: "open_url",
    label: "打开链接",
    description: "直接打开目标链接。",
    group: "write",
    enabled: true,
  },
  {
    key: "click",
    label: "点击元素",
    description: "点击页面元素。",
    group: "write",
    enabled: true,
  },
  {
    key: "type",
    label: "输入文本",
    description: "向当前页面输入文本。",
    group: "write",
    enabled: true,
  },
  {
    key: "form_input",
    label: "表单输入",
    description: "按字段填写页面表单。",
    group: "write",
    enabled: true,
  },
  {
    key: "switch_tab",
    label: "切换标签页",
    description: "切换当前操作标签页。",
    group: "write",
    enabled: true,
  },
  {
    key: "scroll_page",
    label: "滚动页面",
    description: "滚动当前页面或容器。",
    group: "write",
    enabled: true,
  },
  {
    key: "refresh_page",
    label: "刷新页面",
    description: "刷新当前页面。",
    group: "write",
    enabled: true,
  },
  {
    key: "go_back",
    label: "返回上一页",
    description: "返回上一页。",
    group: "write",
    enabled: true,
  },
  {
    key: "go_forward",
    label: "前进到下一页",
    description: "前进到下一页。",
    group: "write",
    enabled: true,
  },
  {
    key: "javascript",
    label: "执行脚本",
    description: "在当前页面执行脚本。",
    group: "write",
    enabled: true,
  },
] as const;

const MOCK_PARAMETER_RESTRICTED_TOOL_NAMES = new Set([
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "NotebookEdit",
  "PowerShell",
  "LSP",
]);

function resolveMockToolPermissionPlane(
  tool: MockToolSpec,
): "session_allowlist" | "parameter_restricted" {
  if (tool.permission_plane) {
    return tool.permission_plane;
  }
  return MOCK_PARAMETER_RESTRICTED_TOOL_NAMES.has(tool.name)
    ? "parameter_restricted"
    : "session_allowlist";
}

function resolveMockWorkspaceDefaultAllow(tool: MockToolSpec): boolean {
  if (typeof tool.workspace_default_allow === "boolean") {
    return tool.workspace_default_allow;
  }
  return resolveMockToolPermissionPlane(tool) === "session_allowlist";
}

function resolveMockExecutionWarningPolicy(tool: MockToolSpec): string {
  if (tool.execution_warning_policy) {
    return tool.execution_warning_policy;
  }
  return ["Bash", "PowerShell"].includes(tool.name)
    ? "shell_command_risk"
    : "none";
}

function resolveMockExecutionRestrictionProfile(tool: MockToolSpec): string {
  if (tool.execution_restriction_profile) {
    return tool.execution_restriction_profile;
  }
  if (["Bash", "PowerShell"].includes(tool.name)) {
    return "workspace_shell_command";
  }
  if (
    ["Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit", "LSP"].includes(
      tool.name,
    )
  ) {
    return "workspace_path_required";
  }
  return "none";
}

function resolveMockExecutionSandboxProfile(tool: MockToolSpec): string {
  if (tool.execution_sandbox_profile) {
    return tool.execution_sandbox_profile;
  }
  return ["Bash", "PowerShell"].includes(tool.name)
    ? "workspace_command"
    : "none";
}

const CORE_MOCK_TOOL_SPECS: MockToolSpec[] = [
  {
    name: "ToolSearch",
    description: "搜索当前会话可用工具与能力清单。",
    capabilities: ["web_search"],
    source: "lime_injected",
    tags: ["search"],
    input_examples_count: 1,
  },
  {
    name: "ListMcpResourcesTool",
    description: "列出当前已连接 MCP 服务暴露的资源。",
    capabilities: ["web_search"],
    source: "lime_injected",
    tags: ["mcp", "resource", "list"],
    input_examples_count: 1,
  },
  {
    name: "ReadMcpResourceTool",
    description: "按 server 与 uri 读取指定 MCP 资源内容。",
    capabilities: ["web_search"],
    source: "lime_injected",
    tags: ["mcp", "resource", "read"],
    input_examples_count: 1,
  },
  {
    name: "Bash",
    description: "执行工作区命令并返回结果。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["command", "workspace"],
    input_examples_count: 1,
  },
  {
    name: "Read",
    description: "读取文件内容。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["read", "file"],
    input_examples_count: 1,
  },
  {
    name: "Write",
    description: "写入文件内容。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["write", "file"],
    input_examples_count: 1,
  },
  {
    name: "Edit",
    description: "按补丁方式编辑文件。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["edit", "file"],
    input_examples_count: 1,
  },
  {
    name: "Glob",
    description: "按模式列出匹配文件。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["search", "file"],
    input_examples_count: 1,
  },
  {
    name: "Grep",
    description: "在工作区中搜索文本。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["search", "text"],
    input_examples_count: 1,
  },
  {
    name: "WebFetch",
    description: "抓取指定网页内容。",
    capabilities: ["web_search"],
    source: "aster_builtin",
    tags: ["web", "fetch"],
    input_examples_count: 1,
    execution_restriction_profile: "safe_https_url_required",
  },
  {
    name: "WebSearch",
    description: "联网检索公开网页信息。",
    capabilities: ["web_search"],
    source: "aster_builtin",
    tags: ["research"],
    input_examples_count: 2,
    execution_restriction_profile: "safe_https_url_required",
  },
  {
    name: "AskUserQuestion",
    description: "向用户发起单轮最小必要澄清。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["clarify"],
    input_examples_count: 1,
  },
  {
    name: "SendUserMessage",
    description: "向用户发送一条主可见消息，可用于回复、进度同步或主动提醒。",
    capabilities: ["session_control"],
    source: "aster_builtin",
    tags: ["message", "user"],
    input_examples_count: 1,
  },
  {
    name: "StructuredOutput",
    description: "输出结构化最终答复。",
    capabilities: ["session_control"],
    source: "aster_builtin",
    tags: ["response", "output"],
    input_examples_count: 1,
    permission_plane: "session_allowlist",
    workspace_default_allow: false,
  },
  {
    name: "Agent",
    description: "在需要并行处理时派生子代理。",
    capabilities: ["delegation"],
    source: "lime_injected",
    tags: ["delegation"],
    input_examples_count: 1,
  },
  {
    name: "SendMessage",
    description: "向已存在的协作成员追加说明或指令。",
    capabilities: ["delegation"],
    source: "aster_builtin",
    tags: ["delegation"],
    input_examples_count: 1,
  },
  {
    name: "TeamCreate",
    description: "创建共享 task board 与 team 协作上下文。",
    capabilities: ["delegation"],
    source: "aster_builtin",
    tags: ["delegation", "team"],
    input_examples_count: 1,
  },
  {
    name: "TeamDelete",
    description: "删除当前 team 协作上下文。",
    capabilities: ["delegation"],
    source: "aster_builtin",
    tags: ["delegation", "team"],
    input_examples_count: 1,
  },
  {
    name: "ListPeers",
    description: "列出当前 team 中可直接通信的协作成员。",
    capabilities: ["delegation"],
    source: "aster_builtin",
    tags: ["delegation", "team"],
    input_examples_count: 1,
  },
  {
    name: "Skill",
    description: "加载并执行当前可用技能。",
    capabilities: ["skill_execution"],
    source: "aster_builtin",
    tags: ["skill"],
    input_examples_count: 1,
  },
  {
    name: "Workflow",
    description: "执行工作流脚本。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["workflow"],
    input_examples_count: 1,
  },
  {
    name: "TaskCreate",
    description: "创建结构化任务。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["task"],
    input_examples_count: 1,
  },
  {
    name: "TaskList",
    description: "查看结构化任务列表。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["task"],
    input_examples_count: 1,
  },
  {
    name: "TaskGet",
    description: "读取单个结构化任务。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["task"],
    input_examples_count: 1,
  },
  {
    name: "TaskUpdate",
    description: "更新结构化任务状态。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["task"],
    input_examples_count: 1,
  },
  {
    name: "TaskOutput",
    description: "读取任务输出结果。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["task", "output"],
    input_examples_count: 1,
  },
  {
    name: "TaskStop",
    description: "停止正在执行的任务。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["task"],
    input_examples_count: 1,
  },
  {
    name: "NotebookEdit",
    description: "编辑 notebook 单元内容。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["notebook"],
    input_examples_count: 1,
  },
  {
    name: "EnterPlanMode",
    description: "进入计划模式以拆解方案。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["planning"],
    input_examples_count: 1,
  },
  {
    name: "ExitPlanMode",
    description: "退出计划模式并继续执行。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["planning"],
    input_examples_count: 1,
  },
  {
    name: "EnterWorktree",
    description: "进入独立工作树执行隔离修改。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["worktree"],
    input_examples_count: 1,
  },
  {
    name: "ExitWorktree",
    description: "退出独立工作树并回到主工作区。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["worktree"],
    input_examples_count: 1,
  },
  {
    name: "Config",
    description: "查看或调整当前运行配置。",
    capabilities: ["session_control"],
    source: "aster_builtin",
    tags: ["config"],
    input_examples_count: 1,
  },
  {
    name: "Sleep",
    description: "等待一段时间后继续执行。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["timing"],
    input_examples_count: 1,
  },
  {
    name: "PowerShell",
    description: "在 PowerShell 环境中执行命令。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["command", "windows"],
    input_examples_count: 1,
  },
  {
    name: "LSP",
    description: "查询语言服务返回的语义信息。",
    capabilities: ["workspace_io"],
    source: "aster_builtin",
    tags: ["code", "lsp"],
    input_examples_count: 1,
  },
  {
    name: "RemoteTrigger",
    description: "管理或触发远程 trigger 执行。",
    capabilities: ["execution"],
    source: "aster_builtin",
    tags: ["trigger", "remote"],
    input_examples_count: 1,
  },
  {
    name: "CronCreate",
    description: "创建新的定时触发器。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["trigger", "schedule"],
    input_examples_count: 1,
  },
  {
    name: "CronList",
    description: "查看当前可用的定时触发器。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["trigger", "schedule"],
    input_examples_count: 1,
  },
  {
    name: "CronDelete",
    description: "删除指定的定时触发器。",
    capabilities: ["planning"],
    source: "aster_builtin",
    tags: ["trigger", "schedule"],
    input_examples_count: 1,
  },
];

const WORKBENCH_MOCK_TOOL_SPECS: MockToolSpec[] = [
  {
    name: "social_generate_cover_image",
    description: "为内容生成封面图片。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "image", "cover"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_video_generation_task",
    description: "发起视频生成。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "video", "task"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_audio_generation_task",
    description: "发起配音生成。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "audio", "voice", "task"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_transcription_task",
    description: "创建转写任务。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "audio", "transcription"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_broadcast_generation_task",
    description: "发起口播生成。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "audio", "broadcast"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_cover_generation_task",
    description: "发起封面生成。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "image", "cover"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_modal_resource_search_task",
    description: "创建素材检索任务。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "resource", "search"],
    input_examples_count: 1,
  },
  {
    name: "lime_search_web_images",
    description: "联网搜索图片素材。",
    capabilities: ["web_search"],
    source: "lime_injected",
    tags: ["content", "image", "search"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_image_generation_task",
    description: "发起图片生成。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "image", "task"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_url_parse_task",
    description: "创建链接解析任务。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "url", "task"],
    input_examples_count: 1,
  },
  {
    name: "lime_create_typesetting_task",
    description: "创建排版任务。",
    capabilities: ["content_creation"],
    source: "lime_injected",
    tags: ["content", "typesetting", "task"],
    input_examples_count: 1,
  },
  {
    name: "lime_run_service_skill",
    description:
      "兼容旧会话的服务型做法工具。current 主链改为本地 Agent 直接执行。",
    capabilities: ["execution"],
    source: "lime_injected",
    tags: ["service_skill", "compat"],
    input_examples_count: 1,
  },
];

const BROWSER_ASSIST_MOCK_TOOL_SPECS: MockToolSpec[] = [
  {
    name: "lime_site_list",
    description: "列出可用站点能力。",
    capabilities: ["browser_runtime", "web_search"],
    source: "lime_injected",
    tags: ["site", "browser", "list"],
    input_examples_count: 1,
  },
  {
    name: "lime_site_recommend",
    description: "推荐适合当前目标的站点能力。",
    capabilities: ["browser_runtime", "web_search"],
    source: "lime_injected",
    tags: ["site", "browser", "recommend"],
    input_examples_count: 1,
  },
  {
    name: "lime_site_search",
    description: "搜索站点能力。",
    capabilities: ["browser_runtime", "web_search"],
    source: "lime_injected",
    tags: ["site", "browser", "search"],
    input_examples_count: 1,
  },
  {
    name: "lime_site_info",
    description: "查看站点能力详情。",
    capabilities: ["browser_runtime", "web_search"],
    source: "lime_injected",
    tags: ["site", "browser", "info"],
    input_examples_count: 1,
  },
  {
    name: "lime_site_run",
    description: "执行站点能力。",
    capabilities: ["browser_runtime", "web_search"],
    source: "lime_injected",
    tags: ["site", "browser", "run"],
    input_examples_count: 1,
  },
];

const BROWSER_RUNTIME_PREFIX_CATALOG_ENTRY = {
  name: "mcp__lime-browser__",
  profiles: ["browser_assist"],
  capabilities: ["browser_runtime"],
  lifecycle: "current",
  source: "browser_compatibility",
  permission_plane: "caller_filtered",
  workspace_default_allow: false,
  execution_warning_policy: "none",
  execution_warning_policy_source: "default",
  execution_restriction_profile: "none",
  execution_restriction_profile_source: "default",
  execution_sandbox_profile: "none",
  execution_sandbox_profile_source: "default",
} as const;

function listEnabledBrowserAssistCapabilityKeys(): string[] {
  return DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES.filter(
    (capability) => capability.enabled,
  )
    .map((capability) => capability.key)
    .sort();
}

function isLoadedBrowserAssistCapability(key: string): boolean {
  return key === "navigate";
}

function listEnabledBrowserAssistCapabilities() {
  return [...DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES]
    .filter((capability) => capability.enabled)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildMockAgentRuntimeToolInventory(request?: {
  caller?: string;
  workbench?: boolean;
  browserAssist?: boolean;
}) {
  const caller = request?.caller?.trim() || "assistant";
  const surface = {
    workbench: request?.workbench === true,
    browser_assist: request?.browserAssist === true,
  };
  const toolSpecs: MockToolSpec[] = [
    ...CORE_MOCK_TOOL_SPECS,
    ...(surface.workbench ? WORKBENCH_MOCK_TOOL_SPECS : []),
    ...(surface.browser_assist ? BROWSER_ASSIST_MOCK_TOOL_SPECS : []),
  ];

  const catalogTools = [
    ...toolSpecs.map((tool) => ({
      name: tool.name,
      profiles: [
        surface.workbench &&
        WORKBENCH_MOCK_TOOL_SPECS.some((entry) => entry.name === tool.name)
          ? "workbench"
          : surface.browser_assist &&
              BROWSER_ASSIST_MOCK_TOOL_SPECS.some(
                (entry) => entry.name === tool.name,
              )
            ? "browser_assist"
            : "core",
      ],
      capabilities: [...tool.capabilities],
      lifecycle: "current",
      source: tool.source,
      permission_plane: resolveMockToolPermissionPlane(tool),
      workspace_default_allow: resolveMockWorkspaceDefaultAllow(tool),
      execution_warning_policy: resolveMockExecutionWarningPolicy(tool),
      execution_warning_policy_source: "default",
      execution_restriction_profile:
        resolveMockExecutionRestrictionProfile(tool),
      execution_restriction_profile_source: "default",
      execution_sandbox_profile: resolveMockExecutionSandboxProfile(tool),
      execution_sandbox_profile_source: "default",
    })),
    ...(surface.browser_assist ? [BROWSER_RUNTIME_PREFIX_CATALOG_ENTRY] : []),
  ];

  const registryTools = toolSpecs.map((tool) => ({
    name: tool.name,
    description: tool.description,
    catalog_entry_name: tool.name,
    catalog_source: tool.source,
    catalog_lifecycle: "current",
    catalog_permission_plane: resolveMockToolPermissionPlane(tool),
    catalog_workspace_default_allow: resolveMockWorkspaceDefaultAllow(tool),
    catalog_execution_warning_policy: resolveMockExecutionWarningPolicy(tool),
    catalog_execution_warning_policy_source: "default",
    catalog_execution_restriction_profile:
      resolveMockExecutionRestrictionProfile(tool),
    catalog_execution_restriction_profile_source: "default",
    catalog_execution_sandbox_profile: resolveMockExecutionSandboxProfile(tool),
    catalog_execution_sandbox_profile_source: "default",
    deferred_loading: false,
    always_visible: true,
    allowed_callers: [caller],
    tags: [...tool.tags],
    input_examples_count: tool.input_examples_count,
    caller_allowed: true,
    visible_in_context: true,
  }));
  registryTools.sort((left, right) => left.name.localeCompare(right.name));

  const extensionSurfaces = surface.browser_assist
    ? [
        {
          extension_name: "mcp__lime-browser",
          description: "浏览器协助桥接工具集。",
          source_kind: "mcp_bridge",
          deferred_loading: false,
          allowed_caller: caller,
          available_tools: listEnabledBrowserAssistCapabilityKeys(),
          always_expose_tools: ["navigate"],
          loaded_tools: ["mcp__lime-browser__navigate"],
          searchable_tools: listEnabledBrowserAssistCapabilityKeys().map(
            (key) => `mcp__lime-browser__${key}`,
          ),
        },
      ]
    : [];
  const extensionTools = surface.browser_assist
    ? listEnabledBrowserAssistCapabilityKeys().map((key) => {
        const loaded = isLoadedBrowserAssistCapability(key);
        return {
          name: `mcp__lime-browser__${key}`,
          description:
            DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES.find(
              (capability) => capability.key === key,
            )?.description || "浏览器协助工具。",
          extension_name: "mcp__lime-browser",
          source_kind: "mcp_bridge",
          deferred_loading: !loaded,
          allowed_caller: caller,
          status: loaded ? "loaded" : "deferred",
          caller_allowed: true,
          visible_in_context: loaded,
        };
      })
    : [];
  const mcpTools = surface.browser_assist
    ? listEnabledBrowserAssistCapabilities().map((capability) => {
        const loaded = isLoadedBrowserAssistCapability(capability.key);
        return {
          server_name: "lime-browser",
          name: `mcp__lime-browser__${capability.key}`,
          description: capability.description,
          deferred_loading: !loaded,
          always_visible: loaded,
          allowed_callers: [caller],
          tags: ["browser", capability.group],
          input_examples_count: 1,
          caller_allowed: true,
          visible_in_context: loaded,
        };
      })
    : [];
  const runtimeTools: Array<{
    name: string;
    description: string;
    source_kind:
      | "registry_native"
      | "current_surface"
      | "runtime_extension"
      | "mcp";
    source_label?: string;
    status?: string;
    catalog_entry_name?: string;
    catalog_source?: string;
    catalog_lifecycle?: string;
    catalog_permission_plane?: string;
    catalog_workspace_default_allow?: boolean;
    deferred_loading: boolean;
    always_visible: boolean;
    allowed_callers: string[];
    tags: string[];
    input_examples_count: number;
    caller_allowed: boolean;
    visible_in_context: boolean;
  }> = [];
  const pushRuntimeTool = (tool: (typeof runtimeTools)[number]) => {
    if (
      runtimeTools.some(
        (entry) => entry.name.toLowerCase() === tool.name.toLowerCase(),
      )
    ) {
      return;
    }
    runtimeTools.push(tool);
  };
  registryTools.forEach((entry) => {
    pushRuntimeTool({
      name: entry.name,
      description: entry.description,
      source_kind: "registry_native",
      catalog_entry_name: entry.catalog_entry_name,
      catalog_source: entry.catalog_source,
      catalog_lifecycle: entry.catalog_lifecycle,
      catalog_permission_plane: entry.catalog_permission_plane,
      catalog_workspace_default_allow: entry.catalog_workspace_default_allow,
      deferred_loading: entry.deferred_loading,
      always_visible: entry.always_visible,
      allowed_callers: entry.allowed_callers,
      tags: entry.tags,
      input_examples_count: entry.input_examples_count,
      caller_allowed: entry.caller_allowed,
      visible_in_context: entry.visible_in_context,
    });
  });
  extensionTools.forEach((entry) => {
    pushRuntimeTool({
      name: entry.name,
      description: entry.description,
      source_kind: "runtime_extension",
      source_label: entry.extension_name,
      status: entry.status,
      deferred_loading: entry.deferred_loading,
      always_visible: false,
      allowed_callers: entry.allowed_caller ? [entry.allowed_caller] : [],
      tags: [],
      input_examples_count: 0,
      caller_allowed: entry.caller_allowed,
      visible_in_context: entry.visible_in_context,
    });
  });
  mcpTools.forEach((entry) => {
    pushRuntimeTool({
      name: entry.name,
      description: entry.description,
      source_kind: "mcp",
      source_label: entry.server_name,
      deferred_loading: entry.deferred_loading,
      always_visible: entry.always_visible,
      allowed_callers: entry.allowed_callers,
      tags: entry.tags,
      input_examples_count: entry.input_examples_count,
      caller_allowed: entry.caller_allowed,
      visible_in_context: entry.visible_in_context,
    });
  });
  runtimeTools.sort((left, right) => left.name.localeCompare(right.name));

  const defaultAllowedTools = registryTools
    .filter((entry) => entry.catalog_workspace_default_allow)
    .map((entry) => entry.name);
  defaultAllowedTools.sort((left, right) => left.localeCompare(right));

  return {
    request: {
      caller,
      surface,
    },
    agent_initialized: false,
    warnings: [
      "当前展示的是浏览器 fallback mock 工具库存；如需完整运行时状态，请保持 DevBridge 后端在线。",
    ],
    mcp_servers: surface.browser_assist ? ["lime-browser"] : [],
    default_allowed_tools: defaultAllowedTools,
    counts: {
      catalog_total: catalogTools.length,
      catalog_current_total: catalogTools.length,
      catalog_compat_total: 0,
      catalog_deprecated_total: 0,
      default_allowed_total: defaultAllowedTools.length,
      runtime_total: runtimeTools.length,
      runtime_visible_total: runtimeTools.filter(
        (entry) => entry.visible_in_context,
      ).length,
      registry_total: registryTools.length,
      registry_visible_total: registryTools.filter(
        (entry) => entry.visible_in_context,
      ).length,
      registry_catalog_unmapped_total: 0,
      extension_surface_total: extensionSurfaces.length,
      extension_mcp_bridge_total: extensionSurfaces.length,
      extension_runtime_total: 0,
      extension_tool_total: extensionTools.length,
      extension_tool_visible_total: extensionTools.filter(
        (entry) => entry.visible_in_context,
      ).length,
      mcp_server_total: surface.browser_assist ? 1 : 0,
      mcp_tool_total: mcpTools.length,
      mcp_tool_visible_total: mcpTools.filter(
        (entry) => entry.visible_in_context,
      ).length,
    },
    catalog_tools: catalogTools,
    registry_tools: registryTools,
    runtime_tools: runtimeTools,
    extension_surfaces: extensionSurfaces,
    extension_tools: extensionTools,
    mcp_tools: mcpTools,
  };
}

export const runtimeToolInventoryMocks: Record<
  string,
  (args?: {
    request?: {
      caller?: string;
      workbench?: boolean;
      browserAssist?: boolean;
    };
  }) => any
> = {
  agent_runtime_get_tool_inventory: (args) =>
    buildMockAgentRuntimeToolInventory(args?.request),
};
