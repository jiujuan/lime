import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginKnowledgeSearchResult,
  PluginRunResult,
  PluginStorageEntry,
  PluginTaskHostResponseRequest,
  PluginTaskHostResponseResult,
  PluginTaskRecord,
  PluginTaskRequest,
  PluginTaskStreamEvent,
  PluginUninstallResult,
  PluginProvenanceQuery,
  AppCleanupPlan,
  ProjectedEntry,
} from "../types";

export interface LimeStorageCapability {
  readonly namespace: string;
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<PluginStorageEntry>;
  list(): Promise<PluginStorageEntry[]>;
  delete(key: string): Promise<boolean>;
}

export interface LimeArtifactsCapability {
  create(input: {
    kind: string;
    title: string;
    content: unknown;
  }): Promise<PluginArtifactRecord>;
  list(): Promise<PluginArtifactRecord[]>;
}

export interface LimeEvidenceCapability {
  record(input: {
    kind: string;
    message: string;
    refs?: string[];
  }): Promise<PluginEvidenceRecord>;
  list(): Promise<PluginEvidenceRecord[]>;
}

export interface LimeKnowledgeCapability {
  search(input: {
    query: string;
    limit?: number;
  }): Promise<PluginKnowledgeSearchResult>;
}

export interface PluginTaskLookup {
  taskId: string;
  threadId?: string;
  sessionId?: string;
  traceId?: string;
  turnId?: string;
  workspaceId?: string;
  title?: string;
  taskKind?: string;
  input?: unknown;
  expectedOutput?: unknown;
  startedAt?: string;
}

export interface LimeAgentCapability {
  startTask(input: PluginTaskRequest): Promise<PluginTaskRecord>;
  streamTask(task: string | PluginTaskLookup): Promise<PluginTaskStreamEvent[]>;
  getTask(task: string | PluginTaskLookup): Promise<PluginTaskRecord | null>;
  cancelTask(task: string | PluginTaskLookup): Promise<PluginTaskRecord>;
  retryTask(task: string | PluginTaskLookup): Promise<PluginTaskRecord>;
  submitHostResponse(
    input: PluginTaskHostResponseRequest,
  ): Promise<PluginTaskHostResponseResult>;
  listTasks(): Promise<PluginTaskRecord[]>;
}

export interface LimeAppSdk {
  readonly appId: string;
  readonly entry: ProjectedEntry;
  readonly storage: LimeStorageCapability;
  readonly artifacts: LimeArtifactsCapability;
  readonly evidence: LimeEvidenceCapability;
  readonly knowledge: LimeKnowledgeCapability;
  readonly agent: LimeAgentCapability;
}

export interface CapabilityHost {
  createSdkContext(entryKey: string, runId?: string): LimeAppSdk;
  runEntry(entryKey: string): Promise<PluginRunResult>;
  getArtifacts(query?: PluginProvenanceQuery): PluginArtifactRecord[];
  getEvidence(query?: PluginProvenanceQuery): PluginEvidenceRecord[];
  getStorageEntries(query?: PluginProvenanceQuery): PluginStorageEntry[];
  getTasks(query?: PluginProvenanceQuery): PluginTaskRecord[];
  uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<PluginUninstallResult>;
}
