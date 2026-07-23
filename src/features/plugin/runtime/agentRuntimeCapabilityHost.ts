import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";

import type {
  PluginRuntimeStartTaskRequest,
  PluginRuntimeTaskSnapshot,
} from "@/lib/api/agentRuntime/pluginTaskTypes";
import type { AgentRuntimeRespondActionRequest } from "@/lib/api/agentRuntime/requestTypes";
import type { PluginTaskRuntimeContract } from "../host/hostLifecycle";
import type {
  PluginTaskLookup,
  CapabilityHost,
  LimeAgentCapability,
  LimeAppSdk,
} from "../sdk/CapabilityHost";
import type {
  PluginArtifactRecord,
  PluginEvidenceRecord,
  PluginProvenanceQuery,
  PluginRunResult,
  PluginStorageEntry,
  PluginTaskHostResponseRequest,
  PluginTaskHostResponseResult,
  PluginTaskRecord,
  PluginTaskRequest,
  PluginUninstallResult,
  AppCleanupPlan,
} from "../types";
import { createPluginRuntimeCapabilityApiFromClient } from "./agentRuntimeClientApi";
import {
  createFailClosedPluginRuntimeCapabilityApi,
  type PluginRuntimeCapabilityApi,
} from "./agentRuntimeCapabilityApi";
import {
  buildRetryRequest,
  buildTaskRecord,
  buildWorkflowResumeMetadata,
  normalizeList,
  normalizeString,
  readLatestTurnId,
  readPersistedRuntimeTaskState,
  runtimeTaskStorageKey,
  type RuntimeTaskState,
} from "./agentRuntimeTaskState";

