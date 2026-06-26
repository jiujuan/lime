import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import { CONTENT_FACTORY_WORKSPACE_PATCH_KIND } from "./contentFactoryWorkspacePatch";
import {
  buildContentFactoryDeliveryParts,
  type ContentFactoryDeliveryPart,
} from "./contentFactoryDeliveryPlan";
import {
  buildContentFactoryPluginContract,
  CONTENT_FACTORY_PLUGIN_ID,
} from "./contentFactoryPlugin";

export const CONTENT_FACTORY_WORKER_REQUEST_SCHEMA =
  "content-factory.worker-request.v1";
export const CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA =
  "content-factory.worker-runtime.v1";
export const CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA = "product-workspace.v1";

export interface ContentFactoryWorkerRuntimeContract {
  schemaVersion: typeof CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA;
  appId: typeof CONTENT_FACTORY_PLUGIN_ID;
  enabled: boolean;
  workerEntrypoint: string | null;
  contractPath: string | null;
  sampleRequestPath: string | null;
  outputArtifactKind: typeof CONTENT_FACTORY_WORKSPACE_PATCH_KIND | null;
  taskKinds: string[];
  directProviderAccess: boolean;
  directFilesystemAccess: boolean;
  expectedOutput: {
    artifactKind: typeof CONTENT_FACTORY_WORKSPACE_PATCH_KIND;
    productWorkspaceSchema: typeof CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA;
    objectKinds: string[];
    requiredObjectKinds: string[];
  };
  blockerCodes: string[];
}

export interface ContentFactoryWorkerRequest {
  schemaVersion: typeof CONTENT_FACTORY_WORKER_REQUEST_SCHEMA;
  appId: typeof CONTENT_FACTORY_PLUGIN_ID;
  sessionId: string;
  workspaceId: string | null;
  turnId: string;
  taskId: string;
  taskKind: string;
  prompt: string;
  actionKey: string | null;
  sourceObjectRef: Record<string, unknown> | null;
  expectedOutput: ContentFactoryWorkerRuntimeContract["expectedOutput"];
  runtime: {
    workerEntrypoint: string;
    outputArtifactKind: typeof CONTENT_FACTORY_WORKSPACE_PATCH_KIND;
    directProviderAccess: false;
    directFilesystemAccess: false;
  };
  requestedAt: string | null;
}

