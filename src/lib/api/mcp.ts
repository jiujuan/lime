import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_MCP_PROMPT_GET,
  METHOD_MCP_PROMPT_LIST,
  METHOD_MCP_RESOURCE_LIST,
  METHOD_MCP_RESOURCE_READ,
  METHOD_MCP_SERVER_LIST,
  METHOD_MCP_SERVER_START,
  METHOD_MCP_SERVER_STATUS_LIST,
  METHOD_MCP_SERVER_STOP,
  METHOD_MCP_TOOL_CALL,
  METHOD_MCP_TOOL_CALL_WITH_CALLER,
  METHOD_MCP_TOOL_LIST,
  METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
  METHOD_MCP_TOOL_SEARCH,
  type McpPromptGetResponse as AppServerMcpPromptGetResponse,
  type McpPromptListResponse as AppServerMcpPromptListResponse,
  type McpResourceListResponse as AppServerMcpResourceListResponse,
  type McpResourceReadResponse as AppServerMcpResourceReadResponse,
  type McpServerListResponse as AppServerMcpServerListResponse,
  type McpServerStatusListResponse as AppServerMcpServerStatusListResponse,
  type McpToolCallResponse as AppServerMcpToolCallResponse,
  type McpToolListResponse as AppServerMcpToolListResponse,
} from "../../../packages/app-server-client/src/protocol";

// ============================================================================
// 基础类型定义
// ============================================================================

export interface McpServer {
  id: string;
  name: string;
  server_config: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  };
  description?: string;
  enabled_lime: boolean;
  enabled_claude: boolean;
  enabled_codex: boolean;
  enabled_gemini: boolean;
  created_at?: number;
}

/** MCP 服务器能力信息 */
export interface McpServerCapabilities {
  name: string;
  version: string;
  supports_tools: boolean;
  supports_prompts: boolean;
  supports_resources: boolean;
}

/** MCP 服务器信息（包含运行状态） */
export interface McpServerInfo {
  id: string;
  name: string;
  description?: string;
  config: McpServer["server_config"];
  is_running: boolean;
  server_info?: McpServerCapabilities;
  enabled_lime: boolean;
  enabled_claude: boolean;
  enabled_codex: boolean;
  enabled_gemini: boolean;
}

// ============================================================================
// 工具类型
// ============================================================================

/** MCP 工具定义。`name` 当前格式固定为 `mcp__<server>__<tool>`。 */
export interface McpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  server_name: string;
  deferred_loading?: boolean;
  always_visible?: boolean;
  allowed_callers?: string[];
  input_examples?: unknown[];
  tags?: string[];
}

/** MCP 内容类型 */
export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "resource"; uri: string; text?: string; blob?: string };

/** MCP 工具调用结果 */
export interface McpToolResult {
  content: McpContent[];
  is_error: boolean;
}

/** 从 runtime 名 `mcp__<server>__<tool>` 提取 inner tool 名。 */
export function getMcpInnerToolName(
  toolName: string,
  serverName?: string,
): string {
  if (!toolName) return toolName;

  if (serverName) {
    const prefixedName = `mcp__${serverName}__`;
    if (toolName.startsWith(prefixedName)) {
      return toolName.slice(prefixedName.length);
    }
  }

  if (!toolName.startsWith("mcp__")) {
    return toolName;
  }

  const parts = toolName.split("__");
  return parts.length >= 3 ? parts.slice(2).join("__") : toolName;
}

type McpAppServerClient = Pick<AppServerClient, "request">;

async function requestMcpAppServer<T>(
  method: string,
  params: unknown = {},
  appServerClient: McpAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

function failClosedMcpCurrentGap(command: string): never {
  throw new Error(`${command} 尚未接入 App Server MCP current 通道`);
}

function assertArrayField<T>(
  method: string,
  response: unknown,
  field: string,
): T[] {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray((response as Record<string, unknown>)[field])
  ) {
    throw new Error(`${method} did not return ${field}`);
  }
  return (response as Record<string, T[]>)[field];
}

// ============================================================================
// 提示词类型
// ============================================================================

/** MCP 提示词参数 */
export interface McpPromptArgument {
  name: string;
  description?: string;
  required: boolean;
}

/** MCP 提示词定义 */
export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments: McpPromptArgument[];
  server_name: string;
}

/** MCP 提示词消息 */
export interface McpPromptMessage {
  role: string;
  content: McpContent;
}

/** MCP 提示词结果 */
export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

// ============================================================================
// 资源类型
// ============================================================================

/** MCP 资源定义 */
export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mime_type?: string;
  server_name: string;
}

/** MCP 资源内容 */
export interface McpResourceContent {
  uri: string;
  mime_type?: string;
  text?: string;
  blob?: string;
}

// ============================================================================
// API 封装
// ============================================================================

