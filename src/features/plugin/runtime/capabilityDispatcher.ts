import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { CapabilityHost, LimeAppSdk } from "../sdk/CapabilityHost";
import type {
  PluginProjection,
  HostCapabilityProfile,
  LimeRuntimeProfile,
} from "../types";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  readWorkflowProjection,
  type PluginWorkflowReadClient,
} from "./workflowReadProjection";
import {
  normalizeStringList,
} from "./capabilityDispatcherClawCapabilities";
import { dispatchCapabilities } from "./capabilityDispatcherCapabilityDiscovery";
import { dispatchCloudSession } from "./capabilityDispatcherCloudSession";
import {
  attachConnectorAuthorizationHandoff,
  buildConnectorAuthorizationProjections,
  buildConnectorAuthorizationRequestEnvelope,
  buildConnectorRuntimeFacts,
  isHostFixtureConnectorAction,
} from "./capabilityDispatcherConnectorAuthorization";
import { readToolIntent } from "./capabilityDispatcherExecutionInput";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import { assertCapabilityDeclared } from "./capabilityDispatcherManifestGuards";
import {
  isRecord,
  readString,
} from "./capabilityDispatcherRecord";
import {
  dispatchContext,
  dispatchMemory,
  dispatchModels,
  dispatchSkills,
  dispatchTasks,
  dispatchUsage,
  filterRuntimeProjectionTasks,
} from "./capabilityDispatcherRuntimeDispatch";
import {
  buildRuntimeConnectors,
  buildRuntimeMcpTools,
  buildRuntimeToolRuns,
} from "./capabilityDispatcherToolRuns";
import {
  attachToolExecutionHandoff,
  buildGenericToolIntentResponse,
  buildToolIntentResponse,
  cancelToolExecutionViaAgentTask,
  readGenericToolProgress,
  readToolRun,
} from "./capabilityDispatcherToolExecution";
import {
  readOptionalInputRecord,
  readStringParam,
} from "./capabilityDispatcherRequestInput";
import {
  dispatchAgent,
  dispatchArtifacts,
  dispatchEvidence,
  dispatchKnowledge,
  dispatchStorage,
} from "./capabilityDispatcherSdkDispatch";
import { throwUnsupportedMethod } from "./capabilityDispatcherUnsupported";

export type PluginCapabilityDispatcher = (
  request: PluginHostBridgeCapabilityRequest,
) => Promise<unknown>;

export interface CreatePluginCapabilityDispatcherOptions {
  host: CapabilityHost;
  projection: PluginProjection;
  entryKey: string;
  runId?: string;
  profile?: HostCapabilityProfile;
  runtimeProfile?: LimeRuntimeProfile;
  manifestVersion?: string;
  agentRuntime?: unknown;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
  workflowClient?: PluginWorkflowReadClient;
}

export { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";

function resolveRunId(
  request: PluginHostBridgeCapabilityRequest,
  fallback?: string,
): string | undefined {
  return (
    fallback ??
    (isRecord(request.rawPayload)
      ? readString(request.rawPayload.runId)
      : undefined) ??
    (request.requestId ? `bridge:${request.requestId}` : undefined)
  );
}

async function dispatchTools(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks);
  if (request.method === "invoke") {
    const response = buildGenericToolIntentResponse(request, input, runs);
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  if (request.method === "getProgress") {
    return readGenericToolProgress(request, runs);
  }
  throwUnsupportedMethod(request);
}

async function dispatchSearch(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.search");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "query" || request.method === "deepResearch") {
    readStringParam(request, "query", 0);
    const response = buildToolIntentResponse(
      request,
      "lime.search",
      input,
      runs,
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchBrowser(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.browser");
  if (request.method === "navigate") {
    readStringParam(request, "sessionId", 0);
    readStringParam(request, "url", 1);
  } else if (
    request.method === "extract" ||
    request.method === "screenshot" ||
    request.method === "close"
  ) {
    readStringParam(request, "sessionId", 0);
  } else if (request.method !== "open") {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(
    request,
    "lime.browser",
    input,
    runs,
  );
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchDocuments(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.documents");
  if (request.method === "parse" || request.method === "summarize") {
    readStringParam(request, "ref", 0);
  } else if (request.method === "export") {
    readStringParam(request, "artifactId", 0);
    readStringParam(request, "format", 1);
  } else if (request.method === "transform") {
    readStringParam(request, "ref", 0);
    readStringParam(request, "operation", 1);
  } else {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(
    request,
    "lime.documents",
    input,
    runs,
  );
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchMedia(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.media");
  if (request.method === "generateImage") {
    readStringParam(request, "prompt", 0);
  } else if (request.method === "editImage") {
    readStringParam(request, "ref", 0);
    readStringParam(request, "prompt", 1);
  } else if (request.method === "transcribe") {
    readStringParam(request, "ref", 0);
  } else if (request.method === "synthesizeVoice") {
    readStringParam(request, "text", 0);
  } else {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(request, "lime.media", input, runs);
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchMcp(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.mcp");
  const tools = buildRuntimeMcpTools(runs);
  if (request.method === "listServers") {
    const servers = new Map<
      string,
      {
        serverId: string;
        toolCount: number;
        runIds: string[];
        lastSeenAt: string;
        source: "app_server_runtime_process";
      }
    >();
    tools.forEach((tool) => {
      const existing = servers.get(tool.serverId);
      if (existing) {
        existing.toolCount += 1;
        existing.runIds = Array.from(
          new Set([...existing.runIds, ...tool.runIds]),
        );
        if (tool.lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = tool.lastSeenAt;
        }
        return;
      }
      servers.set(tool.serverId, {
        serverId: tool.serverId,
        toolCount: 1,
        runIds: [...tool.runIds],
        lastSeenAt: tool.lastSeenAt,
        source: "app_server_runtime_process",
      });
    });
    return {
      appId: request.appId,
      status: "read_only_projection",
      source: "app_server_runtime_process",
      servers: Array.from(servers.values()).sort((left, right) =>
        right.lastSeenAt.localeCompare(left.lastSeenAt),
      ),
    };
  }
  if (request.method === "listTools") {
    const serverId = readString(input.serverId);
    return {
      appId: request.appId,
      status: "read_only_projection",
      source: "app_server_runtime_process",
      tools: serverId
        ? tools.filter((tool) => tool.serverId === serverId)
        : tools,
    };
  }
  if (request.method === "invoke") {
    readStringParam(request, "tool", 0);
    const response = buildToolIntentResponse(request, "lime.mcp", input, runs);
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchTerminal(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.terminal");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "run") {
    readStringParam(request, "command", 0);
    const response = buildToolIntentResponse(
      request,
      "lime.terminal",
      input,
      runs,
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  if (request.method === "cancel") {
    return cancelToolExecutionViaAgentTask(request, input, runs, resolveSdk);
  }
  throwUnsupportedMethod(request);
}

async function dispatchConnectors(
  host: CapabilityHost,
  request: PluginHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.connectors");
  const connectors = buildRuntimeConnectors(runs);
  const authorizationRequests = buildConnectorAuthorizationProjections(tasks);
  if (request.method === "list") {
    return {
      appId: request.appId,
      kind: readString(input.kind),
      status: "read_only_projection",
      source: "app_server_runtime_process",
      connectors,
      authorizationRequests,
    };
  }
  if (request.method === "getStatus") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const connector = connectors.find(
      (item) => item.connectorId === connectorId,
    );
    const authorizationRequest = authorizationRequests.find(
      (item) => item.connectorId === connectorId,
    );
    if (connector) {
      return {
        connectorId,
        status: "observed",
        source: "app_server_runtime_process",
        connector,
        authorizationRequest,
      };
    }
    if (isHostFixtureConnectorAction(connectorId)) {
      return {
        connectorId,
        status: "authorized",
        source: "host_fixture_connector",
        connectorRuntimeFacts: buildConnectorRuntimeFacts(connectorId),
      };
    }
    if (authorizationRequest) {
      if (authorizationRequest.taskStatus === "succeeded") {
        return {
          connectorId,
          status: "authorized",
          source: "plugin_connector_authorization_task",
          authorizationRequest,
          connectorRuntimeFacts: buildConnectorRuntimeFacts(
            connectorId,
            undefined,
            authorizationRequest,
            authorizationRequest.actionId,
          ),
        };
      }
      return {
        connectorId,
        status: "requires_host_authorization",
        source: "plugin_connector_authorization_task",
        authorizationRequest,
      };
    }
    return {
      connectorId,
      status: "not_connected",
      reason: "no_connector_runtime_facts",
      source: "app_server_runtime_process",
    };
  }
  if (request.method === "requestAuth") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const reason = "connector_auth_requires_lime_policy_and_secret_binding";
    const authorizationRequest = buildConnectorAuthorizationRequestEnvelope(
      request,
      connectorId,
      input,
      reason,
    );
    return attachConnectorAuthorizationHandoff(
      {
        appId: request.appId,
        capability: "lime.connectors",
        method: request.method,
        status: "requires_host_authorization",
        reason,
        source: "tool_runtime_policy",
        intent: readToolIntent(input),
        authorizationGate: {
          status: "requires_host_authorization",
          owner: "lime_connector_policy",
          connectorId,
          secretBinding: "host_managed",
          tokenExposed: false,
          sessionScoped: true,
          request: authorizationRequest,
        },
        next: {
          capability: "lime.connectors",
          method: "invoke",
          reason: "after_host_authorization_and_agent_task",
        },
      },
      resolveSdk,
    );
  }
  if (request.method === "invoke") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const action = readStringParam(request, "action", 1);
    const connector = connectors.find(
      (item) => item.connectorId === connectorId,
    );
    const authorizationRequest = authorizationRequests.find(
      (item) => item.connectorId === connectorId,
    );
    const fixtureRuntimeFacts = buildConnectorRuntimeFacts(
      connectorId,
      undefined,
      undefined,
      action,
    );
    if (
      !connector &&
      !fixtureRuntimeFacts &&
      authorizationRequest?.taskStatus !== "succeeded"
    ) {
      return {
        appId: request.appId,
        capability: "lime.connectors",
        method: request.method,
        status: "requires_host_authorization",
        reason: authorizationRequest
          ? "connector_authorization_task_not_completed"
          : "connector_authorization_required_before_execution",
        source: authorizationRequest
          ? "plugin_connector_authorization_task"
          : "tool_runtime_policy",
        intent: readToolIntent(input),
        authorizationGate: {
          status: "requires_host_authorization",
          owner: "lime_connector_policy",
          connectorId,
          secretBinding: "host_managed",
          tokenExposed: false,
          sessionScoped: true,
          authorizationRequest,
        },
        next: {
          capability: "lime.connectors",
          method: "requestAuth",
          reason: authorizationRequest
            ? "wait_for_host_managed_authorization_task"
            : "connector_auth_required_before_agent_task_execution",
        },
      };
    }
    const connectorRuntimeFacts = buildConnectorRuntimeFacts(
      connectorId,
      connector,
      authorizationRequest,
      action,
      { exposeSecretLeaseRef: true },
    );
    const executionInput = connectorRuntimeFacts
      ? {
          ...input,
          connectorRuntimeFacts,
        }
      : input;
    const response = buildToolIntentResponse(
      request,
      "lime.connectors",
      executionInput,
      runs,
      {
        toolName: `connector__${connectorId}__${action}`,
        action,
        exposeSecretLeaseRefToInternal: true,
      },
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

export function createPluginCapabilityDispatcher({
  host,
  projection,
  entryKey,
  runId,
  profile = p0HostCapabilityProfile,
  runtimeProfile,
  manifestVersion,
  agentRuntime,
  requirements,
  boundary,
  integrations,
  operations,
  workflowClient,
}: CreatePluginCapabilityDispatcherOptions): PluginCapabilityDispatcher {
  return async (request) => {
    if (request.capability === "lime.capabilities") {
      return dispatchCapabilities(request, profile, runtimeProfile, {
        manifestVersion,
        agentRuntime,
        requirements,
        boundary,
        integrations,
        operations,
      });
    }

    assertCapabilityDeclared(projection, request, entryKey);

    const resolveSdk = () =>
      host.createSdkContext(
        request.entryKey ?? entryKey,
        resolveRunId(request, runId),
      );

    if (request.capability === "lime.models") {
      return dispatchModels(host, request);
    }
    if (request.capability === "lime.cloudSession") {
      return dispatchCloudSession(request);
    }
    if (request.capability === "lime.usage") {
      return dispatchUsage(host, request);
    }
    if (request.capability === "lime.skills") {
      return dispatchSkills(host, request);
    }
    if (request.capability === "lime.memory") {
      return dispatchMemory(host, request);
    }
    if (request.capability === "lime.context") {
      return dispatchContext(host, request);
    }
    if (request.capability === "lime.tasks") {
      return dispatchTasks(host, request);
    }
    if (request.capability === "lime.tools") {
      return dispatchTools(host, request, resolveSdk);
    }
    if (request.capability === "lime.search") {
      return dispatchSearch(host, request, resolveSdk);
    }
    if (request.capability === "lime.browser") {
      return dispatchBrowser(host, request, resolveSdk);
    }
    if (request.capability === "lime.documents") {
      return dispatchDocuments(host, request, resolveSdk);
    }
    if (request.capability === "lime.media") {
      return dispatchMedia(host, request, resolveSdk);
    }
    if (request.capability === "lime.mcp") {
      return dispatchMcp(host, request, resolveSdk);
    }
    if (request.capability === "lime.terminal") {
      return dispatchTerminal(host, request, resolveSdk);
    }
    if (request.capability === "lime.connectors") {
      return dispatchConnectors(host, request, resolveSdk);
    }
    if (
      request.capability === "lime.agent" &&
      request.method === "readWorkflow"
    ) {
      return readWorkflowProjection(request, workflowClient);
    }

    const sdk = resolveSdk();

    if (request.capability === "lime.storage") {
      return dispatchStorage(sdk, request, projection);
    }
    if (request.capability === "lime.artifacts") {
      return dispatchArtifacts(sdk, request, projection);
    }
    if (request.capability === "lime.evidence") {
      return dispatchEvidence(sdk, request, projection);
    }
    if (request.capability === "lime.knowledge") {
      return dispatchKnowledge(sdk, request);
    }
    if (request.capability === "lime.agent") {
      return dispatchAgent(sdk, request, projection);
    }
    throw new PluginCapabilityDispatcherError(
      "UNSUPPORTED_CAPABILITY",
      `${request.capability} is not supported by Plugin Host Bridge.`,
    );
  };
}
