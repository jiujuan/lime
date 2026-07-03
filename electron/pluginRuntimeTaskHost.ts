import {
  AppServerRequestError,
  ERROR_CODES,
  METHOD_PLUGIN_UI_RUNTIME_STATUS,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  type PluginUiRuntimeStatusResponse,
  type AgentSessionActionRespondResponse,
  type AgentSessionReadResponse,
  type AgentSessionRuntimeEventAppendResponse,
  type AgentSessionStartResponse,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartResponse,
} from "@limecloud/app-server-client";
import {
  buildPluginTaskWorkerFailureResult,
  runPluginTaskWorker,
} from "./pluginTaskWorker";

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
    const sessionId =
      readString(request, "sessionId") ?? `plugin-runtime-${nowMs}`;
    const turnId = readString(request, "turnId") ?? `plugin-turn-${nowMs}`;
    const eventName =
      readString(request, "eventName") ??
      `plugin_runtime:${appId}:${taskId}`;
    const queueIfBusy = readBoolean(request, "queueIfBusy") ?? true;
    const skipPreSubmitResume =
      readBoolean(request, "skipPreSubmitResume") ?? false;
    const requestedPackageRootPath =
      readString(request, "packageRootPath") ??
      readString(request, "runtimePackageRoot") ??
      readString(request, "appRootPath") ??
      undefined;
    const explicitRunWorker = readBoolean(request, "runWorker");
    const turnConfig =
      readRecord(request, "turnConfig") ??
      readRecord(request, "turn_config") ??
      {};
    const metadata = {
      ...(readRecord(request, "metadata") ?? {}),
      ...(readRecord(turnConfig, "metadata") ?? {}),
    };
    const message = buildPluginRuntimeTaskMessage(request);
    const providerPreference =
      readString(request, "providerPreference") ??
      readString(request, "provider_preference") ??
      readString(turnConfig, "providerPreference") ??
      readString(turnConfig, "provider_preference");
    const modelPreference =
      readString(request, "modelPreference") ??
      readString(request, "model_preference") ??
      readString(turnConfig, "modelPreference") ??
      readString(turnConfig, "model_preference");
    const queuedTurnId = `plugin-queued-${taskId}`;
    const hostOptions = {
      asterChatRequest: {
        message,
        session_id: sessionId,
        event_name: eventName,
        images: null,
        provider_config:
          turnConfig.providerConfig ?? turnConfig.provider_config ?? null,
        provider_preference: providerPreference,
        model_preference: modelPreference,
        reasoning_effort:
          turnConfig.reasoningEffort ?? turnConfig.reasoning_effort ?? null,
        thinking_enabled:
          turnConfig.thinkingEnabled ?? turnConfig.thinking_enabled ?? null,
        approval_policy:
          turnConfig.approvalPolicy ?? turnConfig.approval_policy ?? null,
        sandbox_policy:
          turnConfig.sandboxPolicy ?? turnConfig.sandbox_policy ?? null,
        project_id: null,
        workspace_id: workspaceId,
        web_search: turnConfig.webSearch ?? turnConfig.web_search ?? null,
        search_mode: turnConfig.searchMode ?? turnConfig.search_mode ?? null,
        execution_strategy:
          turnConfig.executionStrategy ?? turnConfig.execution_strategy ?? null,
        auto_continue:
          turnConfig.autoContinue ?? turnConfig.auto_continue ?? null,
        system_prompt:
          turnConfig.systemPrompt ?? turnConfig.system_prompt ?? null,
        metadata,
        turn_id: turnId,
        queue_if_busy: queueIfBusy,
        queued_turn_id: queuedTurnId,
        turn_config: turnConfig,
      },
    };
    const workerConfig = await this.#resolveWorkerConfig({
      appId,
      taskKind,
      requestedPackageRootPath,
      requireWorker: explicitRunWorker === true,
      skipWorker: explicitRunWorker === false,
    });
    const shouldRunWorker = Boolean(workerConfig);

    await this.#ensureSession({ sessionId, appId, workspaceId });
    await this.#appServerRequest<AgentSessionTurnStartResponse>(
      METHOD_AGENT_SESSION_TURN_START,
      {
        sessionId,
        turnId,
        input: {
          text: message,
          attachments: [],
        },
        runtimeOptions: {
          stream: true,
          eventName,
          providerPreference: providerPreference ?? undefined,
          modelPreference: modelPreference ?? undefined,
          metadata,
          queuedTurnId,
          hostOptions,
        },
        queueIfBusy,
        skipPreSubmitResume,
      },
    );
    const worker = shouldRunWorker
      ? await this.#runAndAppendWorker({
          appId,
          taskId,
          taskKind,
          sessionId,
          turnId,
          packageRootPath: workerConfig?.packageRootPath,
          workerEntrypoint: workerConfig?.workerEntrypoint ?? null,
          request,
        })
      : {
          status: "skipped",
          reason: "package_root_missing",
        };

    return {
      appId,
      entryKey: readString(request, "entryKey") ?? undefined,
      taskId,
      traceId,
      taskKind,
      sessionId,
      turnId,
      eventName,
      status: "accepted",
      worker,
      submittedAt: new Date().toISOString(),
    };
  }

  async getTask(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const sessionId = readRequiredString(request, "sessionId");
    const response = await this.#appServerRequest<AgentSessionReadResponse>(
      METHOD_AGENT_SESSION_READ,
      { sessionId },
    );
    return {
      appId,
      taskId,
      sessionId,
      status: "thread_read_available",
      taskStatus: sessionStatusToPluginTaskStatus(response.session.status),
      taskEvents: [],
      threadRead: response.detail ?? sessionReadToLegacy(response),
    };
  }

  async cancelTask(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const sessionId = readRequiredString(request, "sessionId");
    let turnId = readString(request, "turnId");
    if (!turnId) {
      const response = await this.#appServerRequest<AgentSessionReadResponse>(
        METHOD_AGENT_SESSION_READ,
        { sessionId },
      );
      turnId = activeAgentSessionTurnId(response);
    }
    if (!turnId) {
      return {
        appId,
        taskId,
        sessionId,
        cancelled: false,
        status: "not_running",
      };
    }
    await this.#appServerRequest<AgentSessionTurnCancelResponse>(
      METHOD_AGENT_SESSION_TURN_CANCEL,
      { sessionId, turnId },
    );
    return {
      appId,
      taskId,
      sessionId,
      cancelled: true,
      status: "cancelled",
    };
  }

  async submitHostResponse(args: HostArgs): Promise<Record<string, unknown>> {
    const request = readRequest(args);
    const appId = readRequiredString(request, "appId");
    const taskId = readRequiredString(request, "taskId");
    const runtimeRequest = readRecord(request, "runtimeRequest") ?? {};
    const sessionId =
      readString(runtimeRequest, "sessionId") ??
      readRequiredString(runtimeRequest, "session_id");
    const requestId =
      readString(runtimeRequest, "requestId") ??
      readRequiredString(runtimeRequest, "request_id");
    const actionType =
      readString(runtimeRequest, "actionType") ??
      readString(runtimeRequest, "action_type") ??
      "tool_confirmation";
    await this.#appServerRequest<AgentSessionActionRespondResponse>(
      METHOD_AGENT_SESSION_ACTION_RESPOND,
      {
        sessionId,
        requestId,
        actionType,
        confirmed: readBoolean(runtimeRequest, "confirmed") ?? false,
        ...readStringParam(runtimeRequest, "response", "response"),
        userData: runtimeRequest.userData ?? runtimeRequest.user_data,
        metadata: runtimeRequest.metadata,
        ...readStringParam(runtimeRequest, "eventName", "eventName"),
        ...readStringParam(runtimeRequest, "event_name", "eventName"),
        actionScope: normalizeAgentSessionActionScope(
          runtimeRequest.actionScope ?? runtimeRequest.action_scope,
        ),
      },
    );
    return {
      appId,
      taskId,
      status: "submitted",
    };
  }

  async #ensureSession(params: {
    sessionId: string;
    appId: string;
    workspaceId: string;
  }): Promise<void> {
    try {
      await this.#appServerRequest<AgentSessionStartResponse>(
        METHOD_AGENT_SESSION_START,
        params,
      );
    } catch (error) {
      if (isAppServerSessionAlreadyExistsError(error)) {
        return;
      }
      throw error;
    }
  }

  async #resolveWorkerConfig(params: {
    appId: string;
    taskKind: string;
    requestedPackageRootPath?: string;
    requireWorker: boolean;
    skipWorker: boolean;
  }): Promise<{
    packageRootPath: string;
    workerEntrypoint: string;
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
      if (params.requireWorker || params.requestedPackageRootPath) {
        throw new Error(`Plugin ${params.appId} task runtime is not enabled`);
      }
      return null;
    }
    const taskKinds = Array.isArray(taskRuntime.taskKinds)
      ? taskRuntime.taskKinds
      : [];
    const shouldRunForTaskKind =
      params.requireWorker ||
      Boolean(params.requestedPackageRootPath) ||
      taskKinds.includes(params.taskKind);
    if (!shouldRunForTaskKind) {
      return null;
    }
    const blockers = taskRuntime.blockers ?? [];
    if (blockers.length > 0) {
      throw new Error(
        `Plugin ${params.appId} task runtime is blocked: ${blockers.join(", ")}`,
      );
    }
    const workerEntrypoint = taskRuntime.workerEntrypoint?.trim();
    if (!workerEntrypoint) {
      throw new Error(
        `Plugin ${params.appId} task runtime has no worker entrypoint`,
      );
    }
    const packageRootPath =
      params.requestedPackageRootPath ?? taskRuntime.packageRootPath?.trim();
    if (!packageRootPath) {
      throw new Error(
        `Plugin ${params.appId} task runtime has no package root path`,
      );
    }
    return {
      packageRootPath,
      workerEntrypoint,
    };
  }

  async #runAndAppendWorker(params: {
    appId: string;
    taskId: string;
    taskKind: string;
    sessionId: string;
    turnId: string;
    packageRootPath?: string;
    workerEntrypoint: string | null;
    request: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (!params.packageRootPath) {
      throw new Error("Plugin task worker requires packageRootPath");
    }
    if (!params.workerEntrypoint) {
      throw new Error("Plugin task worker requires workerEntrypoint");
    }
    const workerRequest = {
      appId: params.appId,
      taskId: params.taskId,
      taskKind: params.taskKind,
      sessionId: params.sessionId,
      turnId: params.turnId,
      packageRootPath: params.packageRootPath,
      workerEntrypoint: params.workerEntrypoint,
      input: params.request.input,
      prompt: readString(params.request, "prompt") ?? undefined,
      title: readString(params.request, "title") ?? undefined,
      metadata: params.request.metadata,
      timeoutMs: readNumber(params.request, "workerTimeoutMs") ?? undefined,
    };
    const workerResult = await runPluginTaskWorker(workerRequest).catch(
      (error) => buildPluginTaskWorkerFailureResult(workerRequest, error),
    );
    const appended =
      await this.#appServerRequest<AgentSessionRuntimeEventAppendResponse>(
        METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
        {
          sessionId: params.sessionId,
          turnId: params.turnId,
          runtimeEvents: workerResult.runtimeEvents,
        },
      );
    return {
      status: workerResult.status,
      artifactKind:
        workerResult.status === "completed" ? workerResult.artifactKind : undefined,
      errorCode:
        workerResult.status === "failed" ? workerResult.errorCode : undefined,
      errorMessage:
        workerResult.status === "failed" ? workerResult.errorMessage : undefined,
      runtimeEventCount: workerResult.runtimeEvents.length,
      appendedEventCount: appended.events?.length ?? 0,
    };
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

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function readStringParam(
  value: unknown,
  inputKey: string,
  outputKey: string,
): AppServerParams {
  const next = readString(value, inputKey);
  return next ? { [outputKey]: next } : {};
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

function sessionStatusToPluginTaskStatus(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "waitingAction":
      return "blocked";
    case "idle":
      return "idle";
    case "running":
      return "running";
    default:
      return "thread_read_available";
  }
}

