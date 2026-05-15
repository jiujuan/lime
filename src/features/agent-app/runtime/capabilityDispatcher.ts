import type { CapabilityHost, LimeAppSdk } from "../sdk/CapabilityHost";
import type { AgentAppProjection, AgentAppTaskRequest } from "../types";
import type { AgentAppHostBridgeCapabilityRequest } from "./hostBridge";

export type AgentAppCapabilityDispatcher = (
  request: AgentAppHostBridgeCapabilityRequest,
) => Promise<unknown>;

export interface CreateAgentAppCapabilityDispatcherOptions {
  host: CapabilityHost;
  projection: AgentAppProjection;
  entryKey: string;
  runId?: string;
}

export class AgentAppCapabilityDispatcherError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentAppCapabilityDispatcherError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInputRecord(
  request: AgentAppHostBridgeCapabilityRequest,
  method: string,
): Record<string, unknown> {
  if (isRecord(request.input)) {
    return request.input;
  }
  const firstArg = request.args?.[0];
  if (isRecord(firstArg)) {
    return firstArg;
  }
  throw new AgentAppCapabilityDispatcherError(
    "INVALID_CAPABILITY_INPUT",
    `${request.capability}.${method} requires an input object.`,
  );
}

function readStringParam(
  request: AgentAppHostBridgeCapabilityRequest,
  key: string,
  argIndex: number,
): string {
  const fromInput = isRecord(request.input)
    ? readString(request.input[key])
    : undefined;
  const fromArgs = readString(request.args?.[argIndex]);
  const value = fromInput ?? fromArgs;
  if (!value) {
    throw new AgentAppCapabilityDispatcherError(
      "INVALID_CAPABILITY_INPUT",
      `${request.capability}.${request.method} requires ${key}.`,
    );
  }
  return value;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertStorageWriteDeclared(projection: AgentAppProjection): void {
  if (projection.storage) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    "lime.storage write-back requires a declared storage namespace.",
  );
}

function assertArtifactKindDeclared(
  projection: AgentAppProjection,
  kind: string,
): void {
  if (projection.artifactTypes.some((artifact) => artifact.key === kind)) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Artifact kind ${kind} is not declared by this Agent App manifest.`,
  );
}

function assertEvidenceKindDeclared(
  projection: AgentAppProjection,
  kind: string,
): void {
  if (projection.evals.some((evalRule) => evalRule.key === kind)) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Evidence kind ${kind} is not declared by this Agent App manifest.`,
  );
}

function resolveRunId(
  request: AgentAppHostBridgeCapabilityRequest,
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

async function dispatchStorage(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "get") {
    return sdk.storage.get(readStringParam(request, "key", 0));
  }
  if (request.method === "set") {
    assertStorageWriteDeclared(projection);
    const input = readInputRecord(request, "set");
    if (!hasOwn(input, "value")) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.storage.set requires value.",
      );
    }
    return sdk.storage.set(readStringParam(request, "key", 0), input.value);
  }
  if (request.method === "list") {
    return sdk.storage.list();
  }
  if (request.method === "delete") {
    assertStorageWriteDeclared(projection);
    return sdk.storage.delete(readStringParam(request, "key", 0));
  }
  throwUnsupportedMethod(request);
}

async function dispatchArtifacts(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "create") {
    const input = readInputRecord(request, "create");
    const kind = readString(input.kind);
    if (!kind) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.artifacts.create requires kind.",
      );
    }
    assertArtifactKindDeclared(projection, kind);
    return sdk.artifacts.create({
      ...(input as { kind: string; title: string; content: unknown }),
      kind,
    });
  }
  if (request.method === "list") {
    return sdk.artifacts.list();
  }
  throwUnsupportedMethod(request);
}

async function dispatchEvidence(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "record") {
    const input = readInputRecord(request, "record");
    const kind = readString(input.kind);
    if (!kind) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.evidence.record requires kind.",
      );
    }
    assertEvidenceKindDeclared(projection, kind);
    return sdk.evidence.record({
      ...(input as { kind: string; message: string; refs?: string[] }),
      kind,
    });
  }
  if (request.method === "list") {
    return sdk.evidence.list();
  }
  throwUnsupportedMethod(request);
}

async function dispatchKnowledge(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
): Promise<unknown> {
  if (request.method === "search") {
    return sdk.knowledge.search(
      readInputRecord(request, "search") as {
        query: string;
        limit?: number;
      },
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchAgent(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
): Promise<unknown> {
  if (request.method === "startTask") {
    return sdk.agent.startTask(
      readInputRecord(request, "startTask") as unknown as AgentAppTaskRequest,
    );
  }
  if (request.method === "streamTask") {
    return sdk.agent.streamTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "getTask") {
    return sdk.agent.getTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "cancelTask") {
    return sdk.agent.cancelTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "retryTask") {
    return sdk.agent.retryTask(readStringParam(request, "taskId", 0));
  }
  if (
    request.method === "submitHostResponse" ||
    request.method === "respondAction"
  ) {
    return sdk.agent.submitHostResponse(
      readInputRecord(
        request,
        request.method,
      ) as unknown as Parameters<typeof sdk.agent.submitHostResponse>[0],
    );
  }
  if (request.method === "listTasks") {
    return sdk.agent.listTasks();
  }
  throwUnsupportedMethod(request);
}

function throwUnsupportedMethod(
  request: AgentAppHostBridgeCapabilityRequest,
): never {
  throw new AgentAppCapabilityDispatcherError(
    "UNSUPPORTED_CAPABILITY_METHOD",
    `${request.capability}.${request.method} is not supported by Agent App Host Bridge.`,
  );
}

export function createAgentAppCapabilityDispatcher({
  host,
  projection,
  entryKey,
  runId,
}: CreateAgentAppCapabilityDispatcherOptions): AgentAppCapabilityDispatcher {
  return async (request) => {
    const sdk = host.createSdkContext(
      request.entryKey ?? entryKey,
      resolveRunId(request, runId),
    );

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
      return dispatchAgent(sdk, request);
    }
    throw new AgentAppCapabilityDispatcherError(
      "UNSUPPORTED_CAPABILITY",
      `${request.capability} is not supported by Agent App Host Bridge.`,
    );
  };
}
