import {
  METHOD_PLUGIN_UI_RUNTIME_STATUS,
  METHOD_THREAD_START,
  METHOD_THREAD_READ,
  METHOD_TURN_START,
  METHOD_TURN_INTERRUPT,
  type PluginUiRuntimeStatusResponse,
  type ThreadReadResponse,
  type ThreadStartResponse,
  type TurnInterruptResponse,
  type TurnStartResponse,
} from "@limecloud/app-server-client";

type HostArgs = Record<string, unknown> | null | undefined;
type AppServerParams = Record<string, unknown>;
type AppServerRequest = <T>(
  method: string,
  params?: AppServerParams,
) => Promise<T>;

export class PluginRuntimeTaskHost {
  readonly #appServerRequest: AppServerRequest;

  constructor(appServerRequest: AppServerRequest) {
    this.#appServerRequest = appServerRequest;
  }

  async startTask(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskKind = readRequiredString(request, "taskKind");
    const workspaceId = readRequiredString(request, "workspaceId");
    const nowMs = Date.now();
    const taskId = readString(request, "taskId") ?? `plugin-task-${nowMs}`;
    const traceId = `plugin-trace-${nowMs}`;
    const eventName =
      readString(request, "eventName") ?? `plugin_runtime:${appId}:${taskId}`;
    const explicitRunWorker = readBoolean(request, "runWorker");
    const requestedRuntimeRequest = readRecord(request, "runtimeRequest");
    const workerTrigger = await this.#resolveWorkerTrigger({
      appId,
      taskKind,
      requireWorker: explicitRunWorker === true,
      skipWorker: explicitRunWorker === false,
    });
    const metadata: Record<string, unknown> = {
      ...(readRecord(request, "metadata") ?? {}),
      ...(readRecord(requestedRuntimeRequest, "metadata") ?? {}),
      ...(workerTrigger
        ? {
            plugin: {
              appId,
              workspaceId,
              paneAction: {
                key: readString(request, "entryKey") ?? "default",
                prompt:
                  readString(request, "prompt") ??
                  readString(request, "title") ??
                  taskKind,
                surfaceKind: "pluginRuntime",
                paneKind: "pluginTask",
                outputArtifactKind: workerTrigger.outputArtifactKind,
                taskKind,
              },
            },
          }
        : {}),
    };
    const message = buildPluginRuntimeTaskMessage(request);
    const queuedTurnId = `plugin-queued-${taskId}`;
    const runtimeRequest = {
      ...requestedRuntimeRequest,
      workspaceId:
        readString(requestedRuntimeRequest, "workspaceId") ?? workspaceId,
      metadata,
    };
    const identity = await this.#resolveThreadIdentity({
      request,
      runtimeRequest,
      taskKind,
    });
    const turnResponse = await this.#appServerRequest<TurnStartResponse>(
      METHOD_TURN_START,
      buildTurnStartParams({
        threadId: identity.threadId,
        message,
        eventName,
        queuedTurnId,
        appId,
        taskId,
        taskKind,
        workspaceId,
        runtimeRequest,
      }),
    );
    const turnId = readRequiredCanonicalId(
      turnResponse.turn,
      "turn/start turn",
    );
    const worker = workerTrigger
      ? {
          status: "delegated",
          owner: "runtime_core",
          outputArtifactKind: workerTrigger.outputArtifactKind,
        }
      : {
          status: "skipped",
          reason: "task_runtime_not_selected",
        };

    return {
      appId,
      entryKey: readString(request, "entryKey") ?? undefined,
      taskId,
      traceId,
      taskKind,
      sessionId: identity.sessionId,
      threadId: identity.threadId,
      turnId,
      eventName,
      status: "accepted",
      worker,
      submittedAt:
        timestampToIso(turnResponse.turn.startedAt) ?? new Date().toISOString(),
    };
  }

  async getTask(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const threadId = readRequiredString(request, "threadId");
    const response = await this.#appServerRequest<ThreadReadResponse>(
      METHOD_THREAD_READ,
      { threadId, includeTurns: true },
    );
    const thread = requireCanonicalThread(response, threadId);
    return {
      appId,
      taskId,
      sessionId: thread.sessionId,
      threadId: thread.id,
      status: "thread_read_available",
      taskStatus: sessionStatusToPluginTaskStatus(thread.status),
      taskEvents: [],
      threadRead: thread,
    };
  }

  async cancelTask(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const threadId = readRequiredString(request, "threadId");
    let turnId = readString(request, "turnId");
    const response = await this.#appServerRequest<ThreadReadResponse>(
      METHOD_THREAD_READ,
      { threadId, includeTurns: true },
    );
    const thread = requireCanonicalThread(response, threadId);
    const activeTurnId = activeThreadTurnId(response);
    if (!activeTurnId || (turnId && turnId !== activeTurnId)) {
      return {
        appId,
        taskId,
        sessionId: thread.sessionId,
        threadId,
        cancelled: false,
        status: "not_running",
      };
    }
    turnId = activeTurnId;
    await this.#appServerRequest<TurnInterruptResponse>(METHOD_TURN_INTERRUPT, {
      threadId,
      turnId,
    });
    return {
      appId,
      taskId,
      sessionId: thread.sessionId,
      threadId,
      cancelled: true,
      status: "cancelled",
    };
  }

  async submitHostResponse(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    readRequiredString(request, "appId");
    readRequiredString(request, "taskId");
    throw new Error(
      "plugin_runtime_submit_host_response is retired; respond through the typed App Server server-request dispatcher.",
    );
  }

  async #resolveThreadIdentity(params: {
    request: Record<string, unknown>;
    runtimeRequest: Record<string, unknown>;
    taskKind: string;
  }): Promise<{ sessionId: string; threadId: string }> {
    const requestedThreadId = readString(params.request, "threadId");
    const requestedSessionId = readString(params.request, "sessionId");
    if (requestedThreadId) {
      if (!requestedSessionId) {
        throw new Error(
          "Plugin runtime task requires sessionId with an existing threadId",
        );
      }
      return {
        sessionId: requestedSessionId,
        threadId: requestedThreadId,
      };
    }

    const response = await this.#appServerRequest<ThreadStartResponse>(
      METHOD_THREAD_START,
      buildThreadStartParams(params.runtimeRequest, params.taskKind),
    );
    const threadId = readRequiredCanonicalId(
      response.thread,
      "thread/start thread",
    );
    const sessionId = readRequiredString(response.thread, "sessionId");
    return { sessionId, threadId };
  }

  async #resolveWorkerTrigger(params: {
    appId: string;
    taskKind: string;
    requireWorker: boolean;
    skipWorker: boolean;
  }): Promise<{
    outputArtifactKind: string;
  } | null> {
    if (params.skipWorker) {
      return null;
    }
    const status = await this.#appServerRequest<PluginUiRuntimeStatusResponse>(
      METHOD_PLUGIN_UI_RUNTIME_STATUS,
      { appId: params.appId },
    );
    const taskRuntime = status.taskRuntime;
    if (!taskRuntime?.enabled) {
      if (params.requireWorker) {
        throw new Error(`Plugin ${params.appId} task runtime is not enabled`);
      }
      return null;
    }
    const taskKinds = Array.isArray(taskRuntime.taskKinds)
      ? taskRuntime.taskKinds
      : [];
    const shouldRunForTaskKind =
      params.requireWorker || taskKinds.includes(params.taskKind);
    if (!shouldRunForTaskKind) {
      return null;
    }
    const blockers = taskRuntime.blockers ?? [];
    if (blockers.length > 0) {
      throw new Error(
        `Plugin ${params.appId} task runtime is blocked: ${blockers.join(", ")}`,
      );
    }
    const outputArtifactKind = taskRuntime.outputArtifactKind?.trim();
    if (!outputArtifactKind) {
      throw new Error(
        `Plugin ${params.appId} task runtime has no output artifact kind`,
      );
    }
    return { outputArtifactKind };
  }
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const next = record[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : null;
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readBoolean(value: unknown, key: string): boolean | null {
  const record = toRecord(value);
  if (!record || typeof record[key] !== "boolean") {
    return null;
  }
  return record[key];
}

function buildThreadStartParams(
  runtimeRequest: Record<string, unknown>,
  taskKind: string,
): AppServerParams {
  const providerConfig = readRecord(runtimeRequest, "providerConfig");
  const modelProvider =
    readString(runtimeRequest, "providerPreference") ??
    readString(providerConfig, "providerName");
  const model =
    readString(runtimeRequest, "modelPreference") ??
    readString(providerConfig, "modelName");
  const cwd = readRuntimeCwd(runtimeRequest);
  const workspaceRoot = readString(runtimeRequest, "workspaceRoot");
  const params: AppServerParams = {
    historyMode: "paginated",
    serviceName: taskKind,
    threadSource: "plugin",
  };
  if (modelProvider) {
    params.modelProvider = modelProvider;
  }
  if (model) {
    params.model = model;
  }
  if (cwd) {
    params.cwd = cwd;
  }
  if (workspaceRoot) {
    params.runtimeWorkspaceRoots = [workspaceRoot];
  }
  return params;
}

function buildTurnStartParams(params: {
  threadId: string;
  message: string;
  eventName: string;
  queuedTurnId: string;
  appId: string;
  taskId: string;
  taskKind: string;
  workspaceId: string;
  runtimeRequest: Record<string, unknown>;
}): AppServerParams {
  const providerConfig = readRecord(params.runtimeRequest, "providerConfig");
  const model =
    readString(params.runtimeRequest, "modelPreference") ??
    readString(providerConfig, "modelName");
  const effort = readString(params.runtimeRequest, "reasoningEffort");
  const cwd = readRuntimeCwd(params.runtimeRequest);
  const request: AppServerParams = {
    threadId: params.threadId,
    input: [{ type: "text", text: params.message }],
    additionalContext: {
      metadata: {
        kind: "application",
        value: JSON.stringify(
          readRecord(params.runtimeRequest, "metadata") ?? {},
        ),
      },
    },
    responsesapiClientMetadata: {
      appId: params.appId,
      eventName: params.eventName,
      queuedTurnId: params.queuedTurnId,
      taskId: params.taskId,
      taskKind: params.taskKind,
      workspaceId: params.workspaceId,
    },
  };
  if (model) {
    request.model = model;
  }
  if (effort) {
    request.effort = effort;
  }
  if (cwd) {
    request.cwd = cwd;
  }
  if (
    Object.prototype.hasOwnProperty.call(
      params.runtimeRequest,
      "approvalPolicy",
    )
  ) {
    request.approvalPolicy = params.runtimeRequest.approvalPolicy;
  }
  if (
    Object.prototype.hasOwnProperty.call(params.runtimeRequest, "sandboxPolicy")
  ) {
    request.sandboxPolicy = params.runtimeRequest.sandboxPolicy;
  }
  return request;
}

function readRuntimeCwd(
  runtimeRequest: Record<string, unknown>,
): string | null {
  return (
    readString(runtimeRequest, "workingDir") ??
    readString(runtimeRequest, "projectRoot") ??
    readString(runtimeRequest, "workspaceRoot")
  );
}

function readRequiredCanonicalId(value: unknown, label: string): string {
  const id = readString(value, "id");
  if (!id) {
    throw new Error(`${label} did not include a canonical id`);
  }
  return id;
}

function requireCanonicalThread(
  response: ThreadReadResponse,
  expectedThreadId: string,
): ThreadReadResponse["thread"] {
  const threadId = readRequiredCanonicalId(
    response.thread,
    "thread/read thread",
  );
  if (threadId !== expectedThreadId) {
    throw new Error(
      `thread/read returned threadId ${threadId}, expected ${expectedThreadId}`,
    );
  }
  readRequiredString(response.thread, "sessionId");
  return response.thread;
}

function timestampToIso(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const millis = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
  return new Date(millis).toISOString();
}

function buildPluginRuntimeTaskMessage(
  request: Record<string, unknown>,
): string {
  const prompt =
    readString(request, "prompt") ??
    readString(request, "title") ??
    readRequiredString(request, "taskKind");
  return [
    "【Plugin Runtime Task】",
    `App: ${readRequiredString(request, "appId")}`,
    `Entry: ${readString(request, "entryKey") ?? "default"}`,
    `TaskKind: ${readRequiredString(request, "taskKind")}`,
    "",
    "Business Prompt:",
    prompt,
    "",
    "Runtime Boundary:",
    "- 请在 Lime AgentRuntime 主链中完成这个 App 业务任务。",
    "- 不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。",
    "",
    "Input JSON:",
    stringifyJsonField(request, "input"),
    "",
    "Expected Output JSON:",
    stringifyJsonField(request, "expectedOutput"),
  ].join("\n");
}

function stringifyJsonField(
  record: Record<string, unknown>,
  key: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return "{}";
  }
  try {
    return JSON.stringify(record[key], null, 2) ?? "{}";
  } catch {
    return String(record[key]);
  }
}

function sessionStatusToPluginTaskStatus(status: unknown): string {
  if (!status || typeof status !== "object") {
    return "thread_read_available";
  }
  const type = (status as { type?: unknown }).type;
  switch (type) {
    case "idle":
      return "idle";
    case "systemError":
      return "failed";
    case "active": {
      const activeFlags = (status as { activeFlags?: unknown }).activeFlags;
      return Array.isArray(activeFlags) && activeFlags.length > 0
        ? "blocked"
        : "running";
    }
    case "notLoaded":
    default:
      return "thread_read_available";
  }
}

function activeThreadTurnId(response: ThreadReadResponse): string | null {
  const activeTurnIds = (response.thread.turns ?? [])
    .filter((turn) => turn.status === "inProgress")
    .map((turn) => readRequiredCanonicalId(turn, "thread/read active turn"));
  if (activeTurnIds.length > 1) {
    throw new Error(
      `thread/read returned multiple active turns for ${response.thread.id}`,
    );
  }
  return activeTurnIds[0] ?? null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
