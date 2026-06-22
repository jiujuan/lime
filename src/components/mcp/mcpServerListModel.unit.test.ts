import { describe, expect, it } from "vitest";
import type { McpServerInfo, McpServerRuntimeStatus } from "@/lib/api/mcp";
import {
  getMcpServerCapabilityBadges,
  getMcpServerConnectionPhaseLabelKey,
  getMcpServerListSummary,
  getMcpServerOAuthViewModel,
  getMcpServerStatusText,
} from "./mcpServerListModel";

function createRuntimeStatus(
  overrides: Partial<McpServerRuntimeStatus> = {},
): McpServerRuntimeStatus {
  return {
    name: "docs",
    transport: "streamable_http",
    enabled: true,
    is_running: false,
    required: false,
    supports_parallel_tool_calls: false,
    startup_timeout: 30,
    tool_timeout: 30,
    disabled_tools: [],
    auth_status: {
      mode: "none",
      available: true,
    },
    ...overrides,
  };
}

function createServer(overrides: Partial<McpServerInfo> = {}): McpServerInfo {
  return {
    id: "server-docs",
    name: "docs",
    description: "Docs MCP server",
    config: {
      type: "streamable_http",
      url: "https://example.com/mcp",
    },
    is_running: false,
    enabled_lime: true,
    enabled_claude: false,
    enabled_codex: true,
    enabled_gemini: false,
    ...overrides,
  };
}

describe("mcpServerListModel", () => {
  it("统计服务器总数与运行中数量", () => {
    expect(
      getMcpServerListSummary([
        createServer({ name: "docs", is_running: true }),
        createServer({ name: "github", is_running: false }),
      ]),
    ).toEqual({
      total: 2,
      running: 1,
    });
  });

  it("投影运行状态文案参数", () => {
    expect(
      getMcpServerStatusText(
        createServer({
          is_running: true,
          server_info: {
            name: "docs-runtime",
            version: "1.2.3",
            supports_tools: true,
            supports_prompts: false,
            supports_resources: true,
          },
        }),
      ),
    ).toEqual({
      key: "settings.mcpPage.runtime.serverList.status.runningVersion",
      values: { name: "docs-runtime", version: "1.2.3" },
    });

    expect(getMcpServerStatusText(createServer({ is_running: true })).key).toBe(
      "settings.mcpPage.runtime.serverList.status.running",
    );
    expect(
      getMcpServerStatusText(createServer({ is_running: false })).key,
    ).toBe("settings.mcpPage.runtime.serverList.status.stopped");
  });

  it("只给非 idle 连接阶段返回展示 key", () => {
    expect(getMcpServerConnectionPhaseLabelKey("starting")).toBe(
      "settings.mcpPage.runtime.serverList.connectionPhase.starting",
    );
    expect(getMcpServerConnectionPhaseLabelKey("stopping")).toBe(
      "settings.mcpPage.runtime.serverList.connectionPhase.stopping",
    );
    expect(getMcpServerConnectionPhaseLabelKey("reconnecting")).toBe(
      "settings.mcpPage.runtime.serverList.connectionPhase.reconnecting",
    );
    expect(getMcpServerConnectionPhaseLabelKey("idle")).toBeNull();
    expect(getMcpServerConnectionPhaseLabelKey(undefined)).toBeNull();
  });

  it("投影 OAuth 登录、未支持和已授权状态", () => {
    expect(
      getMcpServerOAuthViewModel(
        createServer({
          runtime_status: createRuntimeStatus({
            auth_status: {
              mode: "oauth",
              available: true,
              reason_code: "oauth_login_required",
              action_plan: {
                kind: "oauth_login",
                state: "login_required",
                scopes: ["docs.read"],
              },
            },
          }),
        }),
      ),
    ).toEqual({ state: "login-required", scopes: ["docs.read"] });

    expect(
      getMcpServerOAuthViewModel(
        createServer({
          runtime_status: createRuntimeStatus({
            auth_status: {
              mode: "oauth",
              available: false,
              reason_code: "oauth_runtime_not_implemented",
            },
          }),
        }),
      ).state,
    ).toBe("unsupported");

    expect(
      getMcpServerOAuthViewModel(
        createServer({
          runtime_status: createRuntimeStatus({
            auth_status: {
              mode: "oauth",
              available: true,
            },
          }),
        }),
      ).state,
    ).toBe("authorized");

    expect(getMcpServerOAuthViewModel(createServer()).state).toBe("none");
  });

  it("只为运行中的服务器投影能力标签", () => {
    const serverInfo = {
      name: "docs",
      version: "1.0.0",
      supports_tools: true,
      supports_prompts: false,
      supports_resources: true,
    };

    expect(
      getMcpServerCapabilityBadges(
        createServer({ is_running: true, server_info: serverInfo }),
      ),
    ).toEqual(["tools", "resources"]);

    expect(
      getMcpServerCapabilityBadges(
        createServer({ is_running: false, server_info: serverInfo }),
      ),
    ).toEqual([]);
  });
});
