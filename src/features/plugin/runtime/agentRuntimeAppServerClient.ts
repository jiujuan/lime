import {
  createAgentRuntimeClientFromSessionGateway,
  type AgentRuntimeClientFromGatewayOptions,
  type AgentRuntimeLifecycleClient,
  type AgentRuntimeSessionGateway,
} from "@limecloud/agent-runtime-client/sessionGateway";

import {
  createAppServerClient,
  type AppServerAgentSessionStartResponse,
  type AppServerClient,
  type AppServerRequestResult,
} from "@/lib/api/appServer";
import type { AgentRuntimeSessionResolver } from "./agentRuntimeCapabilityHost";

type PluginRuntimeAppServerClient = Pick<
  AppServerClient,
  "startSession" | "startTurn" | "readSession" | "cancelTurn" | "respondAction"
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
    const response = await appServerClient.startSession({
      appId: request.appId,
      workspaceId: request.workspaceId,
      businessObjectRef: {
        kind: "plugin.task",
        id: buildPluginRuntimeBusinessObjectId(request),
        title: request.title || request.prompt || request.taskKind,
        metadata: {
          source: "plugin_runtime_page",
          appId: request.appId,
          entryKey: request.entryKey,
          taskId: request.taskId,
          taskKind: request.taskKind,
          prompt: request.prompt,
          metadata: request.metadata,
        },
      },
    });
    const sessionId = readSessionId(response);
    if (!sessionId) {
      throw new Error(
        "agentSession/start did not return an Plugin runtime session",
      );
    }
    return sessionId;
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

function buildPluginRuntimeBusinessObjectId(
  request: Parameters<AgentRuntimeSessionResolver>[0],
): string {
  const taskId = request.taskId?.trim();
  if (taskId) {
    return `${request.appId}:${taskId}`;
  }
  return `${request.appId}:${request.taskKind}:${Date.now()}`;
}

function readSessionId(
  response: AppServerRequestResult<AppServerAgentSessionStartResponse>,
): string | undefined {
  const sessionId = response.result.session.sessionId?.trim();
  return sessionId || undefined;
}

function createPluginRuntimeSessionGateway(
  appServerClient: PluginRuntimeAppServerClient,
): AgentRuntimeSessionGateway {
  return {
    startTurn: (params) => appServerClient.startTurn(params),
    readSession: (params) => appServerClient.readSession(params),
    cancelTurn: (params) => appServerClient.cancelTurn(params),
    respondAction: (params) => appServerClient.respondAction(params),
  };
}
