import type { LimeAppSdk } from "../sdk/CapabilityHost";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import { capabilityMatchToken } from "./capabilityDispatcherClawCapabilities";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import { readToolIntent, sanitizeExecutionRequestInput } from "./capabilityDispatcherExecutionInput";
import { readStringParam } from "./capabilityDispatcherRequestInput";
import { isRecord, readString } from "./capabilityDispatcherRecord";
import { TOOL_INTEGRATION_SPECS } from "./capabilityDispatcherRuntimeProjection";
import type {
  RuntimeToolRunProjection,
  ToolExecutionAgentTaskRequest,
  ToolExecutionHandoffProjection,
  ToolExecutionPolicyProjection,
  ToolExecutionRequestEnvelope,
  ToolIntegrationCapability,
} from "./capabilityDispatcherRuntimeTypes";

const INTERNAL_TOOL_EXECUTION_REQUEST = Symbol(
  "pluginInternalToolExecutionRequest",
);

export type ToolIntentResponse = Record<string, unknown> & {
  toolHints: string[];
  [INTERNAL_TOOL_EXECUTION_REQUEST]?: ToolExecutionRequestEnvelope;
};

function buildToolExecutionPolicy(
  capability: ToolIntegrationCapability | "lime.tools",
  reason: string,
): ToolExecutionPolicyProjection {
  const requiresApproval = new Set<ToolIntegrationCapability | "lime.tools">([
    "lime.browser",
    "lime.mcp",
    "lime.terminal",
    "lime.connectors",
    "lime.tools",
  ]).has(capability);
  const policy: ToolExecutionPolicyProjection = {
    owner: "lime_agent_runtime",
    scope: "plugin_session",
    approvalRequired: requiresApproval,
    sandboxRequired: capability === "lime.terminal",
    mutationExposed: false,
    tokenExposed: false,
    reason,
  };
  if (capability === "lime.connectors") {
    policy.secretBinding = "host_managed";
  }
  return policy;
}

function buildToolExecutionRequestEnvelope(
  request: PluginHostBridgeCapabilityRequest,
  capability: ToolIntegrationCapability | "lime.tools",
  input: Record<string, unknown>,
  reason: string,
  options: {
    toolName?: string;
    action?: string;
    exposeSecretLeaseRef?: boolean;
  } = {},
): ToolExecutionRequestEnvelope {
  const taskId = readString(input.taskId);
  const sessionId = readString(input.sessionId);
  const envelope: ToolExecutionRequestEnvelope = {
    capability,
    method: request.method,
    appId: request.appId,
    action: options.action ?? readString(input.action) ?? request.method,
    input: sanitizeExecutionRequestInput(input, undefined, 0, {
      exposeSecretLeaseRef: options.exposeSecretLeaseRef,
    }),
    reason,
    policy: buildToolExecutionPolicy(capability, reason),
  };
  if (request.entryKey) {
    envelope.entryKey = request.entryKey;
  }
  if (taskId) {
    envelope.taskId = taskId;
  }
  if (sessionId) {
    envelope.sessionId = sessionId;
  }
  if (options.toolName) {
    envelope.toolName = options.toolName;
  }
  if (request.idempotencyKey) {
    envelope.idempotencyKey = request.idempotencyKey;
  }
  return envelope;
}

function buildToolExecutionHandoffTaskRequest(
  executionRequest: ToolExecutionRequestEnvelope,
  toolHints: string[],
  options: { internalExecutionRequest?: ToolExecutionRequestEnvelope } = {},
): ToolExecutionAgentTaskRequest {
  const internalExecutionRequest = options.internalExecutionRequest;
  const uniqueHints = Array.from(
    new Set(
      [
        executionRequest.toolName,
        executionRequest.capability,
        ...toolHints,
      ].filter((item): item is string => Boolean(item?.trim())),
    ),
  );
  return {
    title: `Tool execution · ${
      executionRequest.toolName ?? executionRequest.capability
    }`,
    taskKind: "plugin.tool_execution",
    idempotencyKey:
      executionRequest.idempotencyKey ??
      `${executionRequest.appId}:${
        executionRequest.entryKey ?? "default"
      }:${executionRequest.capability}:${executionRequest.method}`,
    prompt: [
      "【Plugin Tool Execution Request】",
      `Capability: ${executionRequest.capability}`,
      `Method: ${executionRequest.method}`,
      `Tool: ${executionRequest.toolName ?? "n/a"}`,
      `Action: ${executionRequest.action ?? "n/a"}`,
      "",
      "请由 Lime AgentRuntime / ToolRuntime policy owner 审核并执行该请求。",
      "不要要求 Plugin 直接执行工具、MCP、终端、浏览器或 connector，也不要把 Host secret/token 暴露给 App。",
    ].join("\n"),
    input: {
      executionRequest,
    },
    expectedOutput: {
      kind: "tool_execution_result",
      evidenceRequired: true,
      source: "app_server_tool_runtime",
    },
    tools: uniqueHints,
    requiredCapabilities: [executionRequest.capability],
    capabilityHints: uniqueHints,
    humanReview: executionRequest.policy.approvalRequired,
    sessionId: executionRequest.sessionId,
    queueIfBusy: true,
    metadata: {
      plugin_tool_execution: {
        version: "p18.7-e2",
        source: "host_bridge_execution_gate",
        request: executionRequest,
        ...(internalExecutionRequest &&
        internalExecutionRequest !== executionRequest
          ? { internalRequest: internalExecutionRequest }
          : {}),
      },
    },
  };
}

