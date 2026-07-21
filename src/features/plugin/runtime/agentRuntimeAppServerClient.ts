import {
  createAgentRuntimeClientFromSessionGateway,
  type AgentRuntimeClientFromGatewayOptions,
  type AgentRuntimeLifecycleClient,
  type AgentRuntimeSessionGateway,
} from "@limecloud/agent-runtime-client/sessionGateway";

import {
  createAppServerClient,
  type AppServerThreadStartParams,
  type AppServerThreadStartResponse,
  type AppServerClient,
  type AppServerRequestResult,
} from "@/lib/api/appServer";
import type { AgentRuntimeSessionResolver } from "./agentRuntimeCapabilityHost";

type PluginRuntimeAppServerClient = Pick<
  AppServerClient,
  | "startSession"
  | "startTurn"
  | "steerTurn"
  | "readThread"
  | "updateThreadSettings"
  | "setThreadMemoryMode"
  | "cancelTurn"
  | "respondAction"
>;

export interface PluginRuntimeHostOptions {
  runtimeClient: AgentRuntimeLifecycleClient;
  ensureSession: AgentRuntimeSessionResolver;
}

const createAgentRuntimeClientFromPluginGateway =
  createAgentRuntimeClientFromSessionGateway as (
    appServerClient: AgentRuntimeSessionGateway,
    options?: AgentRuntimeClientFromGatewayOptions,
  ) => AgentRuntimeLifecycleClient;

export function createPluginRuntimeClientFromAppServer(
  appServerClient: PluginRuntimeAppServerClient,
  options?: AgentRuntimeClientFromGatewayOptions,
): AgentRuntimeLifecycleClient {
  return createAgentRuntimeClientFromPluginGateway(
    createPluginRuntimeSessionGateway(appServerClient),
    options,
  );
}

export function createPluginRuntimeSessionResolver(
  appServerClient: Pick<AppServerClient, "startSession">,
): AgentRuntimeSessionResolver {
  return async (request) => {
    const response = await appServerClient.startSession(
      pluginThreadStartParams(request),
    );
    const identity = readThreadIdentity(response);
    if (!identity) {
      throw new Error(
        "thread/start did not return a valid Plugin runtime identity",
      );
    }
    return identity;
  };
}

export function createDefaultPluginRuntimeHostOptions(
  appServerClient: PluginRuntimeAppServerClient = createAppServerClient(),
): PluginRuntimeHostOptions {
  return {
    runtimeClient: createPluginRuntimeClientFromAppServer(appServerClient),
    ensureSession: createPluginRuntimeSessionResolver(appServerClient),
  };
}

function pluginThreadStartParams(
  request: Parameters<AgentRuntimeSessionResolver>[0],
): AppServerThreadStartParams {
  return {
    serviceName:
      request.title?.trim() || request.prompt?.trim() || request.taskKind,
    threadSource: "plugin",
    historyMode: "paginated",
  };
}

function readThreadIdentity(
  response: AppServerRequestResult<AppServerThreadStartResponse>,
): { sessionId: string; threadId: string } | undefined {
  const threadId = response.result.thread.id?.trim();
  const sessionId = response.result.thread.sessionId?.trim();
  return threadId && sessionId ? { sessionId, threadId } : undefined;
}

function createPluginRuntimeSessionGateway(
  appServerClient: PluginRuntimeAppServerClient,
): AgentRuntimeSessionGateway {
  return {
    startTurn: (params) => appServerClient.startTurn(params),
    steerTurn: (params) => appServerClient.steerTurn(params),
    readThread: (params) => appServerClient.readThread(params),
    updateThreadSettings: (params) =>
      appServerClient.updateThreadSettings(params),
    setThreadMemoryMode: (params) =>
      appServerClient.setThreadMemoryMode(params),
    cancelTurn: (params) => appServerClient.cancelTurn(params),
    respondAction: (params) => appServerClient.respondAction(params),
  };
}
