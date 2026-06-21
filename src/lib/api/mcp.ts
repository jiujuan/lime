import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_MCP_PROMPT_GET,
  METHOD_MCP_PROMPT_LIST,
  METHOD_MCP_RESOURCE_LIST,
  METHOD_MCP_RESOURCE_READ,
  METHOD_MCP_SERVER_CREATE,
  METHOD_MCP_SERVER_DELETE,
  METHOD_MCP_SERVER_ENABLED_SET,
  METHOD_MCP_SERVER_IMPORT_FROM_APP,
  METHOD_MCP_SERVER_LIST,
  METHOD_MCP_SERVER_OAUTH_LOGIN,
  METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
  METHOD_MCP_SERVER_START,
  METHOD_MCP_SERVER_STATUS_LIST,
  METHOD_MCP_SERVER_STOP,
  METHOD_MCP_SERVER_UPDATE,
  METHOD_MCP_TOOL_CALL,
  METHOD_MCP_TOOL_CALL_WITH_CALLER,
  METHOD_MCP_TOOL_LIST,
  METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
  METHOD_MCP_TOOL_SEARCH,
  type McpPromptGetResponse as AppServerMcpPromptGetResponse,
  type McpPromptListResponse as AppServerMcpPromptListResponse,
  type McpResourceListResponse as AppServerMcpResourceListResponse,
  type McpResourceReadResponse as AppServerMcpResourceReadResponse,
  type McpServerImportFromAppResponse as AppServerMcpServerImportFromAppResponse,
  type McpServerLifecycleResponse as AppServerMcpServerLifecycleResponse,
  type McpServerListResponse as AppServerMcpServerListResponse,
  type McpServerOauthLoginResponse as AppServerMcpServerOauthLoginResponse,
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
  server_config: McpServerConfig;
  description?: string;
  enabled_lime: boolean;
  enabled_claude: boolean;
  enabled_codex: boolean;
  enabled_gemini: boolean;
  created_at?: number;
}

export type McpServerConfig =
  | {
      transport?: "stdio";
      type?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      timeout?: number;
      startup_timeout?: number;
      startupTimeout?: number;
      tool_timeout?: number;
      toolTimeout?: number;
      enabled?: boolean;
      enabled_tools?: string[];
      enabledTools?: string[];
      disabled_tools?: string[];
      disabledTools?: string[];
      required?: boolean;
      supports_parallel_tool_calls?: boolean;
      supportsParallelToolCalls?: boolean;
    }
  | {
      transport?: "streamable_http" | "streamable-http" | "http";
      type?: "streamable_http" | "streamable-http" | "http";
      url: string;
      bearer_token_env_var?: string;
      bearerTokenEnvVar?: string;
      http_headers?: Record<string, string>;
      httpHeaders?: Record<string, string>;
      env_http_headers?: Record<string, string>;
      envHttpHeaders?: Record<string, string>;
      timeout?: number;
      startup_timeout?: number;
      startupTimeout?: number;
      tool_timeout?: number;
      toolTimeout?: number;
      enabled?: boolean;
      enabled_tools?: string[];
      enabledTools?: string[];
      disabled_tools?: string[];
      disabledTools?: string[];
      required?: boolean;
      supports_parallel_tool_calls?: boolean;
      supportsParallelToolCalls?: boolean;
      scopes?: string[];
      oauth?: McpServerOAuthConfig;
      oauth_resource?: string;
      oauthResource?: string;
    };

export interface McpServerOAuthConfig {
  client_id?: string;
  clientId?: string;
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
  config: McpServerConfig;
  is_running: boolean;
  server_info?: McpServerCapabilities;
  runtime_status?: McpServerRuntimeStatus;
  enabled_lime: boolean;
  enabled_claude: boolean;
  enabled_codex: boolean;
  enabled_gemini: boolean;
}

