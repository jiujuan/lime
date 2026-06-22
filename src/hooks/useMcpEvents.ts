import { safeListen } from "@/lib/api/bridgeEvents";
import type { UnlistenFn } from "@/lib/desktop-host/event";
import type { McpServerCapabilities, McpToolDefinition } from "@/lib/api/mcp";

interface McpServerStartedPayload {
  server_name: string;
  server_info?: McpServerCapabilities;
}

interface McpServerStoppedPayload {
  server_name: string;
}

interface McpServerErrorPayload {
  server_name: string;
  error: string;
}

interface McpToolsUpdatedPayload {
  tools: McpToolDefinition[];
}

interface McpResourcesUpdatedPayload {
  server_name: string;
}

interface McpResourceUpdatedPayload {
  server_name: string;
  uri: string;
}

interface McpOAuthCompletedPayload {
  server_name: string;
}

export interface McpServerConnectionState {
  phase: "idle" | "starting" | "stopping" | "reconnecting";
  error: string | null;
  updatedAt: number | null;
}

export interface McpOAuthCompletionState {
  serverName: string;
  completedAt: number;
}

export interface SetupMcpEventListenersOptions {
  isMounted: () => boolean;
  updateServerConnectionState: (
    serverName: string,
    nextState: Partial<McpServerConnectionState> & {
      phase: McpServerConnectionState["phase"];
    },
  ) => void;
  refreshServers: () => void;
  refreshTools: () => void;
  refreshResources: () => void;
  setError: (error: string) => void;
  setTools: (tools: McpToolDefinition[]) => void;
  setOAuthCompletion: (completion: McpOAuthCompletionState) => void;
}

export async function setupMcpEventListeners({
  isMounted,
  updateServerConnectionState,
  refreshServers,
  refreshTools,
  refreshResources,
  setError,
  setTools,
  setOAuthCompletion,
}: SetupMcpEventListenersOptions): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = [];

  try {
    const unlistenStarted = await safeListen<McpServerStartedPayload>(
      "mcp:server_started",
      (event) => {
        console.log("[useMcp] 服务器已启动:", event.payload.server_name);
        updateServerConnectionState(event.payload.server_name, {
          phase: "idle",
        });
        refreshServers();
        refreshTools();
      },
    );
    unlisteners.push(unlistenStarted);

    const unlistenStopped = await safeListen<McpServerStoppedPayload>(
      "mcp:server_stopped",
      (event) => {
        console.log("[useMcp] 服务器已停止:", event.payload.server_name);
        updateServerConnectionState(event.payload.server_name, {
          phase: "idle",
        });
        refreshServers();
        refreshTools();
      },
    );
    unlisteners.push(unlistenStopped);

    const unlistenError = await safeListen<McpServerErrorPayload>(
      "mcp:server_error",
      (event) => {
        console.error(
          "[useMcp] 服务器错误:",
          event.payload.server_name,
          event.payload.error,
        );
        if (isMounted()) {
          setError(`${event.payload.server_name}: ${event.payload.error}`);
        }
        updateServerConnectionState(event.payload.server_name, {
          phase: "idle",
          error: event.payload.error,
        });
      },
    );
    unlisteners.push(unlistenError);

    const unlistenTools = await safeListen<McpToolsUpdatedPayload>(
      "mcp:tools_updated",
      (event) => {
        console.log("[useMcp] 工具列表已更新:", event.payload.tools.length);
        if (isMounted()) {
          setTools(event.payload.tools);
        }
      },
    );
    unlisteners.push(unlistenTools);

    const unlistenResources = await safeListen<McpResourcesUpdatedPayload>(
      "mcp:resources_updated",
      (event) => {
        console.log("[useMcp] 资源列表已更新:", event.payload.server_name);
        refreshResources();
      },
    );
    unlisteners.push(unlistenResources);

    const unlistenResource = await safeListen<McpResourceUpdatedPayload>(
      "mcp:resource_updated",
      (event) => {
        console.log(
          "[useMcp] 资源已更新:",
          event.payload.server_name,
          event.payload.uri,
        );
        refreshResources();
      },
    );
    unlisteners.push(unlistenResource);

    const unlistenOAuthCompleted = await safeListen<McpOAuthCompletedPayload>(
      "mcp:oauth_completed",
      (event) => {
        console.log("[useMcp] OAuth 授权已完成:", event.payload.server_name);
        updateServerConnectionState(event.payload.server_name, {
          phase: "idle",
        });
        if (isMounted()) {
          setOAuthCompletion({
            serverName: event.payload.server_name,
            completedAt: Date.now(),
          });
        }
        refreshServers();
        refreshTools();
      },
    );
    unlisteners.push(unlistenOAuthCompleted);

    return unlisteners;
  } catch (error) {
    unlisteners.forEach((unlisten) => unlisten());
    throw error;
  }
}
