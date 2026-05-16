import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppKnowledgeSearchResult,
  AgentAppProvenance,
  AgentAppStorageEntry,
  AgentAppTaskHostResponseRequest,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppTaskRequest,
  AgentAppTaskStreamEvent,
} from "../types";
import {
  toLimeCapabilityError,
  type LimeCapabilityError,
  type LimeCapabilityErrorContext,
} from "./capabilityErrors";

export const LIME_CAPABILITY_NAMES = [
  "lime.ui",
  "lime.storage",
  "lime.files",
  "lime.agent",
  "lime.knowledge",
  "lime.tools",
  "lime.artifacts",
  "lime.workflow",
  "lime.policy",
  "lime.secrets",
  "lime.evidence",
] as const;

export type LimeCapabilityName = (typeof LIME_CAPABILITY_NAMES)[number];

export interface LimeCapabilityInvokeProvenance {
  appId: string;
  entryKey?: string;
  packageHash: string;
  manifestHash: string;
  workflowRunId?: string;
  workspaceId?: string;
  taskId?: string;
}

export interface LimeCapabilityInvokeRequest<
  Capability extends LimeCapabilityName = LimeCapabilityName,
  Method extends string = string,
  Args = unknown,
> {
  capability: Capability;
  method: Method;
  args?: Args;
  requestId?: string;
  idempotencyKey?: string;
  expectedSchema?: unknown;
  provenance?: LimeCapabilityInvokeProvenance;
}

export type LimeCapabilityInvokeResponse<Value = unknown> =
  | {
      ok: true;
      value: Value;
      traceId?: string;
      evidenceId?: string;
    }
  | {
      ok: false;
      error: LimeCapabilityError;
    };

export interface LimeCapabilityContractMap {
  "lime.ui": {
    toast: {
      args: {
        message: string;
        level?: "info" | "success" | "warning" | "error";
      };
      value: { accepted: true };
    };
    navigate: {
      args: { route?: string; url?: string };
      value: { navigatedTo: string };
    };
    openExternal: {
      args: { url: string };
      value: { opened: true };
    };
    download: {
      args: { url: string; fileName?: string };
      value: { downloaded: true };
    };
    getSnapshot: {
      args: undefined;
      value: unknown;
    };
  };
  "lime.storage": {
    get: { args: { key: string }; value: unknown | null };
    set: { args: { key: string; value: unknown }; value: AgentAppStorageEntry };
    list: { args: undefined; value: AgentAppStorageEntry[] };
    delete: { args: { key: string }; value: boolean };
  };
  "lime.files": {
    pick: { args: { accept?: string[]; multiple?: boolean }; value: unknown };
    readRef: { args: { ref: string }; value: unknown };
  };
  "lime.agent": {
    startTask: { args: AgentAppTaskRequest; value: AgentAppTaskRecord };
    streamTask: { args: { taskId: string }; value: AgentAppTaskStreamEvent[] };
    getTask: { args: { taskId: string }; value: AgentAppTaskRecord | null };
    cancelTask: { args: { taskId: string }; value: AgentAppTaskRecord };
    retryTask: { args: { taskId: string }; value: AgentAppTaskRecord };
    submitHostResponse: {
      args: AgentAppTaskHostResponseRequest;
      value: AgentAppTaskHostResponseResult;
    };
    listTasks: { args: undefined; value: AgentAppTaskRecord[] };
  };
  "lime.knowledge": {
    search: {
      args: { query: string; limit?: number };
      value: AgentAppKnowledgeSearchResult;
    };
    bindStatus: { args: { key: string }; value: unknown };
  };
  "lime.tools": {
    invoke: { args: { tool: string; input?: unknown }; value: unknown };
    getProgress: { args: { invocationId: string }; value: unknown };
  };
  "lime.artifacts": {
    create: {
      args: { kind: string; title: string; content: unknown };
      value: AgentAppArtifactRecord;
    };
    open: { args: { artifactId: string }; value: unknown };
    export: { args: { artifactId: string; format?: string }; value: unknown };
  };
  "lime.workflow": {
    start: { args: { workflowKey: string; input?: unknown }; value: unknown };
    checkpoint: {
      args: { workflowRunId: string; state?: unknown };
      value: unknown;
    };
    awaitHuman: {
      args: { workflowRunId: string; prompt: string };
      value: unknown;
    };
  };
  "lime.policy": {
    check: { args: { capability: string; action?: string }; value: unknown };
    requestPermission: {
      args: { capability: string; reason?: string };
      value: unknown;
    };
  };
  "lime.secrets": {
    getRef: { args: { key: string }; value: { ref: string } };
    requestBinding: { args: { key: string; reason?: string }; value: unknown };
  };
  "lime.evidence": {
    record: {
      args: { kind: string; message: string; refs?: string[] };
      value: AgentAppEvidenceRecord;
    };
    linkArtifact: {
      args: { evidenceId: string; artifactId: string };
      value: unknown;
    };
  };
}

export type LimeCapabilityMethod<
  Capability extends LimeCapabilityName,
> = Extract<keyof LimeCapabilityContractMap[Capability], string>;