export interface McpServerRuntimeStatus {
  name: string;
  transport: "stdio" | "streamable_http" | string;
  enabled: boolean;
  is_running: boolean;
  required: boolean;
  supports_parallel_tool_calls: boolean;
  startup_timeout: number;
  tool_timeout: number;
  enabled_tools?: string[];
  disabled_tools: string[];
  server_info?: McpServerCapabilities;
  auth_status: McpServerAuthStatus;
}

export interface McpServerAuthStatus {
  mode: "none" | "static_headers" | "oauth" | string;
  available: boolean;
  reason_code?:
    | "oauth_login_required"
    | "oauth_runtime_not_implemented"
    | string;
  action_plan?: McpServerAuthActionPlan;
}

export interface McpServerAuthActionPlan {
  kind: "oauth_login" | "oauth_elicitation" | string;
  state: "login_required" | "runtime_not_connected" | string;
  required_runtime?:
    | "mcp_server_oauth_login"
    | "mcp_elicitation_approval"
    | string;
  scopes?: string[];
  oauth_resource?: string;
  client_id?: string;
}

export interface McpServerOAuthLoginOptions {
  scopes?: string[];
  timeoutSecs?: number;
}

export interface McpServerOAuthLoginResponse {
  authorizationUrl: string;
  state: string;
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

function assertRecord(
  method: string,
  response: unknown,
  description: string,
): Record<string, unknown> {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error(`${method} did not return ${description}`);
  }
  return response as Record<string, unknown>;
}

function assertServerListResponse(method: string, response: unknown): void {
  assertArrayField<McpServer>(method, response, "servers");
}

function assertLifecycleResponse(method: string, response: unknown): void {
  const record = assertRecord(method, response, "empty lifecycle result");
  if (Object.keys(record).length > 0) {
    throw new Error(`${method} did not return empty lifecycle result`);
  }
}

function assertOAuthLoginResponse(
  method: string,
  response: unknown,
): McpServerOAuthLoginResponse {
  const record = assertRecord(method, response, "OAuth login response");
  if (
    typeof record.authorizationUrl !== "string" ||
    typeof record.state !== "string"
  ) {
    throw new Error(`${method} did not return OAuth login response`);
  }
  return response as McpServerOAuthLoginResponse;
}

function isMcpContent(value: unknown): value is McpContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "text") {
    return typeof record.text === "string";
  }
  if (record.type === "image") {
    return (
      typeof record.data === "string" && typeof record.mime_type === "string"
    );
  }
  if (record.type === "resource") {
    return (
      typeof record.uri === "string" &&
      (record.text === undefined || typeof record.text === "string") &&
      (record.blob === undefined || typeof record.blob === "string")
    );
  }
  return false;
}

function assertMcpToolResult(method: string, response: unknown): McpToolResult {
  const record = assertRecord(method, response, "tool result");
  if (
    !Array.isArray(record.content) ||
    typeof record.is_error !== "boolean" ||
    !record.content.every(isMcpContent)
  ) {
    throw new Error(`${method} did not return tool result`);
  }
  return response as McpToolResult;
}

function assertMcpPromptResult(
  method: string,
  response: unknown,
): McpPromptResult {
  const record = assertRecord(method, response, "prompt result");
  const hasValidDescription =
    record.description === undefined || typeof record.description === "string";
  const hasValidMessages =
    Array.isArray(record.messages) &&
    record.messages.every((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return false;
      }
      const messageRecord = message as Record<string, unknown>;
      return (
        typeof messageRecord.role === "string" &&
        isMcpContent(messageRecord.content)
      );
    });
  if (!hasValidDescription || !hasValidMessages) {
    throw new Error(`${method} did not return prompt result`);
  }
  return response as McpPromptResult;
}

