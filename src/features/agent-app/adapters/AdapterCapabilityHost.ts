import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppKnowledgeRecord,
  AgentAppProvenanceQuery,
  AgentAppRunRecord,
  AgentAppRunResult,
  AgentAppStorageEntry,
  AgentAppTaskHostResponseRequest,
  AgentAppTaskHostResponseResult,
  AgentAppTaskRecord,
  AgentAppUninstallResult,
  AppCleanupPlan,
  CleanupTarget,
  InstalledAppPreview,
  ProjectedEntry,
} from "../types";
import { AgentAppCapabilityError } from "../sdk/capabilityErrors";
import type {
  AgentAppTaskLookup,
  CapabilityHost,
  LimeAppSdk,
  LimeAgentCapability,
  LimeArtifactsCapability,
  LimeEvidenceCapability,
  LimeKnowledgeCapability,
  LimeStorageCapability,
} from "../sdk/CapabilityHost";
import {
  appendAgentAppTaskEvent,
  buildAgentAppTaskRecord,
  buildRetryAgentAppTaskRecord,
} from "../sdk/agentTaskRuntime";
import { buildAgentAppProvenance } from "../sdk/provenance";
import { InMemoryAgentAppCapabilityStore } from "./InMemoryAgentAppCapabilityStore";

interface AdapterCapabilityHostOptions {
  preview: InstalledAppPreview;
  realAdapterEnabled?: boolean;
  store?: InMemoryAgentAppCapabilityStore;
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

function readTaskLookupId(task: string | AgentAppTaskLookup): string {
  return typeof task === "string" ? task : task.taskId;
}

export class AdapterCapabilityHost implements CapabilityHost {
  private readonly preview: InstalledAppPreview;
  private readonly realAdapterEnabled: boolean;
  private readonly store: InMemoryAgentAppCapabilityStore;
  private readonly now: () => string;
  private runCounter = 0;

