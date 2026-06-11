import {
  createAgentRuntimeClientFromSessionGateway,
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

type AgentAppRuntimeAppServerClient = Pick<
  AppServerClient,
  "startSession" | "startTurn" | "readSession" | "cancelTurn" | "respondAction"
>;

export interface AgentAppRuntimeHostOptions {
  runtimeClient: AgentRuntimeLifecycleClient;
  ensureSession: AgentRuntimeSessionResolver;
}

const createAgentRuntimeClientFromAgentAppGateway =
  createAgentRuntimeClientFromSessionGateway as (
    appServerClient: AgentRuntimeSessionGateway,
  ) => AgentRuntimeLifecycleClient;

export function createAgentAppRuntimeClientFromAppServer(
  appServerClient: AgentAppRuntimeAppServerClient,
): AgentRuntimeLifecycleClient {
  return createAgentRuntimeClientFromAgentAppGateway(
    createAgentAppRuntimeSessionGateway(appServerClient),
  );
}

export function createAgentAppRuntimeSessionResolver(
  appServerClient: Pick<AppServerClient, "startSession">,
): AgentRuntimeSessionResolver {
  return async (request) => {
    const response = await appServerClient.startSession({
      appId: request.appId,
      workspaceId: request.workspaceId,
      businessObjectRef: {
        kind: "agent_app.task",
        id: buildAgentAppRuntimeBusinessObjectId(request),
        title: request.title || request.prompt || request.taskKind,
        metadata: {
          source: "agent_app_runtime_page",
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
        "agentSession/start did not return an Agent App runtime session",
      );
    }
    return sessionId;
  };
}

export function createDefaultAgentAppRuntimeHostOptions(
  appServerClient: AgentAppRuntimeAppServerClient = createAppServerClient(),
): AgentAppRuntimeHostOptions {
  return {
    runtimeClient: createAgentAppRuntimeClientFromAppServer(appServerClient),
    ensureSession: createAgentAppRuntimeSessionResolver(appServerClient),
  };
}

function buildAgentAppRuntimeBusinessObjectId(
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

function createAgentAppRuntimeSessionGateway(
  appServerClient: AgentAppRuntimeAppServerClient,
): AgentRuntimeSessionGateway {
  return {
    startTurn: (params) => appServerClient.startTurn(params),
    readSession: (params) => appServerClient.readSession(params),
    cancelTurn: (params) => appServerClient.cancelTurn(params),
    respondAction: (params) => appServerClient.respondAction(params),
  };
}
