import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginKnowledgeRecord,
  PluginKnowledgeSearchResult,
  PluginProvenanceQuery,
  PluginRunRecord,
  PluginRunResult,
  PluginStorageEntry,
  PluginTaskHostResponseRequest,
  PluginTaskHostResponseResult,
  PluginTaskRecord,
  PluginUninstallResult,
  AppCleanupPlan,
  CleanupTarget,
  InstalledAppPreview,
  ProjectedEntry,
} from "../types";
import { PluginCapabilityError } from "./capabilityErrors";
import type {
  PluginTaskLookup,
  CapabilityHost,
  LimeAppSdk,
  LimeAgentCapability,
  LimeArtifactsCapability,
  LimeEvidenceCapability,
  LimeKnowledgeCapability,
  LimeStorageCapability,
} from "./CapabilityHost";
import {
  appendPluginTaskEvent,
  buildPluginTaskRecord,
  buildRetryPluginTaskRecord,
} from "./agentTaskRuntime";
import { assertTestMockSdkEnvironment } from "./mockEnvironment";
import { buildPluginProvenance } from "./provenance";
import { matchesPluginProvenanceQuery } from "./provenanceQuery";

interface MockCapabilityHostOptions {
  preview: InstalledAppPreview;
  mockSdkEnabled?: boolean;
  now?: () => string;
}

function refTarget(value: string, reason: string): CleanupTarget {
  return {
    kind: "ref",
    value,
    exists: true,
    safeToDelete: true,
    reason,
  };
}

function withExistingTarget(target: CleanupTarget): CleanupTarget {
  return {
    ...target,
    exists: true,
  };
}

function withRetainedTarget(target: CleanupTarget): CleanupTarget {
  return {
    ...target,
    exists: true,
    safeToDelete: false,
  };
}

function readTaskLookupId(task: string | PluginTaskLookup): string {
  return typeof task === "string" ? task : task.taskId;
}

export class MockCapabilityHost implements CapabilityHost {
  private readonly preview: InstalledAppPreview;
  private readonly mockSdkEnabled: boolean;
  private readonly now: () => string;
  private readonly storageEntries = new Map<string, PluginStorageEntry>();
  private readonly artifacts: PluginArtifactRecord[] = [];
  private readonly evidence: PluginEvidenceRecord[] = [];
  private readonly tasks: PluginTaskRecord[] = [];
  private runCounter = 0;
  private taskCounter = 0;