  constructor(options: AdapterCapabilityHostOptions) {
    this.preview = options.preview;
    this.realAdapterEnabled = options.realAdapterEnabled ?? true;
    this.store = options.store ?? new InMemoryAgentAppCapabilityStore();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  createSdkContext(entryKey: string, runId?: string): LimeAppSdk {
    this.assertRealAdapterEnabled();
    const entry = this.findEntry(entryKey);
    const provenance = buildAgentAppProvenance({
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

  async runEntry(entryKey: string): Promise<AgentAppRunResult> {
    this.assertRealAdapterEnabled();
    const entry = this.findEntry(entryKey);
    this.assertRunnable(entry);

    const runId = this.nextRunId(entryKey);
    const startedAt = this.now();
    const sdk = this.createSdkContext(entryKey, runId);
    const run: AgentAppRunRecord = {
      runId,
      appId: this.preview.identity.appId,
      entryKey,
      status: "running",
      startedAt,
      artifactIds: [],
      evidenceIds: [],
      storageKeys: [],
      taskIds: [],
      provenance: buildAgentAppProvenance({
        preview: this.preview,
        entryKey,
        runId,
      }),
    };

    const storageEntry = await sdk.storage.set(`runs/${runId}`, {
      entryKey,
      status: "running",
      title: entry.title,
      adapter: "local-agent-app-capability-store",
    });
    run.storageKeys.push(storageEntry.key);

    const knowledgeResults = entry.requiredCapabilities.some(
      (requirement) => requirement.capability === "lime.knowledge",
    )
      ? [await sdk.knowledge.search({ query: entry.title, limit: 5 })]
      : [];
    const agentTask = entry.requiredCapabilities.some(
      (requirement) => requirement.capability === "lime.agent",
    )
      ? await sdk.agent.startTask({
          title: entry.title,
          prompt: entry.description ?? entry.title,
          taskKind: `entry.${entry.kind}`,
          idempotencyKey: `${runId}:${entry.key}`,
          input: {
            entryKey,
            entryKind: entry.kind,
            knowledgeRecordIds: knowledgeResults.flatMap((result) =>
              result.records.map((record) => record.id),
            ),
          },
          expectedOutput: {
            artifactKind: "adapter_agent_app_artifact",
            storageKey: `runs/${runId}`,
          },
          knowledge: knowledgeResults.flatMap((result) =>
            result.records.map((record) => ({
              key: record.bindingKey,
              mode: "retrieval" as const,
            })),
          ),
          humanReview: entry.kind === "workflow",
        })
      : null;
    if (agentTask) {
      const completedTask = this.completeTask(agentTask.taskId, {
        summary: `Adapter task completed for ${entry.key}.`,
        knowledgeRecordCount: knowledgeResults[0]?.records.length ?? 0,
      });
      run.taskIds.push(completedTask.taskId);
    }

    const artifact = await sdk.artifacts.create({
      kind: "adapter_agent_app_artifact",
      title: `${entry.title} · adapter artifact`,
      content: {
        appId: this.preview.identity.appId,
        entryKey,
        entryKind: entry.kind,
        generatedBy: "AdapterCapabilityHost",
        knowledgeRecordIds: knowledgeResults.flatMap((result) =>
          result.records.map((record) => record.id),
        ),
        taskIds: run.taskIds,
      },
    });
    run.artifactIds.push(artifact.id);

    const evidence = await sdk.evidence.record({
      kind: "adapter_entry_run",
      message: `Adapter entry ${entry.key} generated artifact ${artifact.id}.`,
      refs: [artifact.id, ...run.taskIds],
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
      taskIds: run.taskIds,
      knowledgeRecordIds: knowledgeResults.flatMap((result) =>
        result.records.map((record) => record.id),
      ),
      adapter: "local-agent-app-capability-store",
    });

    return {
      run,
      artifacts: [artifact],
      evidence: [evidence],
      tasks: this.getTasks({ workflowRunId: run.runId }),
      knowledge: knowledgeResults,
    };
  }

  getArtifacts(query?: AgentAppProvenanceQuery): AgentAppArtifactRecord[] {
    return this.store.listArtifacts(query);
  }

  getEvidence(query?: AgentAppProvenanceQuery): AgentAppEvidenceRecord[] {
    return this.store.listEvidence(query);
  }

  getStorageEntries(query?: AgentAppProvenanceQuery): AgentAppStorageEntry[] {
    return this.store.listStorage(query);
  }

  getTasks(query?: AgentAppProvenanceQuery): AgentAppTaskRecord[] {
    return this.store.listTasks(query);
  }

  async uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<AgentAppUninstallResult> {
    const appId = this.preview.identity.appId;
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
    const storageTargets = this.getStorageEntries({ appId }).map((entry) =>
      refTarget(
        `storage:${appId}:${entry.key}`,
        "Agent App adapter storage entry.",
      ),
    );
    const artifactTargets = this.getArtifacts({ appId }).map((artifact) =>
      refTarget(`artifact:${artifact.id}`, "Agent App adapter artifact."),
    );
    const evidenceTargets = this.getEvidence({ appId }).map((item) =>
      refTarget(`evidence:${item.id}`, "Agent App adapter evidence."),
    );
    const taskTargets = this.getTasks({ appId }).map((task) =>
      refTarget(`task:${task.taskId}`, "Agent App adapter task."),
    );
    const dataTargets = [
      ...params.cleanupPlan.overlayRefs,
      ...params.cleanupPlan.storageNamespaces,
      ...storageTargets,
      ...params.cleanupPlan.artifactRefs,
      ...artifactTargets,
      ...params.cleanupPlan.evidenceRefs,
      ...evidenceTargets,
      ...params.cleanupPlan.taskRefs,
      ...taskTargets,
      ...params.cleanupPlan.secretRefs,
      ...params.cleanupPlan.exportPaths,
    ];

    if (params.deleteData) {
      this.store.clearAppData(appId);
    }

    return {
      appId,
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
              message:
                "App adapter storage, artifacts and evidence are retained.",
            },
          ],
    };
  }

  private createStorageCapability(
    provenance: AgentAppArtifactRecord["provenance"],
  ): LimeStorageCapability {
    this.assertCapabilityEnabled(
      "lime.storage",
      provenance.entryKey,
      "adapter",
    );
    const appId = this.preview.identity.appId;
    const namespace =
      this.preview.projection.storage?.namespace ?? this.preview.identity.appId;

    return {
      namespace,
      get: async (key) => this.store.getStorage(appId, key)?.value ?? null,
      set: async (key, value) =>
        this.store.setStorage({
          appId,
          key,
          value,
          updatedAt: this.now(),
          provenance,
        }),
      list: async () => this.store.listStorage({ appId }),
      delete: async (key) => this.store.deleteStorage(appId, key),
    };
  }

  private createArtifactsCapability(
    provenance: AgentAppArtifactRecord["provenance"],
  ): LimeArtifactsCapability {
    this.assertCapabilityEnabled(
      "lime.artifacts",
      provenance.entryKey,
      "adapter",
    );

    return {
      create: async (input) =>
        this.store.createArtifact({
          appId: this.preview.identity.appId,
          entryKey: provenance.entryKey,
          kind: input.kind,
          title: input.title,
          content: input.content,
          createdAt: this.now(),
          provenance,
        }),
      list: async () =>
        this.store.listArtifacts({ appId: this.preview.identity.appId }),
    };
  }

  private createEvidenceCapability(
    provenance: AgentAppArtifactRecord["provenance"],
  ): LimeEvidenceCapability {
    this.assertCapabilityEnabled(
      "lime.evidence",
      provenance.entryKey,
      "adapter",
    );

    return {
      record: async (input) =>
        this.store.recordEvidence({
          appId: this.preview.identity.appId,
          entryKey: provenance.entryKey,
          runId: provenance.workflowRunId,
          kind: input.kind,
          message: input.message,
          createdAt: this.now(),
          refs: input.refs ?? [],
          provenance,
        }),
      list: async () =>
        this.store.listEvidence({ appId: this.preview.identity.appId }),
    };
  }

  private createKnowledgeCapability(
    provenance: AgentAppArtifactRecord["provenance"],
  ): LimeKnowledgeCapability {
    this.assertCapabilityEnabled(
      "lime.knowledge",
      provenance.entryKey,
      "adapter",
    );

    return {
      search: async (input) => {
        const normalizedQuery = input.query.trim().toLowerCase();
        const allRecords = this.preview.projection.knowledgeBindings.map(
          (binding): AgentAppKnowledgeRecord => ({
            id: `knowledge:${this.preview.identity.appId}:${binding.key}`,
            appId: this.preview.identity.appId,
            bindingKey: binding.key,
            title: binding.key,
            type: binding.type,
            standard: binding.standard,
            snippet: `${binding.key} · ${binding.type ?? "knowledge"} · ${
              binding.required ? "required" : "optional"
            }`,
            provenance,
          }),
        );
        const matchedRecords = allRecords.filter((record) => {
          if (!normalizedQuery) {
            return true;
          }
          return [record.bindingKey, record.title, record.type, record.standard]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedQuery));
        });
        const records = (
          matchedRecords.length > 0 ? matchedRecords : allRecords
        ).slice(0, input.limit ?? 10);

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
    provenance: AgentAppArtifactRecord["provenance"],
  ): LimeAgentCapability {
    this.assertCapabilityEnabled("lime.agent", provenance.entryKey, "adapter");

    return {
      startTask: async (input) => {
        const taskId = this.store.createTaskId();
        return this.store.startTask(
          buildAgentAppTaskRecord({
            taskId,
            traceId: `adapter-trace-${taskId.replace("adapter-task-", "")}`,
            appId: this.preview.identity.appId,
            entryKey: provenance.entryKey,
            request: input,
            provenance,
            now: this.now(),
            startMessage: "Adapter task started.",
          }),
        );
      },
      streamTask: async (task) =>
        this.store.getTask(readTaskLookupId(task))?.events ?? [],
      getTask: async (task) => this.store.getTask(readTaskLookupId(task)),
      cancelTask: async (task) =>
        this.store.updateTask(readTaskLookupId(task), (task) => {
          const timestamp = this.now();
          return {
            ...appendAgentAppTaskEvent(task, {
              type: "task:cancelled",
              status: "cancelled",
              at: timestamp,
              message: "Adapter task cancelled.",
            }),
            status: "cancelled",
            cancelledAt: timestamp,
            finishedAt: timestamp,
          };
        }),
      retryTask: async (task) => {
        const taskId = readTaskLookupId(task);
        const sourceTask = this.store.getTask(taskId);
        if (!sourceTask) {
          throw new AgentAppCapabilityError({
            code: "TASK_NOT_FOUND",
            message: `Agent App task ${taskId} was not found.`,
            appId: this.preview.identity.appId,
            entryKey: provenance.entryKey,
            capability: "lime.agent",
          });
        }
        const nextTaskId = this.store.createTaskId();
        return this.store.startTask(
          buildRetryAgentAppTaskRecord({
            taskId: nextTaskId,
            traceId: `adapter-trace-${nextTaskId.replace("adapter-task-", "")}`,
            sourceTask,
            provenance,
            now: this.now(),
            startMessage: "Adapter task retried.",
          }),
        );
      },
      submitHostResponse: async (input) =>
        this.submitHostResponse(input, provenance),
      listTasks: async () =>
        this.store.listTasks({ appId: this.preview.identity.appId }),
    };
  }

  private submitHostResponse(
    input: AgentAppTaskHostResponseRequest,
    provenance: AgentAppArtifactRecord["provenance"],
  ): AgentAppTaskHostResponseResult {
    if (!this.store.getTask(input.taskId)) {
      throw new AgentAppCapabilityError({
        code: "TASK_NOT_FOUND",
        message: `Agent App task ${input.taskId} was not found.`,
        appId: this.preview.identity.appId,
        entryKey: provenance.entryKey,
        capability: "lime.agent",
      });
    }
    const submittedAt = this.now();
    this.store.updateTask(input.taskId, (task) =>
      appendAgentAppTaskEvent(task, {
        type: "task:progress",
        status: task.status,
        at: submittedAt,
        message: "Agent App host response 已提交。",
        payload: {
          requestId: input.requestId,
          actionType: input.actionType,
          confirmed: input.confirmed ?? true,
        },
      }),
    );
    return {
      taskId: input.taskId,
      requestId: input.requestId,
      status: "submitted",
      submittedAt,
    };
  }

  private completeTask(taskId: string, result: unknown): AgentAppTaskRecord {
    return this.store.updateTask(taskId, (task) => {
      const timestamp = this.now();
      return {
        ...appendAgentAppTaskEvent(task, {
          type: "task:completed",
          status: "succeeded",
          at: timestamp,
          message: "Adapter task completed.",
          payload: result,
        }),
        status: "succeeded",
        finishedAt: timestamp,
        result,
      };
    });
  }

  private assertRealAdapterEnabled(): void {
    if (this.realAdapterEnabled) {
      return;
    }
    throw new AgentAppCapabilityError({
      code: "FEATURE_DISABLED",
      message: "Agent App real adapter host is disabled.",
      appId: this.preview.identity.appId,
    });
  }

  private assertCapabilityEnabled(
    capability: string,
    entryKey: string | undefined,
    expectedImplementation: "adapter",
  ): void {
    const support = this.preview.readiness.supportedCapabilities.find(
      (item) => item.capability === capability,
    );
    if (support?.enabled && support.implementation === expectedImplementation) {
      return;
    }
    throw new AgentAppCapabilityError({
      code: "CAPABILITY_NOT_DECLARED",
      message: `${capability} is not available through the Agent App adapter host.`,
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
    throw new AgentAppCapabilityError({
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
    throw new AgentAppCapabilityError({
      code: "ENTRY_NOT_FOUND",
      message: `Agent App entry ${entryKey} was not found.`,
      appId: this.preview.identity.appId,
      entryKey,
    });
  }

  private nextRunId(entryKey: string): string {
    this.runCounter += 1;
    return `${this.preview.identity.appId}-${entryKey}-adapter-run-${this.runCounter}`;
  }
}
