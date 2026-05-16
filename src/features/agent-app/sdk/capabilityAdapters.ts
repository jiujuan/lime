import {
  buildLimeCapabilityInvokeRequest,
  type LimeCapabilityArgs,
  type LimeCapabilityInvokeProvenance,
  type LimeCapabilityInvoker,
  type LimeCapabilityMethod,
  type LimeCapabilityName,
  type LimeCapabilityValue,
} from "./capabilityContract";
import {
  LIME_CAPABILITY_DEFINITIONS,
  getLimeCapabilityAdapterKey,
  type LimeCapabilityDefinitionRecord,
} from "./capabilityCatalog";
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

type OptionalArgsCapabilityAdapterMethod<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = (
  args?: LimeCapabilityArgs<Capability, Method>,
  options?: LimeCapabilityAdapterCallOptions,
) => Promise<LimeCapabilityValue<Capability, Method>>;

type NoArgsCapabilityAdapterMethod<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = (
  options?: LimeCapabilityAdapterCallOptions,
) => Promise<LimeCapabilityValue<Capability, Method>>;

type CapabilityAdapterMethodFor<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = [LimeCapabilityArgs<Capability, Method>] extends [undefined]
  ? NoArgsCapabilityAdapterMethod<Capability, Method>
  : undefined extends LimeCapabilityArgs<Capability, Method>
    ? OptionalArgsCapabilityAdapterMethod<Capability, Method>
    : CapabilityAdapterMethod<Capability, Method>;

export type LimeCapabilityAdapter<Capability extends LimeCapabilityName> = {
  readonly [Method in LimeCapabilityMethod<Capability>]: CapabilityAdapterMethodFor<
    Capability,
    Method
  >;
};

type LimeCapabilityAdapterKey<Capability extends LimeCapabilityName> =
  Capability extends `lime.${infer Key}` ? Key : never;

type LimeCapabilityAdapterFor<Capability extends LimeCapabilityName> =
  Capability extends "lime.storage"
    ? LimeCapabilityAdapter<Capability> & { readonly namespace: string }
    : LimeCapabilityAdapter<Capability>;

export type LimeCoreCapabilityAdapters = {
  readonly [Capability in LimeCapabilityName as LimeCapabilityAdapterKey<Capability>]: LimeCapabilityAdapterFor<Capability>;
};

export type LimeUiCapabilityAdapter = LimeCapabilityAdapter<"lime.ui">;
export type LimeStorageCapabilityAdapter =
  LimeCapabilityAdapterFor<"lime.storage">;
export type LimeFilesCapabilityAdapter = LimeCapabilityAdapter<"lime.files">;
export type LimeAgentCapabilityAdapter = LimeCapabilityAdapter<"lime.agent">;
export type LimeKnowledgeCapabilityAdapter =
  LimeCapabilityAdapter<"lime.knowledge">;
export type LimeToolsCapabilityAdapter = LimeCapabilityAdapter<"lime.tools">;
export type LimeArtifactsCapabilityAdapter =
  LimeCapabilityAdapter<"lime.artifacts">;
export type LimeWorkflowCapabilityAdapter =
  LimeCapabilityAdapter<"lime.workflow">;
export type LimePolicyCapabilityAdapter = LimeCapabilityAdapter<"lime.policy">;
export type LimeSecretsCapabilityAdapter =
  LimeCapabilityAdapter<"lime.secrets">;
export type LimeEvidenceCapabilityAdapter =
  LimeCapabilityAdapter<"lime.evidence">;
export type LimeEventsCapabilityAdapter = LimeCapabilityAdapter<"lime.events">;
export type LimeCapabilitiesCapabilityAdapter =
  LimeCapabilityAdapter<"lime.capabilities">;
export type LimeModelsCapabilityAdapter = LimeCapabilityAdapter<"lime.models">;
export type LimeUsageCapabilityAdapter = LimeCapabilityAdapter<"lime.usage">;
export type LimeMemoryCapabilityAdapter = LimeCapabilityAdapter<"lime.memory">;
export type LimeSkillsCapabilityAdapter = LimeCapabilityAdapter<"lime.skills">;
export type LimeMcpCapabilityAdapter = LimeCapabilityAdapter<"lime.mcp">;
export type LimeBrowserCapabilityAdapter =
  LimeCapabilityAdapter<"lime.browser">;