  constructor(options: MockCapabilityHostOptions) {
    assertTestMockSdkEnvironment("MockCapabilityHost");
    this.preview = options.preview;
    this.mockSdkEnabled = options.mockSdkEnabled ?? true;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  createSdkContext(entryKey: string, runId?: string): LimeAppSdk {
    this.assertMockSdkEnabled();
    const entry = this.findEntry(entryKey);
    const provenance = buildPluginProvenance({
      preview: this.preview,
      entryKey,
      runId,
    });

    return {
      appId: this.preview.identity.appId,
      entry,
      storage: this.createStorageCapability(provenance),
      artifacts: this.createArtifactsCapability(provenance),
      evidence: this.createEvidenceCapability(provenance),
      knowledge: this.createKnowledgeCapability(provenance),
      agent: this.createAgentCapability(provenance),
    };
  }

  async runEntry(entryKey: string): Promise<PluginRunResult> {
    this.assertMockSdkEnabled();
    const entry = this.findEntry(entryKey);
    this.assertRunnable(entry);

    const runId = this.nextRunId(entryKey);
    const startedAt = this.now();
    const runProvenance = buildPluginProvenance({
      preview: this.preview,
      entryKey,
      runId,
    });
    const sdk = this.createSdkContext(entryKey, runId);
    const run: PluginRunRecord = {
      runId,
      appId: this.preview.identity.appId,
      entryKey,
      status: "running",
      startedAt,
      artifactIds: [],
      evidenceIds: [],
      storageKeys: [],
      taskIds: [],
      provenance: runProvenance,
    };

    const storageEntry = await sdk.storage.set(`runs/${runId}`, {
      entryKey,
      status: "running",
      title: entry.title,
    });
    run.storageKeys.push(storageEntry.key);

    const artifact = await sdk.artifacts.create({
      kind: "mock_plugin_artifact",
      title: `${entry.title} · mock artifact`,
      content: {
        appId: this.preview.identity.appId,
        entryKey,
        entryKind: entry.kind,
        generatedBy: "MockCapabilityHost",
      },
    });
    run.artifactIds.push(artifact.id);

    const evidence = await sdk.evidence.record({
      kind: "mock_entry_run",
      message: `Mock entry ${entry.key} generated artifact ${artifact.id}.`,
      refs: [artifact.id],
    });
    run.evidenceIds.push(evidence.id);

    run.status = "succeeded";
    run.finishedAt = this.now();
    await sdk.storage.set(`runs/${runId}`, {
      entryKey,
      status: "succeeded",
      title: entry.title,
      artifactIds: run.artifactIds,
      evidenceIds: run.evidenceIds,
    });

    return {
      run,
      artifacts: [artifact],
      evidence: [evidence],
      tasks: [],
      knowledge: [],
    };
  }

  getArtifacts(query?: PluginProvenanceQuery): PluginArtifactRecord[] {
    return this.artifacts.filter((artifact) =>
      matchesPluginProvenanceQuery(artifact.provenance, query),
    );
  }

  getEvidence(query?: PluginProvenanceQuery): PluginEvidenceRecord[] {
    return this.evidence.filter((item) =>
      matchesPluginProvenanceQuery(item.provenance, query),
    );
  }

  getStorageEntries(query?: PluginProvenanceQuery): PluginStorageEntry[] {
    return Array.from(this.storageEntries.values()).filter((entry) =>
      matchesPluginProvenanceQuery(entry.provenance, query),
    );
  }

  getTasks(query?: PluginProvenanceQuery): PluginTaskRecord[] {
    return this.tasks.filter((task) =>
      matchesPluginProvenanceQuery(task.provenance, query),
    );
  }

  async uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<PluginUninstallResult> {
    const alwaysDeleted = [
      ...params.cleanupPlan.packageCachePaths,
      ...params.cleanupPlan.packageCacheIndexPaths,
      ...params.cleanupPlan.packageStagingPaths,
      ...params.cleanupPlan.installedStatePaths,
      ...params.cleanupPlan.projectionPaths,
      ...params.cleanupPlan.readinessPaths,
      ...params.cleanupPlan.setupStatePaths,
      ...params.cleanupPlan.logPaths,
    ].map(withExistingTarget);
    const dataTargets = [
      ...params.cleanupPlan.overlayRefs,
      ...params.cleanupPlan.storageNamespaces,
      ...params.cleanupPlan.artifactRefs,
      ...this.artifacts.map((artifact) =>
        refTarget(`artifact:${artifact.id}`, "Mock Plugin artifact."),
      ),
      ...params.cleanupPlan.evidenceRefs,
      ...this.evidence.map((item) =>
        refTarget(`evidence:${item.id}`, "Mock Plugin evidence."),
      ),
      ...params.cleanupPlan.taskRefs,
      ...this.tasks.map((task) =>
        refTarget(`task:${task.taskId}`, "Mock Plugin task."),
      ),
      ...params.cleanupPlan.secretRefs,
      ...params.cleanupPlan.exportPaths,
    ];

    if (params.deleteData) {
      this.storageEntries.clear();
      this.artifacts.length = 0;
      this.evidence.length = 0;
      this.tasks.length = 0;
    }

    return {
      appId: this.preview.identity.appId,
      mode: params.deleteData ? "delete-data" : "keep-data",
      deletedTargets: [
        ...alwaysDeleted,
        ...(params.deleteData ? dataTargets.map(withExistingTarget) : []),
      ],
      retainedTargets: params.deleteData
        ? []
        : dataTargets.map(withRetainedTarget),
      warnings: params.deleteData
        ? []
        : [
            {
              code: "APP_DATA_RETAINED",
              message: "App storage, artifacts and evidence are retained.",
            },
          ],
    };
  }

  private createStorageCapability(
    provenance: PluginArtifactRecord["provenance"],
  ): LimeStorageCapability {
    this.assertCapabilityEnabled("lime.storage", provenance.entryKey);
    const namespace =
      this.preview.projection.storage?.namespace ?? this.preview.identity.appId;

    return {
      namespace,
      get: async (key) => this.storageEntries.get(key)?.value ?? null,
      set: async (key, value) => {
        const entry: PluginStorageEntry = {
          appId: this.preview.identity.appId,
          key,
          value,
          updatedAt: this.now(),
          provenance,
        };
        this.storageEntries.set(key, entry);
        return entry;
      },
      list: async () => Array.from(this.storageEntries.values()),
      delete: async (key) => this.storageEntries.delete(key),
    };
  }

  private createArtifactsCapability(
    provenance: PluginArtifactRecord["provenance"],
  ): LimeArtifactsCapability {
    this.assertCapabilityEnabled("lime.artifacts", provenance.entryKey);

    return {
      create: async (input) => {
        const artifact: PluginArtifactRecord = {
          id: `mock-artifact-${this.artifacts.length + 1}`,
          appId: this.preview.identity.appId,
          entryKey: provenance.entryKey,
          kind: input.kind,
          title: input.title,
          content: input.content,
          createdAt: this.now(),
          provenance,
        };
        this.artifacts.push(artifact);
        return artifact;
      },
      list: async () => [...this.artifacts],
    };
  }

  private createEvidenceCapability(
    provenance: PluginArtifactRecord["provenance"],
  ): LimeEvidenceCapability {
    this.assertCapabilityEnabled("lime.evidence", provenance.entryKey);

    return {
      record: async (input) => {
        const evidence: PluginEvidenceRecord = {
          id: `mock-evidence-${this.evidence.length + 1}`,
          appId: this.preview.identity.appId,
          entryKey: provenance.entryKey,
          runId: provenance.workflowRunId,
          kind: input.kind,
          message: input.message,
          createdAt: this.now(),
          refs: input.refs ?? [],
          provenance,
        };
        this.evidence.push(evidence);
        return evidence;
      },
      list: async () => [...this.evidence],
    };
  }

  private createKnowledgeCapability(
    provenance: PluginArtifactRecord["provenance"],
  ): LimeKnowledgeCapability {
    this.assertCapabilityEnabled("lime.knowledge", provenance.entryKey);

    return {
      search: async (input): Promise<PluginKnowledgeSearchResult> => {
        const records: PluginKnowledgeRecord[] =
          this.preview.projection.knowledgeBindings
            .slice(0, input.limit ?? 10)
            .map((binding) => ({
              id: `mock-knowledge:${this.preview.identity.appId}:${binding.key}`,
              appId: this.preview.identity.appId,
              bindingKey: binding.key,
              title: binding.key,
              type: binding.type,
              standard: binding.standard,
              snippet: `Mock knowledge binding ${binding.key}.`,
              provenance,
            }));
        return {
          query: input.query,
          records,
          searchedAt: this.now(),
          provenance,
        };
      },
    };
  }

  private createAgentCapability(
    provenance: PluginArtifactRecord["provenance"],
  ): LimeAgentCapability {
    this.assertCapabilityEnabled("lime.agent", provenance.entryKey);

    return {
      startTask: async (input) => {
        this.taskCounter += 1;
        const task = buildPluginTaskRecord({
          taskId: `mock-task-${this.taskCounter}`,
          traceId: `mock-trace-${this.taskCounter}`,
          appId: this.preview.identity.appId,
          entryKey: provenance.entryKey,
          request: input,
          provenance,
          now: this.now(),
          startMessage: "Mock task started.",
        });
        this.tasks.push(task);
        return task;
      },
      streamTask: async (task) => {
        const taskId = readTaskLookupId(task);
        const record = this.tasks.find((item) => item.taskId === taskId);
        return record ? [...record.events] : [];
      },
      getTask: async (task) =>
        this.tasks.find((item) => item.taskId === readTaskLookupId(task)) ??
        null,
      cancelTask: async (taskLookup) => {
        const taskId = readTaskLookupId(taskLookup);
        const index = this.tasks.findIndex((task) => task.taskId === taskId);
        if (index < 0) {
          throw new PluginCapabilityError({
            code: "TASK_NOT_FOUND",
            message: `Mock task ${taskId} was not found.`,
            appId: this.preview.identity.appId,
          });
        }
        const timestamp = this.now();
        const task = {
          ...appendPluginTaskEvent(this.tasks[index], {
            type: "task:cancelled",
            status: "cancelled",
            at: timestamp,
            message: "Mock task cancelled.",
          }),
          status: "cancelled" as const,
          cancelledAt: timestamp,
          finishedAt: timestamp,
        };
        this.tasks[index] = task;
        return task;
      },
      retryTask: async (task) => {
        const taskId = readTaskLookupId(task);
        const sourceTask = this.tasks.find((task) => task.taskId === taskId);
        if (!sourceTask) {
          throw new PluginCapabilityError({
            code: "TASK_NOT_FOUND",
            message: `Mock task ${taskId} was not found.`,
            appId: this.preview.identity.appId,
            capability: "lime.agent",
          });
        }
        this.taskCounter += 1;
        const retryTask = buildRetryPluginTaskRecord({
          taskId: `mock-task-${this.taskCounter}`,
          traceId: `mock-trace-${this.taskCounter}`,
          sourceTask,
          provenance,
          now: this.now(),
          startMessage: "Mock task retried.",
        });
        this.tasks.push(retryTask);
        return retryTask;
      },
      submitHostResponse: async (input) =>
        this.submitHostResponse(input, provenance),
      listTasks: async () => [...this.tasks],
    };
  }

  private submitHostResponse(
    input: PluginTaskHostResponseRequest,
    provenance: PluginArtifactRecord["provenance"],
  ): PluginTaskHostResponseResult {
    const index = this.tasks.findIndex((task) => task.taskId === input.taskId);
    if (index < 0) {
      throw new PluginCapabilityError({
        code: "TASK_NOT_FOUND",
        message: `Mock task ${input.taskId} was not found.`,
        appId: this.preview.identity.appId,
        entryKey: provenance.entryKey,
        capability: "lime.agent",
      });
    }
    const submittedAt = this.now();
    this.tasks[index] = appendPluginTaskEvent(this.tasks[index], {
      type: "task:progress",
      status: this.tasks[index].status,
      at: submittedAt,
      message: "Mock host response 已提交。",
      payload: {
        requestId: input.requestId,
        actionType: input.actionType,
        confirmed: input.confirmed ?? true,
      },
    });
    return {
      taskId: input.taskId,
      requestId: input.requestId,
      status: "submitted",
      submittedAt,
    };
  }

  private assertMockSdkEnabled(): void {
    if (this.mockSdkEnabled) {
      return;
    }
    throw new PluginCapabilityError({
      code: "FEATURE_DISABLED",
      message: "Plugin mock SDK is disabled.",
      appId: this.preview.identity.appId,
    });
  }

  private assertCapabilityEnabled(capability: string, entryKey?: string): void {
    const support = this.preview.readiness.supportedCapabilities.find(
      (item) => item.capability === capability,
    );
    if (support?.enabled) {
      return;
    }
    throw new PluginCapabilityError({
      code: "CAPABILITY_NOT_DECLARED",
      message: `${capability} is not enabled for this Plugin preview.`,
      appId: this.preview.identity.appId,
      entryKey,
      capability,
    });
  }

  private assertRunnable(entry: ProjectedEntry): void {
    const entryReadiness = this.preview.readiness.entryReadiness.find(
      (item) => item.entryKey === entry.key,
    );
    if (
      this.preview.readiness.blockers.length === 0 &&
      entryReadiness?.status !== "blocked"
    ) {
      return;
    }
    throw new PluginCapabilityError({
      code: "READINESS_BLOCKED",
      message: `Entry ${entry.key} is blocked by readiness checks.`,
      appId: this.preview.identity.appId,
      entryKey: entry.key,
    });
  }

  private findEntry(entryKey: string): ProjectedEntry {
    const entry = this.preview.projection.entries.find(
      (item) => item.key === entryKey,
    );
    if (entry) {
      return entry;
    }
    throw new PluginCapabilityError({
      code: "ENTRY_NOT_FOUND",
      message: `Plugin entry ${entryKey} was not found.`,
      appId: this.preview.identity.appId,
      entryKey,
    });
  }

  private nextRunId(entryKey: string): string {
    this.runCounter += 1;
    return `${this.preview.identity.appId}-${entryKey}-mock-run-${this.runCounter}`;
  }
}