function readExecutionRequestFromResponse(
  response: Record<string, unknown>,
): ToolExecutionRequestEnvelope | null {
  const executionGate = isRecord(response.executionGate)
    ? response.executionGate
    : null;
  const request = executionGate?.request;
  return isRecord(request) &&
    typeof request.capability === "string" &&
    typeof request.method === "string" &&
    typeof request.appId === "string" &&
    isRecord(request.policy)
    ? (request as unknown as ToolExecutionRequestEnvelope)
    : null;
}

export async function attachToolExecutionHandoff(
  response: Record<string, unknown>,
  toolHints: string[],
  resolveSdk?: () => LimeAppSdk,
): Promise<Record<string, unknown>> {
  if (!resolveSdk) {
    return response;
  }
  const executionGate = isRecord(response.executionGate)
    ? response.executionGate
    : {};
  const publicExecutionRequest = readExecutionRequestFromResponse(response);
  const internalExecutionRequest = (response as ToolIntentResponse)[
    INTERNAL_TOOL_EXECUTION_REQUEST
  ];
  const executionRequest = publicExecutionRequest ?? internalExecutionRequest;
  if (!executionRequest) {
    return response;
  }
  try {
    const task = await resolveSdk().agent.startTask(
      buildToolExecutionHandoffTaskRequest(executionRequest, toolHints, {
        internalExecutionRequest,
      }),
    );
    const handoff: ToolExecutionHandoffProjection = {
      status: "accepted",
      owner: "lime_agent_runtime",
      source: "lime.agent.startTask",
      taskId: task.taskId,
      traceId: task.traceId,
      taskKind: task.taskKind,
      taskStatus: task.status,
    };
    return {
      ...response,
      executionGate: {
        ...executionGate,
        handoff,
      },
    };
  } catch {
    const handoff: ToolExecutionHandoffProjection = {
      status: "not_started",
      owner: "lime_agent_runtime",
      source: "lime.agent.startTask",
      reason: "agent_task_handoff_failed",
    };
    return {
      ...response,
      executionGate: {
        ...executionGate,
        handoff,
      },
    };
  }
}

export function buildToolIntentResponse(
  request: PluginHostBridgeCapabilityRequest,
  capability: ToolIntegrationCapability,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
  options: {
    toolName?: string;
    action?: string;
    exposeSecretLeaseRefToInternal?: boolean;
  } = {},
): ToolIntentResponse {
  const spec = TOOL_INTEGRATION_SPECS[capability];
  const toolName =
    options.toolName ?? readString(input.tool) ?? spec.toolHints[0];
  const publicExecutionRequest = buildToolExecutionRequestEnvelope(
    request,
    capability,
    input,
    spec.reason,
    {
      toolName,
      action: options.action,
    },
  );
  const internalExecutionRequest = options.exposeSecretLeaseRefToInternal
    ? buildToolExecutionRequestEnvelope(
        request,
        capability,
        input,
        spec.reason,
        {
          toolName,
          action: options.action,
          exposeSecretLeaseRef: true,
        },
      )
    : publicExecutionRequest;
  const response: ToolIntentResponse = {
    appId: request.appId,
    capability,
    method: request.method,
    status: "requires_agent_task",
    reason: spec.reason,
    source: "tool_runtime_policy",
    intent: readToolIntent(input),
    toolHints: spec.toolHints,
    matchingRuns: runs,
    executionGate: {
      status: "requires_agent_task",
      owner: "lime_agent_runtime",
      mutationExposed: false,
      evidenceSource: "app_server_runtime_projection",
      reason: spec.reason,
      request: publicExecutionRequest,
    },
    next: {
      capability: "lime.agent",
      method: "startTask",
      reason: "actual_tool_execution_is_owned_by_lime_agent_runtime",
    },
  };
  if (internalExecutionRequest !== publicExecutionRequest) {
    Object.defineProperty(response, INTERNAL_TOOL_EXECUTION_REQUEST, {
      value: internalExecutionRequest,
      enumerable: false,
    });
  }
  return response;
}

