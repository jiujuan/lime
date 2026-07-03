import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginProvenanceQuery,
  PluginStorageEntry,
  PluginTaskRecord,
} from "../types";
import { matchesPluginProvenanceQuery } from "../sdk/provenanceQuery";

export interface PluginCapabilityStoreClearResult {
  storageKeys: string[];
  artifactIds: string[];
  evidenceIds: string[];
  taskIds: string[];
}

function storageId(appId: string, key: string): string {
  return `${appId}:${key}`;
}

export class InMemoryPluginCapabilityStore {
  private readonly storageEntries = new Map<string, PluginStorageEntry>();
  private readonly artifacts: PluginArtifactRecord[] = [];
  private readonly evidence: PluginEvidenceRecord[] = [];
  private readonly tasks: PluginTaskRecord[] = [];
  private artifactCounter = 0;
  private evidenceCounter = 0;
  private taskCounter = 0;

  getStorage(appId: string, key: string): PluginStorageEntry | null {
    return this.storageEntries.get(storageId(appId, key)) ?? null;
  }

  setStorage(entry: PluginStorageEntry): PluginStorageEntry {
    const appId = entry.appId ?? entry.provenance.appId;
    const nextEntry = { ...entry, appId };
    this.storageEntries.set(storageId(appId, entry.key), nextEntry);
    return nextEntry;
  }

  listStorage(query?: PluginProvenanceQuery): PluginStorageEntry[] {
    return Array.from(this.storageEntries.values()).filter((entry) =>
      matchesPluginProvenanceQuery(entry.provenance, query),
    );
  }

  deleteStorage(appId: string, key: string): boolean {
    return this.storageEntries.delete(storageId(appId, key));
  }

  createArtifact(input: Omit<PluginArtifactRecord, "id">): PluginArtifactRecord {
    this.artifactCounter += 1;
    const artifact: PluginArtifactRecord = {
      ...input,
      id: `adapter-artifact-${this.artifactCounter}`,
    };
    this.artifacts.push(artifact);
    return artifact;
  }

  listArtifacts(query?: PluginProvenanceQuery): PluginArtifactRecord[] {
    return this.artifacts.filter((artifact) =>
      matchesPluginProvenanceQuery(artifact.provenance, query),
    );
  }

  recordEvidence(input: Omit<PluginEvidenceRecord, "id">): PluginEvidenceRecord {
    this.evidenceCounter += 1;
    const evidence: PluginEvidenceRecord = {
      ...input,
      id: `adapter-evidence-${this.evidenceCounter}`,
    };
    this.evidence.push(evidence);
    return evidence;
  }

  listEvidence(query?: PluginProvenanceQuery): PluginEvidenceRecord[] {
    return this.evidence.filter((item) =>
      matchesPluginProvenanceQuery(item.provenance, query),
    );
  }

  createTaskId(): string {
    this.taskCounter += 1;
    return `adapter-task-${this.taskCounter}`;
  }

  startTask(input: PluginTaskRecord): PluginTaskRecord {
    const task: PluginTaskRecord = { ...input };
    this.tasks.push(task);
    return task;
  }

  getTask(taskId: string): PluginTaskRecord | null {
    return this.tasks.find((task) => task.taskId === taskId) ?? null;
  }

  updateTask(taskId: string, updater: (task: PluginTaskRecord) => PluginTaskRecord): PluginTaskRecord {
    const index = this.tasks.findIndex((task) => task.taskId === taskId);
    if (index < 0) {
      throw new Error(`Plugin task ${taskId} was not found.`);
    }
    const nextTask = updater(this.tasks[index]);
    this.tasks[index] = nextTask;
    return nextTask;
  }

  listTasks(query?: PluginProvenanceQuery): PluginTaskRecord[] {
    return this.tasks.filter((task) =>
      matchesPluginProvenanceQuery(task.provenance, query),
    );
  }

  clearAppData(appId: string): PluginCapabilityStoreClearResult {
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