function assertMcpResourceContent(
  method: string,
  response: unknown,
): McpResourceContent {
  const record = assertRecord(method, response, "resource content");
  if (
    typeof record.uri !== "string" ||
    (record.mime_type !== undefined && typeof record.mime_type !== "string") ||
    (record.text !== undefined && typeof record.text !== "string") ||
    (record.blob !== undefined && typeof record.blob !== "string")
  ) {
    throw new Error(`${method} did not return resource content`);
  }
  return response as McpResourceContent;
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
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_CREATE,
      { server },
    ).then((response) => {
      assertServerListResponse(METHOD_MCP_SERVER_CREATE, response);
      return undefined;
    }),

  updateServer: (server: McpServer): Promise<void> =>
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_UPDATE,
      { server },
    ).then((response) => {
      assertServerListResponse(METHOD_MCP_SERVER_UPDATE, response);
      return undefined;
    }),

  deleteServer: (id: string): Promise<void> =>
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_DELETE,
      { id },
    ).then((response) => {
      assertServerListResponse(METHOD_MCP_SERVER_DELETE, response);
      return undefined;
    }),

  toggleServer: (
    id: string,
    appType: string,
    enabled: boolean,
  ): Promise<void> =>
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_ENABLED_SET,
      {
        id,
        appType,
        enabled,
      },
    ).then((response) => {
      assertServerListResponse(METHOD_MCP_SERVER_ENABLED_SET, response);
      return undefined;
    }),

  /** 从外部应用导入 MCP 配置 */
  importFromApp: (appType: string): Promise<number> =>
    requestMcpAppServer<AppServerMcpServerImportFromAppResponse>(
      METHOD_MCP_SERVER_IMPORT_FROM_APP,
      { appType },
    ).then((response) => {
      if (typeof response.importedCount !== "number") {
        throw new Error(
          `${METHOD_MCP_SERVER_IMPORT_FROM_APP} did not return importedCount`,
        );
      }
      assertServerListResponse(METHOD_MCP_SERVER_IMPORT_FROM_APP, response);
      return response.importedCount;
    }),

  /** 同步所有 MCP 配置到实际配置文件 */
  syncAllToLive: (): Promise<void> =>
    requestMcpAppServer<AppServerMcpServerListResponse>(
      METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
    ).then((response) => {
      assertServerListResponse(METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE, response);
      return undefined;
    }),

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
    requestMcpAppServer<AppServerMcpServerLifecycleResponse>(
      METHOD_MCP_SERVER_START,
      { name },
    ).then((response) => {
      assertLifecycleResponse(METHOD_MCP_SERVER_START, response);
      return undefined;
    }),

  /** 停止 MCP 服务器 */
  stopServer: (name: string): Promise<void> =>
    requestMcpAppServer<AppServerMcpServerLifecycleResponse>(
      METHOD_MCP_SERVER_STOP,
      { name },
    ).then((response) => {
      assertLifecycleResponse(METHOD_MCP_SERVER_STOP, response);
      return undefined;
    }),

  /** 启动 streamable HTTP MCP OAuth 授权登录 */
  loginOAuthServer: (
    name: string,
    options: McpServerOAuthLoginOptions = {},
  ): Promise<McpServerOAuthLoginResponse> =>
    requestMcpAppServer<AppServerMcpServerOauthLoginResponse>(
      METHOD_MCP_SERVER_OAUTH_LOGIN,
      {
        name,
        ...(options.scopes ? { scopes: options.scopes } : {}),
        ...(options.timeoutSecs ? { timeoutSecs: options.timeoutSecs } : {}),
      },
    ).then((response) =>
      assertOAuthLoginResponse(METHOD_MCP_SERVER_OAUTH_LOGIN, response),
    ),

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
    }).then((response) => assertMcpToolResult(METHOD_MCP_TOOL_CALL, response)),

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
    ).then((response) =>
      assertMcpToolResult(METHOD_MCP_TOOL_CALL_WITH_CALLER, response),
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
    }).then((response) =>
      assertMcpPromptResult(METHOD_MCP_PROMPT_GET, response),
    ),

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
    ).then((response) =>
      assertMcpResourceContent(METHOD_MCP_RESOURCE_READ, response),
    ),
};