export type LimeSearchCapabilityAdapter = LimeCapabilityAdapter<"lime.search">;
export type LimeDocumentsCapabilityAdapter =
  LimeCapabilityAdapter<"lime.documents">;
export type LimeMediaCapabilityAdapter = LimeCapabilityAdapter<"lime.media">;
export type LimeTerminalCapabilityAdapter =
  LimeCapabilityAdapter<"lime.terminal">;
export type LimeTasksCapabilityAdapter = LimeCapabilityAdapter<"lime.tasks">;
export type LimeSettingsCapabilityAdapter =
  LimeCapabilityAdapter<"lime.settings">;
export type LimeWorkspaceCapabilityAdapter =
  LimeCapabilityAdapter<"lime.workspace">;
export type LimeContextCapabilityAdapter =
  LimeCapabilityAdapter<"lime.context">;
export type LimeConnectorsCapabilityAdapter =
  LimeCapabilityAdapter<"lime.connectors">;
export type LimeAutomationCapabilityAdapter =
  LimeCapabilityAdapter<"lime.automation">;
export type LimeReviewCapabilityAdapter = LimeCapabilityAdapter<"lime.review">;

const NO_ARGS_CAPABILITY_METHOD_KEYS = new Set([
  "lime.ui.getSnapshot",
  "lime.storage.list",
  "lime.agent.listTasks",
  "lime.events.listSubscriptions",
  "lime.capabilities.list",
  "lime.capabilities.getProfile",
  "lime.mcp.listServers",
  "lime.workspace.getCurrent",
  "lime.workspace.list",
]);

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

type BoundCapabilityCall = <
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
>(
  capability: Capability,
  method: Method,
  args: LimeCapabilityArgs<Capability, Method> | undefined,
  callOptions?: LimeCapabilityAdapterCallOptions,
) => Promise<LimeCapabilityValue<Capability, Method>>;

function createCapabilityAdapter<Capability extends LimeCapabilityName>(
  definition: LimeCapabilityDefinitionRecord & { name: Capability },
  call: BoundCapabilityCall,
): LimeCapabilityAdapter<Capability> {
  const adapter: Record<string, unknown> = {};
  definition.methods.forEach((methodName) => {
    const method = methodName as LimeCapabilityMethod<Capability>;
    const methodKey = `${definition.name}.${methodName}`;
    adapter[methodName] = (argsOrOptions?: unknown, maybeOptions?: unknown) => {
      if (NO_ARGS_CAPABILITY_METHOD_KEYS.has(methodKey)) {
        return call(
          definition.name,
          method,
          undefined,
          argsOrOptions as LimeCapabilityAdapterCallOptions | undefined,
        );
      }
      return call(
        definition.name,
        method,
        argsOrOptions as LimeCapabilityArgs<Capability, typeof method>,
        maybeOptions as LimeCapabilityAdapterCallOptions | undefined,
      );
    };
  });
  return adapter as LimeCapabilityAdapter<Capability>;
}

export function createLimeCoreCapabilityAdapters(
  options: CreateLimeCoreCapabilityAdaptersOptions,
): LimeCoreCapabilityAdapters {
  const { invoker, provenance } = options;
  const call: BoundCapabilityCall = (capability, method, args, callOptions) =>
    callCapability(invoker, provenance, capability, method, args, callOptions);
  const adapters: Record<string, unknown> = {};

  LIME_CAPABILITY_DEFINITIONS.forEach((definition) => {
    const adapter = createCapabilityAdapter(definition, call);
    adapters[getLimeCapabilityAdapterKey(definition.name)] =
      definition.name === "lime.storage"
        ? {
            namespace:
              options.storageNamespace ?? provenance?.appId ?? "agent_app",
            ...adapter,
          }
        : adapter;
  });

  return adapters as LimeCoreCapabilityAdapters;
}
