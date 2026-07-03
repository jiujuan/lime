import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginKnowledgeSearchResult,
  PluginProvenance,
  PluginStorageEntry,
  PluginTaskHostResponseRequest,
  PluginTaskHostResponseResult,
  PluginTaskRecord,
  PluginTaskRequest,
  PluginTaskStreamEvent,
} from "../types";
import {
  type LimeCapabilityError,
  type LimeCapabilityErrorContext,
} from "./capabilityErrors";
import type { LimeCapabilityName } from "./capabilityCatalog";
export { LIME_CAPABILITY_NAMES } from "./capabilityCatalog";
export type { LimeCapabilityName } from "./capabilityCatalog";
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
      value: {
        accepted: true;
      };
    };
    navigate: {
      args: {
        route?: string;
        url?: string;
      };
      value: {
        navigatedTo: string;
      };
    };
    openExternal: {
      args: {
        url: string;
      };
      value: {
        opened: true;
      };
    };
    download: {
      args: {
        url: string;
        fileName?: string;
      };
      value: {
        downloaded: true;
      };
    };
    selectDirectory: {
      args:
        | {
            title?: string;
          }
        | undefined;
      value: {
        path: string | null;
        cancelled: boolean;
      };
    };
    getSnapshot: {
      args: undefined;
      value: unknown;
    };
    openAgentRun: {
      args: {
        taskId?: string;
        bridgeAction?: string;
        title?: string;
        mode?: "drawer" | "modal" | "page";
        expectedOutput?: unknown;
        runtimeProcess?: unknown;
        task?: unknown;
        snapshot?: unknown;
        events?: unknown[];
      };
      value: {
        opened: true;
        surface: "host_agent_run";
        mode: "drawer" | "modal" | "page";
        taskId?: string;
      };
    };
    updateAgentRun: {
      args: {
        taskId?: string;
        bridgeAction?: string;
        title?: string;
        runtimeProcess?: unknown;
        task?: unknown;
        snapshot?: unknown;
        events?: unknown[];
        runtimeFacts?: unknown;
      };
      value: {
        updated: true;
        surface: "host_agent_run";
        taskId?: string;
      };
    };
    closeAgentRun: {
      args:
        | {
            taskId?: string;
            bridgeAction?: string;
          }
        | undefined;
      value: {
        closed: true;
        surface: "host_agent_run";
        taskId?: string;
      };
    };
  };
  "lime.storage": {
    get: {
      args: {
        key: string;
      };
      value: unknown | null;
    };
    set: {
      args: {
        key: string;
        value: unknown;
      };
      value: PluginStorageEntry;
    };
    list: {
      args: undefined;
      value: PluginStorageEntry[];
    };
    delete: {
      args: {
        key: string;
      };
      value: boolean;
    };
  };
  "lime.files": {
    pick: {
      args: {
        accept?: string[];
        multiple?: boolean;
      };
      value: unknown;
    };
    readRef: {
      args: {
        ref: string;
      };
      value: unknown;
    };
    parse: {
      args: {
        ref: string;
        parser?: string;
        outputSchema?: unknown;
      };
      value: unknown;
    };
  };
  "lime.agent": {
    startTask: {
      args: PluginTaskRequest;
      value: PluginTaskRecord;
    };
    streamTask: {
      args: {
        taskId: string;
      };
      value: PluginTaskStreamEvent[];
    };
    getTask: {
      args: {
        taskId: string;
      };
      value: PluginTaskRecord | null;
    };
    cancelTask: {
      args: {
        taskId: string;
      };
      value: PluginTaskRecord;
    };
    retryTask: {
      args: {
        taskId: string;
      };
      value: PluginTaskRecord;
    };
    submitHostResponse: {
      args: PluginTaskHostResponseRequest;
      value: PluginTaskHostResponseResult;
    };
    listTasks: {
      args: undefined;
      value: PluginTaskRecord[];
    };
  };
  "lime.knowledge": {
    search: {
      args: {
        query: string;
        limit?: number;
      };
      value: PluginKnowledgeSearchResult;
    };
    bindStatus: {
      args: {
        key: string;
      };
      value: unknown;
    };
    bind: {
      args: {
        key: string;
        mode?: string;
      };
      value: unknown;
    };
    export: {
      args: {
        key: string;
        format?: string;
      };
      value: unknown;
    };
  };
  "lime.tools": {
    invoke: {
      args: {
        tool: string;
        input?: unknown;
      };
      value: unknown;
    };
    getProgress: {
      args: {
        invocationId: string;
      };
      value: unknown;
    };
  };
  "lime.artifacts": {
    create: {
      args: {
        kind: string;
        title: string;
        content: unknown;
      };
      value: PluginArtifactRecord;
    };
    open: {
      args: {
        artifactId: string;
      };
      value: unknown;
    };
    export: {
      args: {
        artifactId: string;
        format?: string;
      };
      value: unknown;
    };
    list: {
      args:
        | {
            kind?: string;
            limit?: number;
          }
        | undefined;
      value: PluginArtifactRecord[];
    };
  };
  "lime.workflow": {
    start: {
      args: {
        workflowKey: string;
        input?: unknown;
      };
      value: unknown;
    };
    checkpoint: {
      args: {
        workflowRunId: string;
        state?: unknown;
      };
      value: unknown;
    };
    awaitHuman: {
      args: {
        workflowRunId: string;
        prompt: string;
      };
      value: unknown;
    };
  };
  "lime.policy": {
    check: {
      args: {
        capability: string;
        action?: string;
      };
      value: unknown;
    };
    requestPermission: {
      args: {
        capability: string;
        reason?: string;
      };
      value: unknown;
    };
  };
  "lime.secrets": {
    getRef: {
      args: {
        key: string;
      };
      value: {
        ref: string;
      };
    };
    requestBinding: {
      args: {
        key: string;
        reason?: string;
      };
      value: unknown;
    };
  };
  "lime.evidence": {
    record: {
      args: {
        kind: string;
        message: string;
        refs?: string[];
      };
      value: PluginEvidenceRecord;
    };
    linkArtifact: {
      args: {
        evidenceId: string;
        artifactId: string;
      };
      value: unknown;
    };
    list: {
      args:
        | {
            kind?: string;
            limit?: number;
          }
        | undefined;
      value: PluginEvidenceRecord[];
    };
  };
  "lime.events": {
    emit: {
      args: {
        topic: string;
        payload?: unknown;
      };
      value: unknown;
    };
    subscribe: {
      args: {
        topic: string;
      };
      value: unknown;
    };
    unsubscribe: {
      args: {
        subscriptionId: string;
      };
      value: unknown;
    };
    listSubscriptions: {
      args: undefined;
      value: unknown;
    };
  };
  "lime.capabilities": {
    list: {
      args: undefined;
      value: unknown;
    };
    get: {
      args: {
        capability: string;
      };
      value: unknown;
    };
    getProfile: {
      args: undefined;
      value: unknown;
    };
  };
  "lime.models": {
    list: {
      args:
        | {
            taskKind?: string;
          }
        | undefined;
      value: unknown;
    };
    select: {
      args: {
        taskKind: string;
        constraints?: unknown;
      };
      value: unknown;
    };
    getRouting: {
      args:
        | {
            taskKind?: string;
          }
        | undefined;
      value: unknown;
    };
    estimateCost: {
      args: {
        taskKind: string;
        input?: unknown;
      };
      value: unknown;
    };
  };
  "lime.usage": {
    getTokenUsage: {
      args:
        | {
            taskId?: string;
            window?: string;
          }
        | undefined;
      value: unknown;
    };
    getCostSummary: {
      args:
        | {
            taskId?: string;
            window?: string;
          }
        | undefined;
      value: unknown;
    };
    getBudget: {
      args:
        | {
            scope?: string;
          }
        | undefined;
      value: unknown;
    };
  };
  "lime.memory": {
    query: {
      args: {
        query: string;
        scope?: string;
      };
      value: unknown;
    };
    write: {
      args: {
        scope: string;
        value: unknown;
      };
      value: unknown;
    };
    compact: {
      args:
        | {
            scope?: string;
            reason?: string;
          }
        | undefined;
      value: unknown;
    };
    getStatus: {
      args:
        | {
            scope?: string;
          }
        | undefined;
      value: unknown;
    };
  };
  "lime.skills": {
    list: {
      args:
        | {
            kind?: string;
          }
        | undefined;
      value: unknown;
    };
    resolve: {
      args: {
        skillId: string;
      };
      value: unknown;
    };
    bind: {
      args: {
        skillId: string;
        reason?: string;
      };
      value: unknown;
    };
    invoke: {
      args: {
        skillId: string;
        input?: unknown;
      };
      value: unknown;
    };
    getInvocation: {
      args: {
        invocationId: string;
      };
      value: unknown;
    };
  };
  "lime.mcp": {
    listServers: {
      args: undefined;
      value: unknown;
    };
    listTools: {
      args:
        | {
            serverId?: string;
          }
        | undefined;
      value: unknown;
    };
    invoke: {
      args: {
        tool: string;
        input?: unknown;
      };
      value: unknown;
    };
  };
  "lime.browser": {
    open: {
      args: {
        url?: string;
        profile?: string;
      };
      value: unknown;
    };
    navigate: {
      args: {
        sessionId: string;
        url: string;
      };
      value: unknown;
    };
    extract: {
      args: {
        sessionId: string;
        selector?: string;
      };
      value: unknown;
    };
    screenshot: {
      args: {
        sessionId: string;
        fullPage?: boolean;
      };
      value: unknown;
    };
    close: {
      args: {
        sessionId: string;
      };
      value: unknown;
    };
  };
  "lime.search": {
    query: {
      args: {
        query: string;
        limit?: number;
      };
      value: unknown;
    };
    deepResearch: {
      args: {
        query: string;
        depth?: number;
      };
      value: unknown;
    };
    getRun: {
      args: {
        runId: string;
      };
      value: unknown;
    };
  };
  "lime.documents": {
    parse: {
      args: {
        ref: string;
        outputSchema?: unknown;
      };
      value: unknown;
    };
    export: {
      args: {
        artifactId: string;
        format: string;
      };
      value: unknown;
    };
    transform: {
      args: {
        ref: string;
        operation: string;
        options?: unknown;
      };
      value: unknown;
    };
    summarize: {
      args: {
        ref: string;
        instruction?: string;
      };
      value: unknown;
    };
  };
  "lime.media": {
    generateImage: {
      args: {
        prompt: string;
        options?: unknown;
      };
      value: unknown;
    };
    editImage: {
      args: {
        ref: string;
        prompt: string;
        options?: unknown;
      };
      value: unknown;
    };
    transcribe: {
      args: {
        ref: string;
        options?: unknown;
      };
      value: unknown;
    };
    synthesizeVoice: {
      args: {
        text: string;
        voice?: string;
        options?: unknown;
      };
      value: unknown;
    };
  };
  "lime.terminal": {
    run: {
      args: {
        command: string;
        cwdRef?: string;
        reason?: string;
      };
      value: unknown;
    };
    getRun: {
      args: {
        runId: string;
      };
      value: unknown;
    };
    cancel: {
      args: {
        runId: string;
      };
      value: unknown;
    };
  };
  "lime.tasks": {
    list: {
      args:
        | {
            status?: string;
            limit?: number;
          }
        | undefined;
      value: unknown;
    };
    get: {
      args: {
        taskId: string;
      };
      value: unknown;
    };
    cancel: {
      args: {
        taskId: string;
      };
      value: unknown;
    };
    subscribe: {
      args: {
        taskId: string;
      };
      value: unknown;
    };
  };
  "lime.settings": {
    get: {
      args: {
        key: string;
      };
      value: unknown;
    };
    set: {
      args: {
        key: string;
        value: unknown;
        reason?: string;
      };
      value: unknown;
    };
    list: {
      args:
        | {
            namespace?: string;
          }
        | undefined;
      value: unknown;
    };
  };
  "lime.workspace": {
    getCurrent: {
      args: undefined;
      value: unknown;
    };
    list: {
      args: undefined;
      value: unknown;
    };
    open: {
      args: {
        workspaceId: string;
      };
      value: unknown;
    };
    getPathRef: {
      args: {
        purpose: string;
        path?: string;
      };
      value: unknown;
    };
  };
  "lime.context": {
    getSnapshot: {
      args:
        | {
            scope?: string;
          }
        | undefined;
      value: unknown;
    };
    attach: {
      args: {
        ref: string;
        kind?: string;
      };
      value: unknown;
    };
    detach: {
      args: {
        ref: string;
      };
      value: unknown;
    };
  };
  "lime.connectors": {
    list: {
      args:
        | {
            kind?: string;
          }
        | undefined;
      value: unknown;
    };
    requestAuth: {
      args: {
        connectorId: string;
        reason?: string;
      };
      value: unknown;
    };
    getStatus: {
      args: {
        connectorId: string;
      };
      value: unknown;
    };
    invoke: {
      args: {
        connectorId: string;
        action: string;
        input?: unknown;
      };
      value: unknown;
    };
  };
  "lime.cloudSession": {
    getSnapshot: {
      args: undefined;
      value: unknown;
    };
    getAccessToken: {
      args: undefined;
      value: {
        accessToken: string;
        tenantId: string;
        controlPlaneBaseUrl?: string;
        expiresAt?: string;
      };
    };
    requestLogin: {
      args: undefined;
      value: {
        controlPlaneBaseUrl?: string;
        hasSession: boolean;
        tenantId?: string;
      };
    };
  };
  "lime.automation": {
    startJob: {
      args: {
        jobKind: string;
        input?: unknown;
      };
      value: unknown;
    };
    getJob: {
      args: {
        jobId: string;
      };
      value: unknown;
    };
    cancelJob: {
      args: {
        jobId: string;
      };
      value: unknown;
    };
  };
  "lime.review": {
    requestDecision: {
      args: {
        subject: string;
        payload?: unknown;
      };
      value: unknown;
    };
    submitDecision: {
      args: {
        decisionId: string;
        decision: string;
        note?: string;
      };
      value: unknown;
    };
    listPending: {
      args:
        | {
            subject?: string;
          }
        | undefined;
      value: unknown;
    };
  };
}
export type LimeCapabilityMethod<Capability extends LimeCapabilityName> =
  Extract<keyof LimeCapabilityContractMap[Capability], string>;
type LimeCapabilitySpec<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
> = LimeCapabilityContractMap[Capability][Method] extends {
  args: infer Args;
  value: infer Value;
}
  ? {
      args: Args;
      value: Value;
    }
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
export declare function buildLimeCapabilityInvokeProvenance(
  provenance: PluginProvenance,
): LimeCapabilityInvokeProvenance;
export declare function buildLimeCapabilityInvokeRequest<
  Capability extends LimeCapabilityName,
  Method extends LimeCapabilityMethod<Capability>,
>(
  params: BuildLimeCapabilityInvokeRequestParams<Capability, Method>,
): LimeTypedCapabilityInvokeRequest<Capability, Method>;
export declare function createLimeCapabilitySuccessResponse<Value>(
  value: Value,
  meta?: {
    traceId?: string;
    evidenceId?: string;
  },
): LimeCapabilityInvokeResponse<Value>;
export declare function createLimeCapabilityErrorResponse(
  error: unknown,
  context?: LimeCapabilityErrorContext,
): LimeCapabilityInvokeResponse<never>;
export declare function createLimeCapabilityInvoker(
  transport: LimeCapabilityTransport,
): LimeCapabilityInvoker;
