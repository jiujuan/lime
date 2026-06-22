import type { McpServerInfo } from "@/lib/api/mcp";
import type { McpServerConnectionState } from "@/hooks/useMcp";

export interface McpServerListSummary {
  total: number;
  running: number;
}

export type McpServerStatusText =
  | {
      key: "settings.mcpPage.runtime.serverList.status.runningVersion";
      values: { name: string; version: string };
    }
  | {
      key:
        | "settings.mcpPage.runtime.serverList.status.running"
        | "settings.mcpPage.runtime.serverList.status.stopped";
      values?: undefined;
    };

export type McpServerConnectionPhaseLabelKey =
  | "settings.mcpPage.runtime.serverList.connectionPhase.starting"
  | "settings.mcpPage.runtime.serverList.connectionPhase.stopping"
  | "settings.mcpPage.runtime.serverList.connectionPhase.reconnecting";

export type McpServerOAuthState =
  | "none"
  | "login-required"
  | "unsupported"
  | "authorized";

export interface McpServerOAuthViewModel {
  state: McpServerOAuthState;
  scopes?: string[];
}

export type McpServerCapabilityBadge = "tools" | "prompts" | "resources";

export function getMcpServerListSummary(
  servers: readonly McpServerInfo[],
): McpServerListSummary {
  return {
    total: servers.length,
    running: servers.filter((server) => server.is_running).length,
  };
}

export function getMcpServerStatusText(
  server: McpServerInfo,
): McpServerStatusText {
  if (server.is_running && server.server_info) {
    return {
      key: "settings.mcpPage.runtime.serverList.status.runningVersion",
      values: {
        name: server.server_info.name,
        version: server.server_info.version,
      },
    };
  }

  return {
    key: server.is_running
      ? "settings.mcpPage.runtime.serverList.status.running"
      : "settings.mcpPage.runtime.serverList.status.stopped",
  };
}

export function getMcpServerConnectionPhaseLabelKey(
  phase: McpServerConnectionState["phase"] | undefined,
): McpServerConnectionPhaseLabelKey | null {
  switch (phase) {
    case "starting":
      return "settings.mcpPage.runtime.serverList.connectionPhase.starting";
    case "stopping":
      return "settings.mcpPage.runtime.serverList.connectionPhase.stopping";
    case "reconnecting":
      return "settings.mcpPage.runtime.serverList.connectionPhase.reconnecting";
    case "idle":
    case undefined:
      return null;
  }
}

export function getMcpServerOAuthViewModel(
  server: McpServerInfo,
): McpServerOAuthViewModel {
  const authStatus = server.runtime_status?.auth_status;
  const authPlan = authStatus?.action_plan;

  if (
    authStatus?.mode === "oauth" &&
    authStatus.reason_code === "oauth_login_required" &&
    authPlan?.kind === "oauth_login"
  ) {
    return {
      state: "login-required",
      scopes: authPlan.scopes,
    };
  }

  if (
    authStatus?.mode === "oauth" &&
    authStatus.reason_code === "oauth_runtime_not_implemented"
  ) {
    return { state: "unsupported" };
  }

  if (
    authStatus?.mode === "oauth" &&
    authStatus.available &&
    !authStatus.reason_code
  ) {
    return { state: "authorized" };
  }

  return { state: "none" };
}

export function getMcpServerCapabilityBadges(
  server: McpServerInfo,
): McpServerCapabilityBadge[] {
  if (!server.is_running || !server.server_info) {
    return [];
  }

  const badges: McpServerCapabilityBadge[] = [];
  if (server.server_info.supports_tools) badges.push("tools");
  if (server.server_info.supports_prompts) badges.push("prompts");
  if (server.server_info.supports_resources) badges.push("resources");
  return badges;
}
