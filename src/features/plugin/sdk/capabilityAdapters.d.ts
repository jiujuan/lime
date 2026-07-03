import { type LimeCapabilityArgs, type LimeCapabilityInvokeProvenance, type LimeCapabilityInvoker, type LimeCapabilityMethod, type LimeCapabilityName, type LimeCapabilityValue } from "./capabilityContract";
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
export declare class LimeCapabilityAdapterError extends Error {
    readonly error: LimeCapabilityError;
    readonly code: LimeCapabilityError["code"];
    readonly causeCode?: string;
    readonly capability?: string;
    readonly method?: string;
    readonly requestId?: string;
    constructor(error: LimeCapabilityError);
}
type CapabilityAdapterMethod<Capability extends LimeCapabilityName, Method extends LimeCapabilityMethod<Capability>> = (args: LimeCapabilityArgs<Capability, Method>, options?: LimeCapabilityAdapterCallOptions) => Promise<LimeCapabilityValue<Capability, Method>>;
type OptionalArgsCapabilityAdapterMethod<Capability extends LimeCapabilityName, Method extends LimeCapabilityMethod<Capability>> = (args?: LimeCapabilityArgs<Capability, Method>, options?: LimeCapabilityAdapterCallOptions) => Promise<LimeCapabilityValue<Capability, Method>>;
type NoArgsCapabilityAdapterMethod<Capability extends LimeCapabilityName, Method extends LimeCapabilityMethod<Capability>> = (options?: LimeCapabilityAdapterCallOptions) => Promise<LimeCapabilityValue<Capability, Method>>;
type CapabilityAdapterMethodFor<Capability extends LimeCapabilityName, Method extends LimeCapabilityMethod<Capability>> = [LimeCapabilityArgs<Capability, Method>] extends [undefined] ? NoArgsCapabilityAdapterMethod<Capability, Method> : undefined extends LimeCapabilityArgs<Capability, Method> ? OptionalArgsCapabilityAdapterMethod<Capability, Method> : CapabilityAdapterMethod<Capability, Method>;
export type LimeCapabilityAdapter<Capability extends LimeCapabilityName> = {
    readonly [Method in LimeCapabilityMethod<Capability>]: CapabilityAdapterMethodFor<Capability, Method>;
};
type LimeCapabilityAdapterKey<Capability extends LimeCapabilityName> = Capability extends `lime.${infer Key}` ? Key : never;
type LimeCapabilityAdapterFor<Capability extends LimeCapabilityName> = Capability extends "lime.storage" ? LimeCapabilityAdapter<Capability> & {
    readonly namespace: string;
} : LimeCapabilityAdapter<Capability>;
export type LimeCoreCapabilityAdapters = {
    readonly [Capability in LimeCapabilityName as LimeCapabilityAdapterKey<Capability>]: LimeCapabilityAdapterFor<Capability>;
};
export type LimeUiCapabilityAdapter = LimeCapabilityAdapter<"lime.ui">;
export type LimeStorageCapabilityAdapter = LimeCapabilityAdapterFor<"lime.storage">;
export type LimeFilesCapabilityAdapter = LimeCapabilityAdapter<"lime.files">;
export type LimeAgentCapabilityAdapter = LimeCapabilityAdapter<"lime.agent">;
export type LimeKnowledgeCapabilityAdapter = LimeCapabilityAdapter<"lime.knowledge">;
export type LimeToolsCapabilityAdapter = LimeCapabilityAdapter<"lime.tools">;
export type LimeArtifactsCapabilityAdapter = LimeCapabilityAdapter<"lime.artifacts">;
export type LimeWorkflowCapabilityAdapter = LimeCapabilityAdapter<"lime.workflow">;
export type LimePolicyCapabilityAdapter = LimeCapabilityAdapter<"lime.policy">;
export type LimeSecretsCapabilityAdapter = LimeCapabilityAdapter<"lime.secrets">;
export type LimeEvidenceCapabilityAdapter = LimeCapabilityAdapter<"lime.evidence">;
export type LimeEventsCapabilityAdapter = LimeCapabilityAdapter<"lime.events">;
export type LimeCapabilitiesCapabilityAdapter = LimeCapabilityAdapter<"lime.capabilities">;
export type LimeModelsCapabilityAdapter = LimeCapabilityAdapter<"lime.models">;
export type LimeUsageCapabilityAdapter = LimeCapabilityAdapter<"lime.usage">;
export type LimeMemoryCapabilityAdapter = LimeCapabilityAdapter<"lime.memory">;
export type LimeSkillsCapabilityAdapter = LimeCapabilityAdapter<"lime.skills">;
export type LimeMcpCapabilityAdapter = LimeCapabilityAdapter<"lime.mcp">;
export type LimeBrowserCapabilityAdapter = LimeCapabilityAdapter<"lime.browser">;
export type LimeSearchCapabilityAdapter = LimeCapabilityAdapter<"lime.search">;
export type LimeDocumentsCapabilityAdapter = LimeCapabilityAdapter<"lime.documents">;
export type LimeMediaCapabilityAdapter = LimeCapabilityAdapter<"lime.media">;
export type LimeTerminalCapabilityAdapter = LimeCapabilityAdapter<"lime.terminal">;
export type LimeTasksCapabilityAdapter = LimeCapabilityAdapter<"lime.tasks">;
export type LimeSettingsCapabilityAdapter = LimeCapabilityAdapter<"lime.settings">;
export type LimeWorkspaceCapabilityAdapter = LimeCapabilityAdapter<"lime.workspace">;
export type LimeContextCapabilityAdapter = LimeCapabilityAdapter<"lime.context">;
export type LimeConnectorsCapabilityAdapter = LimeCapabilityAdapter<"lime.connectors">;
export type LimeAutomationCapabilityAdapter = LimeCapabilityAdapter<"lime.automation">;
export type LimeReviewCapabilityAdapter = LimeCapabilityAdapter<"lime.review">;
export declare function createLimeCoreCapabilityAdapters(options: CreateLimeCoreCapabilityAdaptersOptions): LimeCoreCapabilityAdapters;
export {};
