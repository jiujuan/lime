import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppKnowledgeSearchResult,
  AgentAppRunResult,
  AgentAppStorageEntry,
  AgentAppTaskHostResponseRequest,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppTaskRequest,
  AgentAppTaskStreamEvent,
  AgentAppUninstallResult,
  AgentAppProvenanceQuery,
  AppCleanupPlan,
  ProjectedEntry,
} from "../types";

export interface LimeStorageCapability {
  readonly namespace: string;
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<AgentAppStorageEntry>;
  list(): Promise<AgentAppStorageEntry[]>;
  delete(key: string): Promise<boolean>;
}

export interface LimeArtifactsCapability {
  create(input: {
    kind: string;
    title: string;
    content: unknown;
  }): Promise<AgentAppArtifactRecord>;
  list(): Promise<AgentAppArtifactRecord[]>;
}

export interface LimeEvidenceCapability {
  record(input: {
    kind: string;
    message: string;
    refs?: string[];
  }): Promise<AgentAppEvidenceRecord>;
  list(): Promise<AgentAppEvidenceRecord[]>;
}

export interface LimeKnowledgeCapability {
  search(input: {
    query: string;
    limit?: number;
  }): Promise<AgentAppKnowledgeSearchResult>;
}

export interface AgentAppTaskLookup {
  taskId: string;
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
  startTask(input: AgentAppTaskRequest): Promise<AgentAppTaskRecord>;
  streamTask(task: string | AgentAppTaskLookup): Promise<AgentAppTaskStreamEvent[]>;
  getTask(task: string | AgentAppTaskLookup): Promise<AgentAppTaskRecord | null>;
  cancelTask(task: string | AgentAppTaskLookup): Promise<AgentAppTaskRecord>;
  retryTask(task: string | AgentAppTaskLookup): Promise<AgentAppTaskRecord>;
  submitHostResponse(
    input: AgentAppTaskHostResponseRequest,
  ): Promise<AgentAppTaskHostResponseResult>;
  listTasks(): Promise<AgentAppTaskRecord[]>;
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
  runEntry(entryKey: string): Promise<AgentAppRunResult>;
  getArtifacts(query?: AgentAppProvenanceQuery): AgentAppArtifactRecord[];
  getEvidence(query?: AgentAppProvenanceQuery): AgentAppEvidenceRecord[];
  getStorageEntries(query?: AgentAppProvenanceQuery): AgentAppStorageEntry[];
  getTasks(query?: AgentAppProvenanceQuery): AgentAppTaskRecord[];
  uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<AgentAppUninstallResult>;
}