export const mcpApi = {
  // --------------------------------------------------------------------------
  // 配置管理 API
  // --------------------------------------------------------------------------

  getServers: (): Promise<McpServer[]> =>
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_LIST,
    ).then((response) =>
      assertArrayField<McpServer>(METHOD_MCP_SERVER_LIST, response, "servers"),
    ),

  addServer: (server: McpServer): Promise<void> =>
    Promise.resolve().then(() => {
      void server;
      failClosedMcpCurrentGap("add_mcp_server");
    }),

  updateServer: (server: McpServer): Promise<void> =>
    Promise.resolve().then(() => {
      void server;
      failClosedMcpCurrentGap("update_mcp_server");
    }),

  deleteServer: (id: string): Promise<void> =>
    Promise.resolve().then(() => {
      void id;
      failClosedMcpCurrentGap("delete_mcp_server");
    }),

  toggleServer: (
    id: string,
    appType: string,
    enabled: boolean,
  ): Promise<void> =>
    Promise.resolve().then(() => {
      void id;
      void appType;
      void enabled;
      failClosedMcpCurrentGap("toggle_mcp_server");
    }),

  /** 从外部应用导入 MCP 配置 */
  importFromApp: (appType: string): Promise<number> =>
    Promise.resolve().then(() => {
      void appType;
      failClosedMcpCurrentGap("import_mcp_from_app");
    }),

  /** 同步所有 MCP 配置到实际配置文件 */
  syncAllToLive: (): Promise<void> =>
    Promise.resolve().then(() =>
      failClosedMcpCurrentGap("sync_all_mcp_to_live"),
    ),

  // --------------------------------------------------------------------------
  // 生命周期管理 API
  // --------------------------------------------------------------------------

  /** 获取所有服务器及其运行状态 */
  listServersWithStatus: (): Promise<McpServerInfo[]> =>
    requestMcpAppServer<AppServerMcpServerStatusListResponse>(
      METHOD_MCP_SERVER_STATUS_LIST,
    ).then((response) =>
      assertArrayField<McpServerInfo>(
        METHOD_MCP_SERVER_STATUS_LIST,
        response,
        "servers",
      ),
    ),

  /** 启动 MCP 服务器 */
  startServer: (name: string): Promise<void> =>
    requestMcpAppServer(METHOD_MCP_SERVER_START, { name }).then(
      () => undefined,
    ),

  /** 停止 MCP 服务器 */
  stopServer: (name: string): Promise<void> =>
    requestMcpAppServer(METHOD_MCP_SERVER_STOP, { name }).then(() => undefined),

  // --------------------------------------------------------------------------
  // 工具管理 API
  // --------------------------------------------------------------------------

  /** 获取所有可用工具，返回名格式为 `mcp__<server>__<tool>`。 */
  listTools: (): Promise<McpToolDefinition[]> =>
    requestMcpAppServer<AppServerMcpToolListResponse>(
      METHOD_MCP_TOOL_LIST,
    ).then((response) =>
      assertArrayField<McpToolDefinition>(
        METHOD_MCP_TOOL_LIST,
        response,
        "tools",
      ),
    ),

  /** 按调用上下文获取可见工具（支持 deferred_loading） */
  listToolsForContext: (
    caller?: string,
    includeDeferred = false,
  ): Promise<McpToolDefinition[]> =>
    requestMcpAppServer<AppServerMcpToolListResponse>(
      METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
      {
        caller,
        includeDeferred,
      },
    ).then((response) =>
      assertArrayField<McpToolDefinition>(
        METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
        response,
        "tools",
      ),
    ),

  /** 工具搜索（Tool Search），返回名格式为 `mcp__<server>__<tool>`。 */
  searchTools: (
    query: string,
    caller?: string,
    limit = 10,
  ): Promise<McpToolDefinition[]> =>
    requestMcpAppServer<AppServerMcpToolListResponse>(METHOD_MCP_TOOL_SEARCH, {
      query,
      caller,
      limit,
    }).then((response) =>
      assertArrayField<McpToolDefinition>(
        METHOD_MCP_TOOL_SEARCH,
        response,
        "tools",
      ),
    ),

  /** 调用工具，`toolName` 当前格式为 `mcp__<server>__<tool>`。 */
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> =>
    requestMcpAppServer<AppServerMcpToolCallResponse>(METHOD_MCP_TOOL_CALL, {
      toolName,
      arguments: args,
    }),

  /** 带 caller 校验调用工具，`toolName` 当前格式为 `mcp__<server>__<tool>`。 */
  callToolWithCaller: (
    toolName: string,
    args: Record<string, unknown>,
    caller?: string,
  ): Promise<McpToolResult> =>
    requestMcpAppServer<AppServerMcpToolCallResponse>(
      METHOD_MCP_TOOL_CALL_WITH_CALLER,
      {
        toolName,
        arguments: args,
        caller,
      },
    ),

  // --------------------------------------------------------------------------
  // 提示词管理 API
  // --------------------------------------------------------------------------

  /** 获取所有可用提示词 */
  listPrompts: (): Promise<McpPromptDefinition[]> =>
    requestMcpAppServer<AppServerMcpPromptListResponse>(
      METHOD_MCP_PROMPT_LIST,
    ).then((response) =>
      assertArrayField<McpPromptDefinition>(
        METHOD_MCP_PROMPT_LIST,
        response,
        "prompts",
      ),
    ),

  /** 获取提示词内容 */
  getPrompt: (
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpPromptResult> =>
    requestMcpAppServer<AppServerMcpPromptGetResponse>(METHOD_MCP_PROMPT_GET, {
      name,
      arguments: args,
    }),

  // --------------------------------------------------------------------------
  // 资源管理 API
  // --------------------------------------------------------------------------

  /** 获取所有可用资源 */
  listResources: (): Promise<McpResourceDefinition[]> =>
    requestMcpAppServer<AppServerMcpResourceListResponse>(
      METHOD_MCP_RESOURCE_LIST,
    ).then((response) =>
      assertArrayField<McpResourceDefinition>(
        METHOD_MCP_RESOURCE_LIST,
        response,
        "resources",
      ),
    ),

  /** 读取资源内容 */
  readResource: (uri: string): Promise<McpResourceContent> =>
    requestMcpAppServer<AppServerMcpResourceReadResponse>(
      METHOD_MCP_RESOURCE_READ,
      { uri },
    ),
};
