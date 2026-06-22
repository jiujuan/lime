import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_MCP_PROMPT_GET,
  METHOD_MCP_PROMPT_LIST,
  METHOD_MCP_RESOURCE_LIST,
  METHOD_MCP_RESOURCE_READ,
  METHOD_MCP_RESOURCE_SUBSCRIBE,
  METHOD_MCP_RESOURCE_UNSUBSCRIBE,
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
  type McpResourceSubscriptionResponse as AppServerMcpResourceSubscriptionResponse,
  type McpServerImportFromAppResponse as AppServerMcpServerImportFromAppResponse,
  type McpServerLifecycleResponse as AppServerMcpServerLifecycleResponse,
  type McpServerListResponse as AppServerMcpServerListResponse,
  type McpServerOauthLoginResponse as AppServerMcpServerOauthLoginResponse,
  type McpServerStatusListResponse as AppServerMcpServerStatusListResponse,
  type McpToolCallResponse as AppServerMcpToolCallResponse,
  type McpToolListResponse as AppServerMcpToolListResponse,
} from "../../../packages/app-server-client/src/protocol";
import type {
  McpPromptDefinition,
  McpPromptResult,
  McpResourceContent,
  McpResourceDefinition,
  McpResourceListResult,
  McpServer,
  McpServerInfo,
  McpServerOAuthLoginOptions,
  McpServerOAuthLoginResponse,
  McpToolDefinition,
  McpToolResult,
} from "./mcpTypes";
import {
  assertArrayField,
  assertEmptyResponse,
  assertLifecycleResponse,
  assertMcpPromptResult,
  assertMcpResourceContent,
  assertMcpResourceListResponse,
  assertMcpToolResult,
  assertOAuthLoginResponse,
  assertServerListResponse,
} from "./mcpResponseGuards";
export * from "./mcpTypes";

type McpAppServerClient = Pick<AppServerClient, "request">;

async function requestMcpAppServer<T>(
  method: string,
  params: unknown = {},
  appServerClient: McpAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
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
      assertMcpResourceListResponse(METHOD_MCP_RESOURCE_LIST, response),
    ).then((response) => response.resources),

  /** 获取所有可用资源及资源模板 */
  listResourcesWithTemplates: (): Promise<McpResourceListResult> =>
    requestMcpAppServer<AppServerMcpResourceListResponse>(
      METHOD_MCP_RESOURCE_LIST,
    ).then((response) =>
      assertMcpResourceListResponse(METHOD_MCP_RESOURCE_LIST, response),
    ),

  /** 读取资源内容 */
  readResource: (uri: string): Promise<McpResourceContent> =>
    requestMcpAppServer<AppServerMcpResourceReadResponse>(
      METHOD_MCP_RESOURCE_READ,
      { uri },
    ).then((response) =>
      assertMcpResourceContent(METHOD_MCP_RESOURCE_READ, response),
    ),

  /** 订阅资源更新 */
  subscribeResource: (uri: string): Promise<void> =>
    requestMcpAppServer<AppServerMcpResourceSubscriptionResponse>(
      METHOD_MCP_RESOURCE_SUBSCRIBE,
      { uri },
    ).then((response) => {
      assertEmptyResponse(METHOD_MCP_RESOURCE_SUBSCRIBE, response);
      return undefined;
    }),

  /** 取消订阅资源更新 */
  unsubscribeResource: (uri: string): Promise<void> =>
    requestMcpAppServer<AppServerMcpResourceSubscriptionResponse>(
      METHOD_MCP_RESOURCE_UNSUBSCRIBE,
      { uri },
    ).then((response) => {
      assertEmptyResponse(METHOD_MCP_RESOURCE_UNSUBSCRIBE, response);
      return undefined;
    }),
};
