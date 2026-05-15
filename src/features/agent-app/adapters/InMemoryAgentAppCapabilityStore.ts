import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppProvenanceQuery,
  AgentAppStorageEntry,
  AgentAppTaskRecord,
} from "../types";
import { matchesAgentAppProvenanceQuery } from "../sdk/provenanceQuery";

export interface AgentAppCapabilityStoreClearResult {
  storageKeys: string[];
  artifactIds: string[];
  evidenceIds: string[];
  taskIds: string[];
}

function storageId(appId: string, key: string): string {
  return `${appId}:${key}`;
}

export class InMemoryAgentAppCapabilityStore {
  private readonly storageEntries = new Map<string, AgentAppStorageEntry>();
  private readonly artifacts: AgentAppArtifactRecord[] = [];
  private readonly evidence: AgentAppEvidenceRecord[] = [];
  private readonly tasks: AgentAppTaskRecord[] = [];
  private artifactCounter = 0;
  private evidenceCounter = 0;
  private taskCounter = 0;

  getStorage(appId: string, key: string): AgentAppStorageEntry | null {
    return this.storageEntries.get(storageId(appId, key)) ?? null;
  }

  setStorage(entry: AgentAppStorageEntry): AgentAppStorageEntry {
    const appId = entry.appId ?? entry.provenance.appId;
    const nextEntry = { ...entry, appId };
    this.storageEntries.set(storageId(appId, entry.key), nextEntry);
    return nextEntry;
  }

  listStorage(query?: AgentAppProvenanceQuery): AgentAppStorageEntry[] {
    return Array.from(this.storageEntries.values()).filter((entry) =>
      matchesAgentAppProvenanceQuery(entry.provenance, query),
    );
  }

  deleteStorage(appId: string, key: string): boolean {
    return this.storageEntries.delete(storageId(appId, key));
  }

  createArtifact(input: Omit<AgentAppArtifactRecord, "id">): AgentAppArtifactRecord {
    this.artifactCounter += 1;
    const artifact: AgentAppArtifactRecord = {
      ...input,
      id: `adapter-artifact-${this.artifactCounter}`,
    };
    this.artifacts.push(artifact);
    return artifact;
  }

  listArtifacts(query?: AgentAppProvenanceQuery): AgentAppArtifactRecord[] {
    return this.artifacts.filter((artifact) =>
      matchesAgentAppProvenanceQuery(artifact.provenance, query),
    );
  }

  recordEvidence(input: Omit<AgentAppEvidenceRecord, "id">): AgentAppEvidenceRecord {
    this.evidenceCounter += 1;
    const evidence: AgentAppEvidenceRecord = {
      ...input,
      id: `adapter-evidence-${this.evidenceCounter}`,
    };
    this.evidence.push(evidence);
    return evidence;
  }

  listEvidence(query?: AgentAppProvenanceQuery): AgentAppEvidenceRecord[] {
    return this.evidence.filter((item) =>
      matchesAgentAppProvenanceQuery(item.provenance, query),
    );
  }

  createTaskId(): string {
    this.taskCounter += 1;
    return `adapter-task-${this.taskCounter}`;
  }

  startTask(input: AgentAppTaskRecord): AgentAppTaskRecord {
    const task: AgentAppTaskRecord = { ...input };
    this.tasks.push(task);
    return task;
  }

  getTask(taskId: string): AgentAppTaskRecord | null {
    return this.tasks.find((task) => task.taskId === taskId) ?? null;
  }

  updateTask(taskId: string, updater: (task: AgentAppTaskRecord) => AgentAppTaskRecord): AgentAppTaskRecord {
    const index = this.tasks.findIndex((task) => task.taskId === taskId);
    if (index < 0) {
      throw new Error(`Agent App task ${taskId} was not found.`);
    }
    const nextTask = updater(this.tasks[index]);
    this.tasks[index] = nextTask;
    return nextTask;
  }

  listTasks(query?: AgentAppProvenanceQuery): AgentAppTaskRecord[] {
    return this.tasks.filter((task) =>
      matchesAgentAppProvenanceQuery(task.provenance, query),
    );
  }

  clearAppData(appId: string): AgentAppCapabilityStoreClearResult {
    const storageKeys = this.listStorage({ appId }).map((entry) => entry.key);
    storageKeys.forEach((key) => this.storageEntries.delete(storageId(appId, key)));

    const artifactIds: string[] = [];
    for (let index = this.artifacts.length - 1; index >= 0; index -= 1) {
      if (this.artifacts[index].provenance.appId === appId) {
        artifactIds.push(this.artifacts[index].id);
        this.artifacts.splice(index, 1);
      }
    }

    const evidenceIds: string[] = [];
    for (let index = this.evidence.length - 1; index >= 0; index -= 1) {
      if (this.evidence[index].provenance.appId === appId) {
        evidenceIds.push(this.evidence[index].id);
        this.evidence.splice(index, 1);
      }
    }

    const taskIds: string[] = [];
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      if (this.tasks[index].provenance.appId === appId) {
        taskIds.push(this.tasks[index].taskId);
        this.tasks.splice(index, 1);
      }
    }

    return {
      storageKeys,
      artifactIds: artifactIds.reverse(),
      evidenceIds: evidenceIds.reverse(),
      taskIds: taskIds.reverse(),
    };
  }
}