export type { PluginRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export interface AgentRuntimeCapabilityHostOptions {
  delegate: CapabilityHost;
  appId: string;
  appVersion?: string;
  packageHash?: string;
  manifestHash?: string;
  workspaceId?: string;
  workspaceIdResolver?: () => Promise<string>;
  taskRuntime?: PluginTaskRuntimeContract;
  api?: PluginRuntimeCapabilityApi;
  runtimeClient?: Pick<
    AgentRuntimeClient,
    "startTurn" | "readThread" | "cancelTurn"
  >;
  ensureSession?: AgentRuntimeSessionResolver;
  now?: () => string;
}

type RuntimeAgentTaskRequest = PluginTaskRequest & {
  taskId?: string;
  turnId?: string;
  eventName?: string;
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
  runtimeRequest?: PluginRuntimeStartTaskRequest["runtimeRequest"];
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
};

export interface AgentRuntimeSessionRequest {
  appId: string;
  entryKey?: string;
  workspaceId: string;
  taskId?: string;
  taskKind: string;
  title?: string;
  prompt?: string;
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadIdentity {
  sessionId: string;
  threadId: string;
}

export type AgentRuntimeSessionResolver = (
  request: AgentRuntimeSessionRequest,
) => Promise<AgentRuntimeThreadIdentity>;

function createRuntimeTaskId(): string {
  return `plugin-task-${Date.now()}`;
}

async function rejectMissingWorkspaceId(): Promise<string> {
  throw new Error(
    "Plugin Agent task requires an existing sessionId or explicit Project/Thread workspaceId; default project creation is disabled.",
  );
}

function readRuntimeRequest(input: PluginTaskRequest): RuntimeAgentTaskRequest {
  return input as RuntimeAgentTaskRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTaskLookup(
  task: string | PluginTaskLookup,
): PluginTaskLookup {
  return typeof task === "string" ? { taskId: task } : task;
}

function threadIdFromLookup(lookup: PluginTaskLookup): string | undefined {
  return normalizeString(lookup.threadId);
}

export class AgentRuntimeCapabilityHost implements CapabilityHost {
  private readonly delegate: CapabilityHost;
  private readonly appId: string;
  private readonly appVersion: string;
  private readonly packageHash: string;
  private readonly manifestHash: string;
  private readonly workspaceId?: string;
  private readonly workspaceIdResolver?: () => Promise<string>;
  private readonly taskRuntime?: PluginTaskRuntimeContract;
  private readonly api: PluginRuntimeCapabilityApi;
  private readonly ensureSession?: AgentRuntimeSessionResolver;
  private readonly now: () => string;
  private readonly tasks = new Map<string, RuntimeTaskState>();

  constructor(options: AgentRuntimeCapabilityHostOptions) {
    this.delegate = options.delegate;
    this.appId = options.appId;
    this.appVersion = options.appVersion ?? "";
    this.packageHash = options.packageHash ?? "";
    this.manifestHash = options.manifestHash ?? "";
    this.workspaceId = options.workspaceId;
    this.workspaceIdResolver = options.workspaceIdResolver;
    this.taskRuntime = options.taskRuntime;
    this.now = options.now ?? (() => new Date().toISOString());
    this.ensureSession = options.ensureSession;
    this.api =
      options.api ??
      (options.runtimeClient
        ? createPluginRuntimeCapabilityApiFromClient(options.runtimeClient, {
            now: this.now,
          })
        : createFailClosedPluginRuntimeCapabilityApi());
  }

  createSdkContext(entryKey: string, runId?: string): LimeAppSdk {
    const sdk = this.delegate.createSdkContext(entryKey, runId);
    return {
      ...sdk,
      agent: this.createAgentCapability(entryKey),
    };
  }

  runEntry(entryKey: string): Promise<PluginRunResult> {
    return this.delegate.runEntry(entryKey);
  }

  getArtifacts(query?: PluginProvenanceQuery): PluginArtifactRecord[] {
    return this.delegate.getArtifacts(query);
  }

  getEvidence(query?: PluginProvenanceQuery): PluginEvidenceRecord[] {
    return this.delegate.getEvidence(query);
  }

  getStorageEntries(query?: PluginProvenanceQuery): PluginStorageEntry[] {
    return this.delegate.getStorageEntries(query);
  }

  getTasks(query?: PluginProvenanceQuery): PluginTaskRecord[] {
    const runtimeStates = new Map<string, RuntimeTaskState>();
    for (const task of this.listPersistedRuntimeTaskStates(query)) {
      runtimeStates.set(task.taskId, task);
    }
    for (const task of this.tasks.values()) {
      runtimeStates.set(task.taskId, task);
    }
    const runtimeTasks = Array.from(runtimeStates.values())
      .filter((task) => !query?.appId || task.appId === query.appId)
      .map((task) => buildTaskRecord(task));
    return [...this.delegate.getTasks(query), ...runtimeTasks];
  }

  uninstall(params: {
    cleanupPlan: AppCleanupPlan;
    deleteData: boolean;
  }): Promise<PluginUninstallResult> {
    return this.delegate.uninstall(params);
  }

  private createAgentCapability(entryKey: string): LimeAgentCapability {
    return {
      startTask: (input) => this.startRuntimeTask(entryKey, input),
      streamTask: async (taskLookup) => {
        const task = await this.getRuntimeTask(entryKey, taskLookup);
        return task?.events ?? [];
      },
      getTask: (taskLookup) => this.getRuntimeTask(entryKey, taskLookup),
      cancelTask: (taskLookup) => this.cancelRuntimeTask(taskLookup),
      retryTask: (taskLookup) => this.retryRuntimeTask(entryKey, taskLookup),
      submitHostResponse: (input) => this.submitRuntimeHostResponse(input),
      listTasks: async () => this.getTasks({ appId: this.appId }),
    };
  }

  private async resolveWorkspaceId(
    request: RuntimeAgentTaskRequest,
  ): Promise<string> {
    const workspaceId =
      normalizeString(request.workspaceId) ?? normalizeString(this.workspaceId);
    if (workspaceId) {
      return workspaceId;
    }
    if (this.workspaceIdResolver) {
      return this.workspaceIdResolver();
    }
    return rejectMissingWorkspaceId();
  }

  private async resolveOptionalWorkspaceId(
    request: RuntimeAgentTaskRequest,
  ): Promise<string | undefined> {
    const workspaceId =
      normalizeString(request.workspaceId) ?? normalizeString(this.workspaceId);
    if (workspaceId) {
      return workspaceId;
    }
    return this.workspaceIdResolver?.();
  }

  private async startRuntimeTask(
    entryKey: string,
    input: PluginTaskRequest,
    retry?: {
      retryOfTaskId: string;
      retryAttempt: number;
      sessionId?: string;
      threadId?: string;
    },
  ): Promise<PluginTaskRecord> {
    const runtimeRequest = readRuntimeRequest(input);
    const taskKind = normalizeString(runtimeRequest.taskKind) ?? "plugin.task";
    const requiredCapabilities = normalizeList(
      runtimeRequest.requiredCapabilities,
    );
    const capabilityHints = normalizeList([
      ...(runtimeRequest.capabilityHints ?? []),
      ...(runtimeRequest.tools ?? []),
    ]);
    const requestedSessionId =
      normalizeString(runtimeRequest.sessionId) ?? retry?.sessionId;
    const requestedThreadId =
      normalizeString(runtimeRequest.threadId) ?? retry?.threadId;
    if (Boolean(requestedSessionId) !== Boolean(requestedThreadId)) {
      throw new Error(
        "Plugin Agent task requires sessionId and threadId together when reusing a thread.",
      );
    }
    const existingIdentity =
      requestedSessionId && requestedThreadId
        ? { sessionId: requestedSessionId, threadId: requestedThreadId }
        : undefined;
    const resolvedWorkspaceId = existingIdentity
      ? await this.resolveOptionalWorkspaceId(runtimeRequest)
      : await this.resolveWorkspaceId(runtimeRequest);
    const workspaceId = resolvedWorkspaceId ?? "";
    const pluginWorkerMetadata = buildPluginWorkerMetadata({
      appId: this.appId,
      entryKey,
      taskKind,
      title: runtimeRequest.title,
      prompt: runtimeRequest.prompt,
      workspaceId: resolvedWorkspaceId,
      taskRuntime: this.taskRuntime,
    });
    const metadata = {
      ...(runtimeRequest.metadata ?? {}),
      ...(pluginWorkerMetadata ? { plugin: pluginWorkerMetadata } : {}),
      plugin_host_bridge: {
        source: "plugin_runtime_page",
        retryOfTaskId: retry?.retryOfTaskId,
        retryAttempt: retry?.retryAttempt,
      },
    };
    const turnRuntimeRequest = {
      ...runtimeRequest.runtimeRequest,
      workspaceId:
        runtimeRequest.runtimeRequest?.workspaceId ?? resolvedWorkspaceId,
      metadata: {
        ...(isRecord(runtimeRequest.runtimeRequest?.metadata)
          ? runtimeRequest.runtimeRequest.metadata
          : {}),
        ...metadata,
      },
    };
    const taskId =
      normalizeString(runtimeRequest.taskId) ??
      (this.ensureSession ? createRuntimeTaskId() : undefined);
    const identity =
      existingIdentity ??
      (this.ensureSession
        ? await this.ensureSession({
            appId: this.appId,
            entryKey,
            workspaceId,
            taskId,
            taskKind,
            title: runtimeRequest.title,
            prompt: runtimeRequest.prompt,
            input: runtimeRequest.input,
            expectedOutput: runtimeRequest.expectedOutput,
            metadata,
          })
        : undefined);
    const result = await this.api.startTask({
      appId: this.appId,
      entryKey,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
      sessionId: identity?.sessionId,
      threadId: identity?.threadId,
      taskId,
      taskKind,
      idempotencyKey: runtimeRequest.idempotencyKey,
      title: runtimeRequest.title,
      prompt: runtimeRequest.prompt,
      input: runtimeRequest.input,
      expectedOutput: runtimeRequest.expectedOutput,
      requiredCapabilities,
      capabilityHints,
      knowledgeBindings: runtimeRequest.knowledge,
      humanReview: runtimeRequest.humanReview,
      eventName: normalizeString(runtimeRequest.eventName),
      turnId: normalizeString(runtimeRequest.turnId),
      runtimeRequest: turnRuntimeRequest,
      queueIfBusy: runtimeRequest.queueIfBusy,
      skipPreSubmitResume: runtimeRequest.skipPreSubmitResume,
      runStartHooks: runtimeRequest.runStartHooks,
      metadata,
    });
    const threadId = normalizeString(result.threadId);
    if (!threadId) {
      throw new Error(
        "Plugin runtime startTask did not return a canonical threadId",
      );
    }
    const state: RuntimeTaskState = {
      appId: result.appId,
      appVersion: this.appVersion,
      packageHash: this.packageHash,
      manifestHash: this.manifestHash,
      entryKey: result.entryKey ?? entryKey,
      taskId: result.taskId,
      traceId: result.traceId,
      sessionId: result.sessionId,
      threadId,
      turnId: result.turnId,
      workspaceId,
      taskKind: result.taskKind,
      startedAt: result.submittedAt || this.now(),
      request: {
        ...input,
        taskKind,
        input: runtimeRequest.input,
      },
      retryOfTaskId: retry?.retryOfTaskId,
      retryAttempt: retry?.retryAttempt,
    };
    this.tasks.set(state.taskId, state);
    await this.persistRuntimeTaskState(state);
    return buildTaskRecord(state);
  }

  private async getRuntimeTask(
    entryKey: string,
    taskLookup: string | PluginTaskLookup,
  ): Promise<PluginTaskRecord | null> {
    const lookup = normalizeTaskLookup(taskLookup);
    const state =
      this.tasks.get(lookup.taskId) ??
      this.loadPersistedRuntimeTaskState(lookup.taskId);
    const lookupThreadId = threadIdFromLookup(lookup);
    if (
      state?.threadId &&
      lookupThreadId &&
      state.threadId !== lookupThreadId
    ) {
      throw new Error(
        `Plugin task ${lookup.taskId} lookup threadId conflicts with persisted state`,
      );
    }
    const threadId = state?.threadId ?? lookupThreadId;
    if (!threadId) {
      return null;
    }
    const snapshot = await this.api.getTask({
      appId: state?.appId ?? this.appId,
      taskId: state?.taskId ?? lookup.taskId,
      threadId,
    });
    const nextState =
      state ??
      (await this.buildRuntimeTaskStateFromLookup(entryKey, lookup, snapshot));
    if (
      !nextState.request.expectedOutput &&
      lookup.expectedOutput !== undefined
    ) {
      nextState.request = {
        ...nextState.request,
        expectedOutput: lookup.expectedOutput,
      };
    }
    nextState.latestSnapshot = snapshot;
    this.tasks.set(nextState.taskId, nextState);
    await this.persistRuntimeTaskState(nextState);
    return buildTaskRecord(nextState, snapshot);
  }

  private async buildRuntimeTaskStateFromLookup(
    entryKey: string,
    lookup: PluginTaskLookup,
    snapshot: PluginRuntimeTaskSnapshot,
  ): Promise<RuntimeTaskState> {
    const taskKind = normalizeString(lookup.taskKind) ?? "plugin.task";
    const sessionId = snapshot.sessionId;
    const threadId = normalizeString(snapshot.threadId);
    if (!threadId) {
      throw new Error("Plugin task snapshot is missing canonical threadId");
    }
    const workspaceId =
      normalizeString(lookup.workspaceId) ??
      normalizeString(this.workspaceId) ??
      (this.workspaceIdResolver
        ? await this.workspaceIdResolver()
        : sessionId
          ? ""
          : await rejectMissingWorkspaceId());
    return {
      appId: snapshot.appId || this.appId,
      appVersion: this.appVersion,
      packageHash: this.packageHash,
      manifestHash: this.manifestHash,
      entryKey,
      taskId: lookup.taskId,
      traceId: normalizeString(lookup.traceId) ?? lookup.taskId,
      sessionId,
      threadId,
      turnId:
        normalizeString(lookup.turnId) ??
        readLatestTurnId(snapshot.threadRead) ??
        "",
      workspaceId,
      taskKind,
      startedAt: normalizeString(lookup.startedAt) ?? this.now(),
      request: {
        title: normalizeString(lookup.title) ?? "Plugin 任务",
        taskKind,
        input: lookup.input,
        expectedOutput: lookup.expectedOutput,
      },
    };
  }

  private async cancelRuntimeTask(
    taskLookup: string | PluginTaskLookup,
  ): Promise<PluginTaskRecord> {
    const taskId = normalizeTaskLookup(taskLookup).taskId;
    const state = await this.requireTask(taskId);
    const cancelResult = await this.api.cancelTask({
      appId: state.appId,
      taskId: state.taskId,
      threadId: state.threadId,
      turnId: state.turnId,
    });
    if (
      cancelResult.threadId !== state.threadId ||
      cancelResult.sessionId !== state.sessionId
    ) {
      throw new Error(
        `Plugin task ${taskId} cancel result conflicts with persisted identity`,
      );
    }
    const snapshot: PluginRuntimeTaskSnapshot = {
      appId: state.appId,
      taskId: state.taskId,
      sessionId: cancelResult.sessionId,
      threadId: cancelResult.threadId,
      status: "thread_read_available",
      taskStatus: cancelResult.status,
      taskEvents: cancelResult.cancelled
        ? [
            {
              id: `${taskId}:cancelled`,
              eventType: "task:cancelled",
              status: "cancelled",
              message: "已向 Lime AgentRuntime 请求取消任务。",
              occurredAt: this.now(),
            },
          ]
        : [
            {
              id: `${taskId}:not-running`,
              eventType: "task:status",
              status: "not_running",
              message: "任务当前未运行，未发送取消请求。",
              occurredAt: this.now(),
            },
          ],
      threadRead: state.latestSnapshot?.threadRead ?? null,
    };
    state.latestSnapshot = snapshot;
    await this.persistRuntimeTaskState(state);
    return buildTaskRecord(state, snapshot);
  }

  private async retryRuntimeTask(
    entryKey: string,
    taskLookup: string | PluginTaskLookup,
  ): Promise<PluginTaskRecord> {
    const taskId = normalizeTaskLookup(taskLookup).taskId;
    const source = await this.requireTask(taskId);
    const retryAttempt = (source.retryAttempt ?? 0) + 1;
    return this.startRuntimeTask(
      entryKey,
      buildRetryRequest(source, retryAttempt),
      {
        retryOfTaskId: source.taskId,
        retryAttempt,
        sessionId: source.sessionId,
        threadId: source.threadId,
      },
    );
  }

  private async submitRuntimeHostResponse(
    input: PluginTaskHostResponseRequest,
  ): Promise<PluginTaskHostResponseResult> {
    const state = await this.requireTask(input.taskId);
    const actionScope: NonNullable<
      AgentRuntimeRespondActionRequest["action_scope"]
    > = {
      session_id: input.actionScope?.sessionId ?? state.sessionId,
      thread_id: input.actionScope?.threadId ?? state.threadId,
    };
    if (input.actionScope?.turnId || state.turnId) {
      actionScope.turn_id = input.actionScope?.turnId ?? state.turnId;
    }
    const workflowResume = buildWorkflowResumeMetadata(input);
    const runtimeRequest: AgentRuntimeRespondActionRequest = {
      session_id: state.sessionId,
      request_id: input.requestId,
      action_type: input.actionType,
      confirmed: input.confirmed ?? true,
      metadata: {
        ...(input.metadata ?? {}),
        ...(workflowResume ? { workflowResume } : {}),
        plugin_runtime: {
          app_id: state.appId,
          entry_key: state.entryKey,
          task_id: state.taskId,
          source: "plugin_host_bridge",
        },
      },
      event_name: `plugin_runtime:${state.appId}:${state.taskId}:host_response`,
      action_scope: actionScope,
    };
    if (input.response !== undefined) {
      runtimeRequest.response = input.response;
    }
    if (input.userData !== undefined) {
      runtimeRequest.user_data = input.userData;
    }
    await this.api.submitHostResponse({
      appId: state.appId,
      taskId: state.taskId,
      runtimeRequest,
    });
    return {
      taskId: state.taskId,
      requestId: input.requestId,
      status: "submitted",
      submittedAt: this.now(),
    };
  }

  private async persistRuntimeTaskState(
    state: RuntimeTaskState,
  ): Promise<void> {
    try {
      const sdk = this.delegate.createSdkContext(state.entryKey ?? state.appId);
      await sdk.storage.set(runtimeTaskStorageKey(state.taskId), {
        schemaVersion: 1,
        state,
      });
    } catch (error) {
      console.warn("Plugin runtime task state persistence skipped", error);
    }
  }

  private listPersistedRuntimeTaskStates(
    query?: PluginProvenanceQuery,
  ): RuntimeTaskState[] {
    const storageKeyPrefix = runtimeTaskStorageKey("");
    return this.delegate
      .getStorageEntries({ appId: query?.appId ?? this.appId })
      .filter((entry) => entry.key.startsWith(storageKeyPrefix))
      .map((entry) => readPersistedRuntimeTaskState(entry.value))
      .filter((state): state is RuntimeTaskState => {
        if (!state) {
          return false;
        }
        if (query?.appId && state.appId !== query.appId) {
          return false;
        }
        if (query?.entryKey && state.entryKey !== query.entryKey) {
          return false;
        }
        return true;
      });
  }

  private loadPersistedRuntimeTaskState(
    taskId: string,
  ): RuntimeTaskState | null {
    const entry = this.delegate
      .getStorageEntries({ appId: this.appId })
      .find((item) => item.key === runtimeTaskStorageKey(taskId));
    const state = readPersistedRuntimeTaskState(entry?.value);
    if (state) {
      this.tasks.set(state.taskId, state);
      return state;
    }
    return null;
  }

  private async requireTask(taskId: string): Promise<RuntimeTaskState> {
    const state =
      this.tasks.get(taskId) ?? this.loadPersistedRuntimeTaskState(taskId);
    if (state) {
      return state;
    }
    throw new Error(`未找到 Plugin runtime task：${taskId}`);
  }
}

function buildPluginWorkerMetadata(params: {
  appId: string;
  entryKey: string;
  taskKind: string;
  title: string;
  prompt?: string;
  workspaceId?: string;
  taskRuntime?: PluginTaskRuntimeContract;
}): Record<string, unknown> | undefined {
  const taskRuntime = params.taskRuntime;
  if (!taskRuntime?.enabled || !taskRuntime.taskKinds.includes(params.taskKind)) {
    return undefined;
  }
  if (taskRuntime.blockers.length > 0) {
    throw new Error(
      `Plugin worker runtime is blocked: ${taskRuntime.blockers.join(", ")}`,
    );
  }
  const outputArtifactKind = normalizeString(
    taskRuntime.outputArtifactKind ?? undefined,
  );
  if (!outputArtifactKind) {
    throw new Error("Plugin worker runtime requires outputArtifactKind");
  }
  return {
    appId: params.appId,
    workspaceId: params.workspaceId,
    paneAction: {
      key: params.entryKey,
      prompt: normalizeString(params.prompt) ?? params.title,
      surfaceKind: "pluginRuntime",
      paneKind: "pluginTask",
      outputArtifactKind,
      taskKind: params.taskKind,
    },
  };
}
