import {
  buildLimeCapabilityInvokeRequest,
  type LimeCapabilityArgs,
  type LimeCapabilityInvokeProvenance,
  type LimeCapabilityInvoker,
  type LimeCapabilityMethod,
  type LimeCapabilityName,
  type LimeCapabilityValue,
} from "./capabilityContract";
import type { LimeCapabilityError } from "./capabilityErrors";

export interface LimeCapabilityAdapterCallOptions {
  requestId?: string;
  idempotencyKey?: string;
  expectedSchema?: unknown;
  provenance?: LimeCapabilityInvokeProvenance;
}

export interface CreateLimeCoreCapabilityAdaptersOptions {
  invoker: LimeCapabilityInvoker;
  provenance?: LimeCapabilityInvokeProvenance;
  storageNamespace?: string;
}

export class LimeCapabilityAdapterError extends Error {
  readonly error: LimeCapabilityError;
  readonly code: LimeCapabilityError["code"];
  readonly causeCode?: string;
  readonly capability?: string;
  readonly method?: string;
  readonly requestId?: string;

  constructor(error: LimeCapabilityError) {
    super(error.message);
    this.name = "LimeCapabilityAdapterError";
    this.error = error;
    this.code = error.code;
    this.causeCode = error.causeCode;
    this.capability = error.capability;
    this.method = error.method;
    this.requestId = error.requestId;
  }
}

type CapabilityAdapterMethod<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = (
  args: LimeCapabilityArgs<Capability, Method>,
  options?: LimeCapabilityAdapterCallOptions,
) => Promise<LimeCapabilityValue<Capability, Method>>;

type NoArgsCapabilityAdapterMethod<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = (
  options?: LimeCapabilityAdapterCallOptions,
) => Promise<LimeCapabilityValue<Capability, Method>>;

export interface LimeUiCapabilityAdapter {
  readonly toast: CapabilityAdapterMethod<"lime.ui", "toast">;
  readonly navigate: CapabilityAdapterMethod<"lime.ui", "navigate">;
  readonly openExternal: CapabilityAdapterMethod<"lime.ui", "openExternal">;
  readonly download: CapabilityAdapterMethod<"lime.ui", "download">;
  readonly getSnapshot: NoArgsCapabilityAdapterMethod<
    "lime.ui",
    "getSnapshot"
  >;
}

export interface LimeStorageCapabilityAdapter {
  readonly namespace: string;
  readonly get: CapabilityAdapterMethod<"lime.storage", "get">;
  readonly set: CapabilityAdapterMethod<"lime.storage", "set">;
  readonly list: NoArgsCapabilityAdapterMethod<"lime.storage", "list">;
  readonly delete: CapabilityAdapterMethod<"lime.storage", "delete">;
}

export interface LimeAgentCapabilityAdapter {
  readonly startTask: CapabilityAdapterMethod<"lime.agent", "startTask">;
  readonly streamTask: CapabilityAdapterMethod<"lime.agent", "streamTask">;
  readonly getTask: CapabilityAdapterMethod<"lime.agent", "getTask">;
  readonly cancelTask: CapabilityAdapterMethod<"lime.agent", "cancelTask">;
  readonly retryTask: CapabilityAdapterMethod<"lime.agent", "retryTask">;
  readonly submitHostResponse: CapabilityAdapterMethod<
    "lime.agent",
    "submitHostResponse"
  >;
  readonly listTasks: NoArgsCapabilityAdapterMethod<
    "lime.agent",
    "listTasks"
  >;
}

export interface LimeArtifactsCapabilityAdapter {
  readonly create: CapabilityAdapterMethod<"lime.artifacts", "create">;
  readonly open: CapabilityAdapterMethod<"lime.artifacts", "open">;
  readonly export: CapabilityAdapterMethod<"lime.artifacts", "export">;
}

export interface LimeEvidenceCapabilityAdapter {
  readonly record: CapabilityAdapterMethod<"lime.evidence", "record">;
  readonly linkArtifact: CapabilityAdapterMethod<
    "lime.evidence",
    "linkArtifact"
  >;
}

export interface LimeKnowledgeCapabilityAdapter {
  readonly search: CapabilityAdapterMethod<"lime.knowledge", "search">;
  readonly bindStatus: CapabilityAdapterMethod<"lime.knowledge", "bindStatus">;
}

export interface LimeToolsCapabilityAdapter {
  readonly invoke: CapabilityAdapterMethod<"lime.tools", "invoke">;
  readonly getProgress: CapabilityAdapterMethod<"lime.tools", "getProgress">;
}