export interface BuildContentFactoryWorkerRequestParams {
  sessionId: string;
  turnId: string;
  taskId: string;
  taskKind: string;
  prompt: string;
  workspaceId?: string | null;
  actionKey?: string | null;
  sourceObjectRef?: Record<string, unknown> | null;
  requestedAt?: string | null;
  runtimeContract?: ContentFactoryWorkerRuntimeContract;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readTasks(agentRuntime: Record<string, unknown> | null): string[] {
  const tasks = Array.isArray(agentRuntime?.tasks) ? agentRuntime.tasks : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const task of tasks) {
    const kind = readString(asRecord(task)?.kind);
    if (!kind || seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    result.push(kind);
  }
  return result;
}

function requiredObjectKinds(
  parts: readonly ContentFactoryDeliveryPart[],
): string[] {
  return parts.filter((part) => part.required).map((part) => part.objectKind);
}

function buildExpectedOutput(
  parts: readonly ContentFactoryDeliveryPart[],
): ContentFactoryWorkerRuntimeContract["expectedOutput"] {
  return {
    artifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
    productWorkspaceSchema: CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA,
    objectKinds: parts.map((part) => part.objectKind),
    requiredObjectKinds: requiredObjectKinds(parts),
  };
}

export function buildContentFactoryWorkerRuntimeContract(): ContentFactoryWorkerRuntimeContract {
  const manifest = asRecord(contentFactoryFixture) ?? {};
  const runtimePackage = asRecord(manifest.runtimePackage);
  const runtimePackageWorker = asRecord(runtimePackage?.worker);
  const agentRuntime = asRecord(manifest.agentRuntime);
  const agentRuntimeWorker = asRecord(agentRuntime?.worker);
  const taskKinds = readTasks(agentRuntime);
  const workerEntrypoint = readString(
    runtimePackageWorker?.entrypoint,
    runtimePackageWorker?.path,
    agentRuntimeWorker?.entrypoint,
  );
  const contractPath = readString(
    runtimePackageWorker?.contract,
    agentRuntimeWorker?.contract,
  );
  const sampleRequestPath = readString(
    runtimePackageWorker?.sampleRequest,
    agentRuntimeWorker?.sampleRequest,
  );
  const outputArtifactKind = readString(
    runtimePackageWorker?.outputArtifactKind,
    agentRuntimeWorker?.outputArtifactKind,
  );
  const directProviderAccess = readBoolean(
    agentRuntimeWorker?.directProviderAccess,
  );
  const directFilesystemAccess = readBoolean(
    agentRuntimeWorker?.directFilesystemAccess,
  );
  const parts = buildContentFactoryDeliveryParts(
    buildContentFactoryPluginContract(),
  );
  const blockerCodes = [
    ...(workerEntrypoint ? [] : ["TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING"]),
    ...(taskKinds.length > 0 ? [] : ["TASK_RUNTIME_TASKS_MISSING"]),
    ...(outputArtifactKind === CONTENT_FACTORY_WORKSPACE_PATCH_KIND
      ? []
      : ["TASK_RUNTIME_OUTPUT_ARTIFACT_KIND_UNSUPPORTED"]),
    ...(directProviderAccess
      ? ["TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED"]
      : []),
    ...(directFilesystemAccess
      ? ["TASK_RUNTIME_DIRECT_FILESYSTEM_ACCESS_UNSUPPORTED"]
      : []),
    ...(parts.length > 0 ? [] : ["TASK_RUNTIME_DELIVERY_PARTS_MISSING"]),
  ];

  return {
    schemaVersion: CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA,
    appId: CONTENT_FACTORY_PLUGIN_ID,
    enabled: Boolean(workerEntrypoint || taskKinds.length > 0),
    workerEntrypoint,
    contractPath,
    sampleRequestPath,
    outputArtifactKind:
      outputArtifactKind === CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        ? CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        : null,
    taskKinds,
    directProviderAccess,
    directFilesystemAccess,
    expectedOutput: buildExpectedOutput(parts),
    blockerCodes,
  };
}

function normalizeRequestString(
  value: string | null | undefined,
): string | null {
  return value?.trim() || null;
}

export function buildContentFactoryWorkerRequest({
  actionKey = null,
  prompt,
  requestedAt = null,
  runtimeContract = buildContentFactoryWorkerRuntimeContract(),
  sessionId,
  sourceObjectRef = null,
  taskId,
  taskKind,
  turnId,
  workspaceId = null,
}: BuildContentFactoryWorkerRequestParams): ContentFactoryWorkerRequest | null {
  const normalizedSessionId = normalizeRequestString(sessionId);
  const normalizedTurnId = normalizeRequestString(turnId);
  const normalizedTaskId = normalizeRequestString(taskId);
  const normalizedTaskKind = normalizeRequestString(taskKind);
  const normalizedPrompt = normalizeRequestString(prompt);
  if (
    !normalizedSessionId ||
    !normalizedTurnId ||
    !normalizedTaskId ||
    !normalizedTaskKind ||
    !normalizedPrompt ||
    runtimeContract.blockerCodes.length > 0 ||
    !runtimeContract.workerEntrypoint ||
    runtimeContract.outputArtifactKind !==
      CONTENT_FACTORY_WORKSPACE_PATCH_KIND ||
    !runtimeContract.taskKinds.includes(normalizedTaskKind)
  ) {
    return null;
  }

  return {
    schemaVersion: CONTENT_FACTORY_WORKER_REQUEST_SCHEMA,
    appId: CONTENT_FACTORY_PLUGIN_ID,
    sessionId: normalizedSessionId,
    workspaceId: normalizeRequestString(workspaceId),
    turnId: normalizedTurnId,
    taskId: normalizedTaskId,
    taskKind: normalizedTaskKind,
    prompt: normalizedPrompt,
    actionKey: normalizeRequestString(actionKey),
    sourceObjectRef: sourceObjectRef ? { ...sourceObjectRef } : null,
    expectedOutput: runtimeContract.expectedOutput,
    runtime: {
      workerEntrypoint: runtimeContract.workerEntrypoint,
      outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
      directProviderAccess: false,
      directFilesystemAccess: false,
    },
    requestedAt: normalizeRequestString(requestedAt),
  };
}