function activeAgentSessionTurnId(
  response: AgentSessionReadResponse,
): string | null {
  for (let index = response.turns.length - 1; index >= 0; index -= 1) {
    const turn = response.turns[index];
    if (
      turn &&
      (turn.status === "accepted" ||
        turn.status === "queued" ||
        turn.status === "running" ||
        turn.status === "waitingAction")
    ) {
      return turn.turnId;
    }
  }
  return null;
}

function normalizeAgentSessionActionScope(
  value: unknown,
): Record<string, string> | undefined {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  const scope = {
    ...readStringParam(record, "sessionId", "sessionId"),
    ...readStringParam(record, "session_id", "sessionId"),
    ...readStringParam(record, "threadId", "threadId"),
    ...readStringParam(record, "thread_id", "threadId"),
    ...readStringParam(record, "turnId", "turnId"),
    ...readStringParam(record, "turn_id", "turnId"),
  };
  return Object.keys(scope).length > 0
    ? (scope as Record<string, string>)
    : undefined;
}

function isAppServerSessionAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof AppServerRequestError &&
    error.response.error.code === ERROR_CODES.sessionAlreadyExists
  );
}

function sessionReadToLegacy(
  response: AgentSessionReadResponse,
): Record<string, unknown> {
  const threadRead = threadReadFromAgentSessionRead(response);
  return {
    id: response.session.sessionId,
    thread_id: response.session.threadId,
    name: response.session.sessionId,
    created_at: timestampMillis(response.session.createdAt),
    updated_at: timestampMillis(response.session.updatedAt),
    model: undefined,
    workspace_id: response.session.workspaceId,
    messages: [],
    turns: response.turns,
    items: [],
    queued_turns: [],
    thread_read: threadRead,
    todo_items: [],
    child_subagent_sessions: [],
  };
}

function threadReadFromAgentSessionRead(
  response: AgentSessionReadResponse,
): Record<string, unknown> | null {
  const detail = toRecord(response.detail);
  return toRecord(detail?.thread_read) ?? toRecord(detail?.threadRead);
}

function timestampMillis(value: string | undefined): number {
  if (!value) {
    return Date.now();
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  return Date.now();
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
