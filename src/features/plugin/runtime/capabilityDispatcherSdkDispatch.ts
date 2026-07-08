import type { LimeAppSdk } from "../sdk/CapabilityHost";
import type { PluginProjection, PluginTaskRequest } from "../types";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  assertAgentTaskClawCapabilitiesDeclared,
  assertArtifactKindDeclared,
  assertEvidenceKindDeclared,
  assertStorageWriteDeclared,
} from "./capabilityDispatcherManifestGuards";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import { hasOwn, readString } from "./capabilityDispatcherRecord";
import {
  readInputRecord,
  readOptionalInputRecord,
  readStringParam,
} from "./capabilityDispatcherRequestInput";
import { throwUnsupportedMethod } from "./capabilityDispatcherUnsupported";

export async function dispatchStorage(
  sdk: LimeAppSdk,
  request: PluginHostBridgeCapabilityRequest,
  projection: PluginProjection,
): Promise<unknown> {
  if (request.method === "get") {
    return sdk.storage.get(readStringParam(request, "key", 0));
  }
  if (request.method === "set") {
    assertStorageWriteDeclared(projection);
    const input = readInputRecord(request, "set");
    if (!hasOwn(input, "value")) {
      throw new PluginCapabilityDispatcherError(
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

export async function dispatchArtifacts(
  sdk: LimeAppSdk,
  request: PluginHostBridgeCapabilityRequest,
  projection: PluginProjection,
): Promise<unknown> {
  if (request.method === "create") {
    const input = readInputRecord(request, "create");
    const kind = readString(input.kind);
    if (!kind) {
      throw new PluginCapabilityDispatcherError(
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

export async function dispatchEvidence(
  sdk: LimeAppSdk,
  request: PluginHostBridgeCapabilityRequest,
  projection: PluginProjection,
): Promise<unknown> {
  if (request.method === "record") {
    const input = readInputRecord(request, "record");
    const kind = readString(input.kind);
    if (!kind) {
      throw new PluginCapabilityDispatcherError(
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

export async function dispatchKnowledge(
  sdk: LimeAppSdk,
  request: PluginHostBridgeCapabilityRequest,
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

export async function dispatchAgent(
  sdk: LimeAppSdk,
  request: PluginHostBridgeCapabilityRequest,
  projection: PluginProjection,
): Promise<unknown> {
  if (request.method === "startTask") {
    const input = readInputRecord(request, "startTask");
    assertAgentTaskClawCapabilitiesDeclared(projection, input);
    return sdk.agent.startTask(input as unknown as PluginTaskRequest);
  }
  if (request.method === "streamTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.streamTask(
      sessionId ? { ...input, taskId, sessionId } : taskId,
    );
  }
  if (request.method === "getTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.getTask(
      sessionId ? { ...input, taskId, sessionId } : taskId,
    );
  }
  if (request.method === "cancelTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.cancelTask(
      sessionId ? { ...input, taskId, sessionId } : taskId,
    );
  }
  if (request.method === "retryTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.retryTask(
      sessionId ? { ...input, taskId, sessionId } : taskId,
    );
  }
  if (
    request.method === "submitHostResponse" ||
    request.method === "respondAction"
  ) {
    return sdk.agent.submitHostResponse(
      readInputRecord(request, request.method) as unknown as Parameters<
        typeof sdk.agent.submitHostResponse
      >[0],
    );
  }
  if (request.method === "listTasks") {
    return sdk.agent.listTasks();
  }
  throwUnsupportedMethod(request);
}