function normalizeToolIntegrationName(value: string): string {
  return value
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^执行参数流\s*[·:]\s*/i, "")
    .replace(/^执行结果流\s*[·:]\s*/i, "")
    .trim();
}

function toolRunMatchesToolName(
  run: RuntimeToolRunProjection,
  toolName: string,
): boolean {
  const requested = capabilityMatchToken(
    normalizeToolIntegrationName(toolName),
  );
  const observed = capabilityMatchToken(
    normalizeToolIntegrationName(run.toolName),
  );
  return Boolean(
    requested &&
    observed &&
    (requested === observed ||
      requested.includes(observed) ||
      observed.includes(requested)),
  );
}

export function buildGenericToolIntentResponse(
  request: PluginHostBridgeCapabilityRequest,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
): ToolIntentResponse {
  const toolName = readStringParam(request, "tool", 0);
  const reason = "tool_execution_requires_lime_tool_runtime_policy";
  const executionRequest = buildToolExecutionRequestEnvelope(
    request,
    "lime.tools",
    input,
    reason,
    {
      toolName,
      action: readString(input.action) ?? request.method,
    },
  );
  return {
    appId: request.appId,
    capability: "lime.tools",
    method: request.method,
    status: "requires_agent_task",
    reason,
    source: "tool_runtime_policy",
    intent: readToolIntent(input),
    toolHints: [toolName],
    matchingRuns: runs.filter((run) => toolRunMatchesToolName(run, toolName)),
    executionGate: {
      status: "requires_agent_task",
      owner: "lime_agent_runtime",
      mutationExposed: false,
      evidenceSource: "app_server_runtime_projection",
      reason,
      request: executionRequest,
    },
    next: {
      capability: "lime.agent",
      method: "startTask",
      reason: "actual_tool_execution_is_owned_by_lime_agent_runtime",
    },
  };
}

export function readGenericToolProgress(
  request: PluginHostBridgeCapabilityRequest,
  runs: RuntimeToolRunProjection[],
): RuntimeToolRunProjection & { invocationId: string } {
  const invocationId = readStringParam(request, "invocationId", 0);
  const run = runs.find(
    (item) => item.runId === invocationId || item.taskId === invocationId,
  );
  if (!run) {
    throw new PluginCapabilityDispatcherError(
      "TOOL_RUN_NOT_FOUND",
      `${invocationId} was not found in AgentRuntime tool projection.`,
    );
  }
  return {
    ...run,
    invocationId,
  };
}

export function readToolRun(
  request: PluginHostBridgeCapabilityRequest,
  runs: RuntimeToolRunProjection[],
): RuntimeToolRunProjection {
  const runId = readStringParam(request, "runId", 0);
  const run = runs.find(
    (item) => item.runId === runId || item.taskId === runId,
  );
  if (!run) {
    throw new PluginCapabilityDispatcherError(
      "TOOL_RUN_NOT_FOUND",
      `${runId} was not found in AgentRuntime tool projection.`,
    );
  }
  return run;
}

export async function cancelToolExecutionViaAgentTask(
  request: PluginHostBridgeCapabilityRequest,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
  resolveSdk?: () => LimeAppSdk,
): Promise<Record<string, unknown>> {
  const taskId = readString(input.taskId) ?? readString(input.task_id);
  const runId =
    readString(input.runId) ??
    readString(input.run_id) ??
    readString(input.invocationId);
  const run = runId
    ? runs.find((item) => item.runId === runId || item.taskId === runId)
    : undefined;
  const resolvedTaskId = taskId ?? run?.taskId;
  if (!resolvedTaskId) {
    return {
      status: "not_available",
      reason: "tool_cancellation_requires_agent_task_id",
      source: "app_server_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    };
  }
  if (!taskId) {
    return {
      status: "requires_agent_task_cancellation",
      reason: "tool_run_cancellation_must_use_agent_task_id",
      source: "app_server_runtime_projection",
      runId,
      taskId: resolvedTaskId,
      next: {
        capability: "lime.agent",
        method: "cancelTask",
        taskId: resolvedTaskId,
      },
    };
  }
  if (!resolveSdk) {
    return {
      status: "requires_agent_task_cancellation",
      reason: "lime_agent_sdk_unavailable",
      source: "app_server_runtime_projection",
      taskId: resolvedTaskId,
      next: {
        capability: "lime.agent",
        method: "cancelTask",
        taskId: resolvedTaskId,
      },
    };
  }
  const task = await resolveSdk().agent.cancelTask(resolvedTaskId);
  return {
    appId: request.appId,
    capability: request.capability,
    method: request.method,
    status: "cancel_requested",
    source: "lime.agent.cancelTask",
    taskId: resolvedTaskId,
    taskStatus: task.status,
    task,
  };
}