type LimeCapabilitySpec<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilityContractMap[Capability][Method] extends {
  args: infer Args;
  value: infer Value;
}
  ? { args: Args; value: Value }
  : never;

export type LimeCapabilityArgs<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilitySpec<Capability, Method>["args"];

export type LimeCapabilityValue<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilitySpec<Capability, Method>["value"];

export type LimeTypedCapabilityInvokeRequest<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilityInvokeRequest<
  Capability,
  Method,
  LimeCapabilityArgs<Capability, Method>
>;

export type LimeTypedCapabilityInvokeResponse<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilityInvokeResponse<LimeCapabilityValue<Capability, Method>>;

export interface BuildLimeCapabilityInvokeRequestParams<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> {
  capability: Capability;
  method: Method;
  args?: LimeCapabilityArgs<Capability, Method>;
  requestId?: string;
  idempotencyKey?: string;
  expectedSchema?: unknown;
  provenance?: LimeCapabilityInvokeProvenance;
}

export interface LimeCapabilityTransport {
  dispatch(
    request: LimeCapabilityInvokeRequest,
  ): Promise<LimeCapabilityInvokeResponse>;
}

export interface LimeCapabilityInvoker {
  call<
    Capability extends LimeCapabilityName,
    Method extends LimeCapabilityMethod<Capability>,
  >(
    request: LimeTypedCapabilityInvokeRequest<Capability, Method>,
  ): Promise<LimeTypedCapabilityInvokeResponse<Capability, Method>>;
}

export type LimeCapabilityMockHandler = (
  request: LimeCapabilityInvokeRequest,
) => Promise<unknown> | unknown;

export type LimeCapabilityMockHandlers = Partial<
  Record<LimeCapabilityName, Partial<Record<string, LimeCapabilityMockHandler>>>
>;

function attachOptional<T extends object>(target: T, values: Partial<T>): T {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  });
  return target;
}

export function buildLimeCapabilityInvokeProvenance(
  provenance: AgentAppProvenance,
): LimeCapabilityInvokeProvenance {
  return attachOptional<LimeCapabilityInvokeProvenance>(
    {
      appId: provenance.appId,
      packageHash: provenance.packageHash,
      manifestHash: provenance.manifestHash,
    },
    {
      entryKey: provenance.entryKey,
      workflowRunId: provenance.workflowRunId,
      workspaceId: provenance.workspaceId,
      taskId: provenance.taskId,
    },
  );
}

export function buildLimeCapabilityInvokeRequest<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
>(
  params: BuildLimeCapabilityInvokeRequestParams<Capability, Method>,
): LimeTypedCapabilityInvokeRequest<Capability, Method> {
  return attachOptional<LimeTypedCapabilityInvokeRequest<Capability, Method>>(
    {
      capability: params.capability,
      method: params.method,
    },
    {
      args: params.args,
      requestId: params.requestId,
      idempotencyKey: params.idempotencyKey,
      expectedSchema: params.expectedSchema,
      provenance: params.provenance,
    },
  );
}

export function createLimeCapabilitySuccessResponse<Value>(
  value: Value,
  meta: { traceId?: string; evidenceId?: string } = {},
): LimeCapabilityInvokeResponse<Value> {
  return attachOptional<LimeCapabilityInvokeResponse<Value>>(
    {
      ok: true,
      value,
    },
    meta,
  );
}

export function createLimeCapabilityErrorResponse(
  error: unknown,
  context: LimeCapabilityErrorContext = {},
): LimeCapabilityInvokeResponse<never> {
  return {
    ok: false,
    error: toLimeCapabilityError(error, context),
  };
}

export function createLimeCapabilityInvoker(
  transport: LimeCapabilityTransport,
): LimeCapabilityInvoker {
  return {
    async call(request) {
      try {
        return (await transport.dispatch(
          request,
        )) as LimeTypedCapabilityInvokeResponse<
          typeof request.capability,
          typeof request.method
        >;
      } catch (error) {
        return createLimeCapabilityErrorResponse(error, {
          capability: request.capability,
          method: request.method,
          requestId: request.requestId,
        }) as LimeTypedCapabilityInvokeResponse<
          typeof request.capability,
          typeof request.method
        >;
      }
    },
  };
}

export function createMockLimeCapabilityTransport(
  handlers: LimeCapabilityMockHandlers = {},
): LimeCapabilityTransport {
  return {
    async dispatch(request) {
      const handler = handlers[request.capability]?.[request.method];
      if (!handler) {
        return createLimeCapabilityErrorResponse(
          {
            code: "UNSUPPORTED_CAPABILITY_METHOD",
            message: `${request.capability}.${request.method} is not available in the mock host.`,
          },
          {
            capability: request.capability,
            method: request.method,
            requestId: request.requestId,
          },
        );
      }

      try {
        return createLimeCapabilitySuccessResponse(await handler(request));
      } catch (error) {
        return createLimeCapabilityErrorResponse(error, {
          capability: request.capability,
          method: request.method,
          requestId: request.requestId,
        });
      }
    },
  };
}