export interface LimeCoreCapabilityAdapters {
  readonly ui: LimeUiCapabilityAdapter;
  readonly storage: LimeStorageCapabilityAdapter;
  readonly agent: LimeAgentCapabilityAdapter;
  readonly artifacts: LimeArtifactsCapabilityAdapter;
  readonly evidence: LimeEvidenceCapabilityAdapter;
  readonly knowledge: LimeKnowledgeCapabilityAdapter;
  readonly tools: LimeToolsCapabilityAdapter;
}

async function callCapability<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
>(
  invoker: LimeCapabilityInvoker,
  defaultProvenance: LimeCapabilityInvokeProvenance | undefined,
  capability: Capability,
  method: Method,
  args: LimeCapabilityArgs<Capability, Method> | undefined,
  options: LimeCapabilityAdapterCallOptions | undefined,
): Promise<LimeCapabilityValue<Capability, Method>> {
  const response = await invoker.call(
    buildLimeCapabilityInvokeRequest({
      capability,
      method,
      args: args as LimeCapabilityArgs<Capability, Method>,
      requestId: options?.requestId,
      idempotencyKey: options?.idempotencyKey,
      expectedSchema: options?.expectedSchema,
      provenance: options?.provenance ?? defaultProvenance,
    }),
  );
  if (response.ok) {
    return response.value;
  }
  throw new LimeCapabilityAdapterError(response.error);
}

export function createLimeCoreCapabilityAdapters(
  options: CreateLimeCoreCapabilityAdaptersOptions,
): LimeCoreCapabilityAdapters {
  const { invoker, provenance } = options;
  const call = <
    Capability extends LimeCapabilityName,
    Method extends LimeCapabilityMethod<Capability>,
  >(
    capability: Capability,
    method: Method,
    args: LimeCapabilityArgs<Capability, Method> | undefined,
    callOptions?: LimeCapabilityAdapterCallOptions,
  ) =>
    callCapability(
      invoker,
      provenance,
      capability,
      method,
      args,
      callOptions,
    );

  return {
    ui: {
      toast: (args, callOptions) =>
        call("lime.ui", "toast", args, callOptions),
      navigate: (args, callOptions) =>
        call("lime.ui", "navigate", args, callOptions),
      openExternal: (args, callOptions) =>
        call("lime.ui", "openExternal", args, callOptions),
      download: (args, callOptions) =>
        call("lime.ui", "download", args, callOptions),
      getSnapshot: (callOptions) =>
        call("lime.ui", "getSnapshot", undefined, callOptions),
    },
    storage: {
      namespace: options.storageNamespace ?? provenance?.appId ?? "agent_app",
      get: (args, callOptions) =>
        call("lime.storage", "get", args, callOptions),
      set: (args, callOptions) =>
        call("lime.storage", "set", args, callOptions),
      list: (callOptions) =>
        call("lime.storage", "list", undefined, callOptions),
      delete: (args, callOptions) =>
        call("lime.storage", "delete", args, callOptions),
    },
    agent: {
      startTask: (args, callOptions) =>
        call("lime.agent", "startTask", args, callOptions),
      streamTask: (args, callOptions) =>
        call("lime.agent", "streamTask", args, callOptions),
      getTask: (args, callOptions) =>
        call("lime.agent", "getTask", args, callOptions),
      cancelTask: (args, callOptions) =>
        call("lime.agent", "cancelTask", args, callOptions),
      retryTask: (args, callOptions) =>
        call("lime.agent", "retryTask", args, callOptions),
      submitHostResponse: (args, callOptions) =>
        call("lime.agent", "submitHostResponse", args, callOptions),
      listTasks: (callOptions) =>
        call("lime.agent", "listTasks", undefined, callOptions),
    },
    artifacts: {
      create: (args, callOptions) =>
        call("lime.artifacts", "create", args, callOptions),
      open: (args, callOptions) =>
        call("lime.artifacts", "open", args, callOptions),
      export: (args, callOptions) =>
        call("lime.artifacts", "export", args, callOptions),
    },
    evidence: {
      record: (args, callOptions) =>
        call("lime.evidence", "record", args, callOptions),
      linkArtifact: (args, callOptions) =>
        call("lime.evidence", "linkArtifact", args, callOptions),
    },
    knowledge: {
      search: (args, callOptions) =>
        call("lime.knowledge", "search", args, callOptions),
      bindStatus: (args, callOptions) =>
        call("lime.knowledge", "bindStatus", args, callOptions),
    },
    tools: {
      invoke: (args, callOptions) =>
        call("lime.tools", "invoke", args, callOptions),
      getProgress: (args, callOptions) =>
        call("lime.tools", "getProgress", args, callOptions),
    },
  };
}
