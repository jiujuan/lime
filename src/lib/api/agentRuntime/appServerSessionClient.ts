import {
  AppServerClient,
  type AppServerAgentSession,
  type AppServerAgentTurn,
  type AppServerAgentSessionReadParams,
  type AppServerAgentSessionReadResponse,
  type AppServerAgentSessionUpdateParams,
  type AppServerBusinessObjectRef,
} from "@/lib/api/appServer";
import { METHOD_AGENT_SESSION_LIST } from "../../../../packages/app-server-client/src/protocol";
import type { AgentThreadTurn, AgentThreadTurnStatus } from "../agentProtocol";
import { projectAppServerSessionReadToThreadReadModel } from "./appServerReadModelProjection";
import type {
  AsterExecutionStrategy,
  AsterSessionDetail,
  AsterSessionInfo,
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeListSessionsOptions,
  AgentRuntimeUpdateSessionRequest,
} from "./types";

const DEFAULT_APP_ID = "desktop";

export type AppServerSessionRpcClient = Pick<
  AppServerClient,
  | "startSession"
  | "readSession"
  | "updateSession"
  | "archiveManySessions"
  | "deleteSession"
  | "request"
>;

export type AppServerAgentSessionListParams = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
  cwd?: string | string[];
  workspaceId?: string;
  limit?: number;
};

export type AppServerAgentSessionOverview = {
  sessionId: string;
  threadId?: string;
  title?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  workspaceId?: string;
  workingDir?: string;
  executionStrategy?: string;
  messagesCount: number;
};

export type AppServerAgentSessionListResponse = {
  sessions: AppServerAgentSessionOverview[];
};

type NormalizedAppServerAgentSessionReadResponse =
  AppServerAgentSessionReadResponse & {
    detail?: unknown;
  };

export interface AppServerSessionClientDeps {
  appServerClient?: AppServerSessionRpcClient;
}

export function createAppServerSessionClient({
  appServerClient = new AppServerClient(),
}: AppServerSessionClientDeps = {}) {
  async function createAgentRuntimeSession(
    workspaceId?: string,
    name?: string,
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ): Promise<string> {
    const sessionScope = normalizeCreateSessionScope(workspaceId, options);
    const normalizedName = name?.trim() || "新对话";
    const response = await appServerClient.startSession({
      appId: DEFAULT_APP_ID,
      workspaceId: sessionScope.workspaceId,
      businessObjectRef: sessionBusinessObjectRef({
        scopeId: sessionScope.scopeId,
        name: normalizedName,
        executionStrategy,
        runStartHooks: options?.runStartHooks,
        workingDir: sessionScope.workingDir,
        metadata: options?.metadata,
      }),
    });
    assertAppServerAgentSession(response.result.session);
    return response.result.session.sessionId;
  }

  async function listAgentRuntimeSessions(
    options?: AgentRuntimeListSessionsOptions,
  ): Promise<AsterSessionInfo[]> {
    const response =
      await appServerClient.request<AppServerAgentSessionListResponse>(
        METHOD_AGENT_SESSION_LIST,
        appServerSessionListParamsFromOptions(options),
      );
    const sessions = readAppServerAgentSessionListResponse(response.result);
    if (!sessions) {
      throw new Error("agentSession/list did not return session list");
    }
    return sessions.map(appServerSessionOverviewToRuntimeInfo);
  }

  async function getAgentRuntimeSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AsterSessionDetail> {
    const response = await appServerClient.readSession(
      appServerSessionReadParamsFromOptions(sessionId, options),
    );
    const readResponse = readAppServerAgentSessionReadResponse(response.result);
    if (!readResponse) {
      throw new Error("agentSession/read did not return session detail");
    }
    return (
      readSessionDetail(readResponse) ??
      appServerSessionReadToRuntimeDetail(readResponse)
    );
  }

  async function updateAgentRuntimeSession(
    request: AgentRuntimeUpdateSessionRequest,
  ): Promise<void> {
    await appServerClient.updateSession(
      appServerSessionUpdateParamsFromRequest(request),
    );
  }

  async function archiveManyAgentRuntimeSessions(
    sessionIds: string[],
  ): Promise<AsterSessionInfo[]> {
    const response = await appServerClient.archiveManySessions({
      sessionIds: normalizeSessionIds(sessionIds),
    });
    const sessions = readAppServerAgentSessionListResponse(response.result);
    if (!sessions) {
      throw new Error(
        "agentSession/archiveMany did not return archived sessions",
      );
    }
    return sessions.map(appServerSessionOverviewToRuntimeInfo);
  }

  async function deleteAgentRuntimeSession(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required for agentSession/delete");
    }
    const response = await appServerClient.deleteSession({
      sessionId: normalizedSessionId,
    });
    if (response.result.deleted !== true) {
      throw new Error("agentSession/delete did not confirm deletion");
    }
  }

  return {
    archiveManyAgentRuntimeSessions,
    createAgentRuntimeSession,
    deleteAgentRuntimeSession,
    getAgentRuntimeSession,
    listAgentRuntimeSessions,
    updateAgentRuntimeSession,
  };
}

function assertAppServerAgentSession(
  value: unknown,
): asserts value is AppServerAgentSession {
  if (!isAppServerAgentSession(value)) {
    throw new Error("agentSession/start did not return an App Server session");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(record, camelKey)) {
    return record[camelKey];
  }
  return snakeKey ? record[snakeKey] : undefined;
}

function readStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string {
  const value = readField(record, camelKey, snakeKey);
  return typeof value === "string" ? value : "";
}

function readOptionalStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string | undefined {
  const value = readField(record, camelKey, snakeKey);
  return typeof value === "string" ? value : undefined;
}

function readNumberField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): number | undefined {
  const value = readField(record, camelKey, snakeKey);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readNullableStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string | null | undefined {
  const value = readField(record, camelKey, snakeKey);
  return value === null || typeof value === "string" ? value : undefined;
}

function readAppServerAgentSession(
  value: unknown,
): AppServerAgentSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readStringField(value, "sessionId", "session_id");
  const threadId = readStringField(value, "threadId", "thread_id");
  const appId = readStringField(value, "appId", "app_id");
  const status = readStringField(value, "status");
  const createdAt = readStringField(value, "createdAt", "created_at");
  const updatedAt = readStringField(value, "updatedAt", "updated_at");
  const workspaceId = readOptionalStringField(
    value,
    "workspaceId",
    "workspace_id",
  );
  if (
    !sessionId ||
    !threadId ||
    !appId ||
    !isAppServerAgentSessionStatus(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return omitUndefined({
    ...(value as Partial<AppServerAgentSession>),
    sessionId,
    threadId,
    appId,
    workspaceId,
    status,
    createdAt,
    updatedAt,
  }) as AppServerAgentSession;
}

function isAppServerAgentSession(
  value: unknown,
): value is AppServerAgentSession {
  return readAppServerAgentSession(value) !== null;
}

function readAppServerAgentSessionOverview(
  value: unknown,
): AppServerAgentSessionOverview | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = readStringField(value, "sessionId", "session_id");
  const model = readField(value, "model");
  const messagesCount = readNumberField(
    value,
    "messagesCount",
    "messages_count",
  );
  const createdAt = readStringField(value, "createdAt", "created_at");
  const updatedAt = readStringField(value, "updatedAt", "updated_at");
  if (
    !sessionId ||
    typeof model !== "string" ||
    typeof messagesCount !== "number" ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return omitUndefined({
    ...(value as Partial<AppServerAgentSessionOverview>),
    sessionId,
    threadId:
      readOptionalStringField(value, "threadId", "thread_id") ?? undefined,
    title: readOptionalStringField(value, "title"),
    model,
    createdAt,
    updatedAt,
    archivedAt: readNullableStringField(value, "archivedAt", "archived_at"),
    workspaceId: readOptionalStringField(value, "workspaceId", "workspace_id"),
    workingDir: readOptionalStringField(value, "workingDir", "working_dir"),
    executionStrategy: readOptionalStringField(
      value,
      "executionStrategy",
      "execution_strategy",
    ),
    messagesCount,
  }) as AppServerAgentSessionOverview;
}

function readAppServerAgentSessionListResponse(
  value: unknown,
): AppServerAgentSessionOverview[] | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    return null;
  }

  const sessions: AppServerAgentSessionOverview[] = [];
  for (const session of value.sessions) {
    const normalized = readAppServerAgentSessionOverview(session);
    if (!normalized) {
      return null;
    }
    sessions.push(normalized);
  }
  return sessions;
}

function readAppServerAgentSessionReadResponse(
  value: unknown,
): NormalizedAppServerAgentSessionReadResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const session = readAppServerAgentSession(value.session);
  if (!session || !Array.isArray(value.turns)) {
    return null;
  }

  const turns: AppServerAgentTurn[] = [];
  for (const turn of value.turns) {
    const normalized = readAppServerAgentTurn(turn);
    if (!normalized) {
      return null;
    }
    turns.push(normalized);
  }

  return {
    ...(value as Partial<NormalizedAppServerAgentSessionReadResponse>),
    session,
    turns,
    detail: value.detail,
  } as NormalizedAppServerAgentSessionReadResponse;
}

function readAppServerAgentTurn(value: unknown): AppServerAgentTurn | null {
  if (!isRecord(value)) {
    return null;
  }

  const turnId = readStringField(value, "turnId", "turn_id");
  const sessionId = readStringField(value, "sessionId", "session_id");
  const threadId = readStringField(value, "threadId", "thread_id");
  const status = readStringField(value, "status");
  if (
    !turnId ||
    !sessionId ||
    !threadId ||
    !isAppServerAgentTurnStatus(status)
  ) {
    return null;
  }

  return omitUndefined({
    ...(value as Partial<AppServerAgentTurn>),
    turnId,
    sessionId,
    threadId,
    status,
    startedAt: readOptionalStringField(value, "startedAt", "started_at"),
    completedAt: readOptionalStringField(value, "completedAt", "completed_at"),
  }) as AppServerAgentTurn;
}

function isAppServerAgentSessionStatus(value: unknown): boolean {
  return (
    value === "idle" ||
    value === "running" ||
    value === "waitingAction" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

function isAppServerAgentTurnStatus(value: unknown): boolean {
  return (
    value === "accepted" ||
    value === "queued" ||
    value === "running" ||
    value === "waitingAction" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

function sessionBusinessObjectRef({
  scopeId,
  name,
  executionStrategy,
  runStartHooks,
  workingDir,
  metadata,
}: {
  scopeId: string;
  name: string;
  executionStrategy?: AsterExecutionStrategy;
  runStartHooks?: boolean;
  workingDir?: string | null;
  metadata?: Record<string, unknown>;
}): AppServerBusinessObjectRef {
  const normalizedWorkingDir = normalizeCwd(workingDir ?? undefined);
  return {
    kind: "agent.session",
    id: `agent-session:${scopeId}:${Date.now()}`,
    title: name,
    metadata: {
      ...metadata,
      title: name,
      ...(normalizedWorkingDir
        ? {
            workingDir: normalizedWorkingDir,
            working_dir: normalizedWorkingDir,
          }
        : {}),
      executionStrategy,
      ...(runStartHooks === false ? { runStartHooks: false } : {}),
    },
  };
}

function normalizeCreateSessionScope(
  workspaceId: string | undefined,
  options?: AgentRuntimeCreateSessionOptions,
): { workspaceId?: string; workingDir?: string; scopeId: string } {
  const normalizedWorkingDir = normalizeCwd(options?.workingDir ?? undefined);
  const normalizedWorkspaceId = workspaceId?.trim() || undefined;
  if (normalizedWorkingDir) {
    return {
      workspaceId: normalizedWorkspaceId,
      workingDir: normalizedWorkingDir,
      scopeId: normalizedWorkingDir,
    };
  }
  if (normalizedWorkspaceId) {
    return {
      workspaceId: normalizedWorkspaceId,
      scopeId: normalizedWorkspaceId,
    };
  }
  return {
    scopeId: "detached",
  };
}

function appServerSessionListParamsFromOptions(
  options?: AgentRuntimeListSessionsOptions,
): AppServerAgentSessionListParams {
  const cwd = normalizeCwdFilter(options?.cwd);
  const workspaceId = options?.workspaceId?.trim();
  const limit =
    typeof options?.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit >= 0
      ? Math.trunc(options.limit)
      : undefined;
  return omitUndefined({
    includeArchived: options?.includeArchived === true ? true : undefined,
    archivedOnly: options?.archivedOnly === true ? true : undefined,
    cwd,
    workspaceId: cwd ? undefined : workspaceId || undefined,
    limit,
  });
}

function normalizeCwdFilter(cwd: string | string[] | undefined) {
  if (Array.isArray(cwd)) {
    const normalized = cwd
      .map((value) => normalizeCwd(value))
      .filter((value): value is string => Boolean(value));
    return normalized.length > 0 ? normalized : undefined;
  }
  return normalizeCwd(cwd);
}

function normalizeCwd(cwd: string | undefined) {
  const value = cwd?.trim();
  if (!value) {
    return undefined;
  }
  const trimmed = value.replace(/[\\/]+$/u, "");
  return trimmed || value;
}

function appServerSessionReadParamsFromOptions(
  sessionId: string,
  options?: AgentRuntimeGetSessionOptions,
): AppServerAgentSessionReadParams &
  Pick<
    AgentRuntimeGetSessionOptions,
    "historyLimit" | "historyOffset" | "historyBeforeMessageId"
  > {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("sessionId is required to read App Server session");
  }

  return omitUndefined({
    sessionId: normalizedSessionId,
    historyLimit: nonNegativeInteger(options?.historyLimit),
    historyOffset: nonNegativeInteger(options?.historyOffset),
    historyBeforeMessageId: positiveInteger(options?.historyBeforeMessageId),
  });
}

function appServerSessionUpdateParamsFromRequest(
  request: AgentRuntimeUpdateSessionRequest,
): AppServerAgentSessionUpdateParams {
  const sessionId = request.session_id.trim();
  if (!sessionId) {
    throw new Error("sessionId is required to update App Server session");
  }

  return omitUndefined({
    sessionId,
    title: request.name?.trim() || undefined,
    archived:
      typeof request.archived === "boolean" ? request.archived : undefined,
    providerSelector: request.provider_selector?.trim() || undefined,
    providerName: request.provider_name?.trim() || undefined,
    modelName: request.model_name?.trim() || undefined,
    executionStrategy: request.execution_strategy,
    recentAccessMode: request.recent_access_mode,
    recentPreferences: request.recent_preferences,
    recentTeamSelection: request.recent_team_selection,
    productWorkspaceSelectedObjectRef:
      request.product_workspace_selected_object_ref ?? undefined,
  });
}

function normalizeSessionIds(sessionIds: string[]): string[] {
  const seen = new Set<string>();
  return sessionIds
    .map((sessionId) => sessionId.trim())
    .filter((sessionId) => {
      if (!sessionId || seen.has(sessionId)) {
        return false;
      }
      seen.add(sessionId);
      return true;
    });
}

function appServerSessionOverviewToRuntimeInfo(
  session: AppServerAgentSessionOverview,
): AsterSessionInfo {
  return omitUndefined({
    id: session.sessionId,
    thread_id: session.threadId ?? session.sessionId,
    name: session.title,
    created_at: timestampMillis(session.createdAt),
    updated_at: timestampMillis(session.updatedAt),
    archived_at: session.archivedAt
      ? timestampMillis(session.archivedAt)
      : session.archivedAt === null
        ? null
        : undefined,
    model: session.model,
    messages_count: session.messagesCount,
    execution_strategy: executionStrategyFromProtocol(
      session.executionStrategy,
    ),
    workspace_id: session.workspaceId,
    working_dir: session.workingDir,
  });
}

function appServerSessionReadToRuntimeDetail(
  response: AppServerAgentSessionReadResponse,
): AsterSessionDetail {
  const fallbackTimestamp = response.session.updatedAt;
  const title =
    sessionTitleFromBusinessObjectRef(response.session.businessObjectRef) ??
    response.session.sessionId;
  return {
    id: response.session.sessionId,
    thread_id: response.session.threadId,
    name: title,
    created_at: timestampMillis(response.session.createdAt),
    updated_at: timestampMillis(response.session.updatedAt),
    workspace_id: response.session.workspaceId,
    messages: [],
    turns: response.turns.map((turn) =>
      appServerTurnToRuntimeTurn(turn, fallbackTimestamp),
    ),
    items: [],
    queued_turns: [],
    thread_read: projectAppServerSessionReadToThreadReadModel(response),
    todo_items: [],
    child_subagent_sessions: [],
  };
}

function sessionTitleFromBusinessObjectRef(
  ref: AppServerBusinessObjectRef | undefined,
): string | undefined {
  const title = ref?.title?.trim();
  if (title) {
    return title;
  }

  const metadata =
    ref?.metadata &&
    typeof ref.metadata === "object" &&
    !Array.isArray(ref.metadata)
      ? (ref.metadata as Record<string, unknown>)
      : null;
  const metadataTitle =
    typeof metadata?.title === "string" ? metadata.title.trim() : "";
  return metadataTitle || undefined;
}

function appServerTurnToRuntimeTurn(
  turn: AppServerAgentTurn,
  fallbackTimestamp: string,
): AgentThreadTurn {
  const startedAt = turn.startedAt ?? fallbackTimestamp;
  const updatedAt = turn.completedAt ?? startedAt;
  return {
    id: turn.turnId,
    thread_id: turn.threadId,
    prompt_text: "",
    status: agentThreadTurnStatusFromAppServer(turn.status),
    started_at: startedAt,
    completed_at: turn.completedAt,
    created_at: startedAt,
    updated_at: updatedAt,
  };
}

function agentThreadTurnStatusFromAppServer(
  status: AppServerAgentTurn["status"],
): AgentThreadTurnStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "accepted":
    case "queued":
    case "running":
    case "waitingAction":
      return "running";
  }
}

function readSessionDetail(
  response: NormalizedAppServerAgentSessionReadResponse,
): AsterSessionDetail | null {
  if (!isRecord(response.detail)) {
    return null;
  }
  const detail = response.detail as Partial<AsterSessionDetail>;
  const fallback = appServerSessionReadToRuntimeDetail(response);
  const detailExecutionRuntime = isRecord(detail.execution_runtime)
    ? detail.execution_runtime
    : isRecord((detail as Record<string, unknown>).executionRuntime)
      ? ((detail as Record<string, unknown>)
          .executionRuntime as AsterSessionDetail["execution_runtime"])
      : detail.execution_runtime === null ||
          (detail as Record<string, unknown>).executionRuntime === null
        ? null
        : undefined;
  return {
    ...fallback,
    ...detail,
    id: typeof detail.id === "string" ? detail.id : fallback.id,
    thread_id:
      typeof detail.thread_id === "string"
        ? detail.thread_id
        : fallback.thread_id,
    name: typeof detail.name === "string" ? detail.name : fallback.name,
    created_at:
      typeof detail.created_at === "number" &&
      Number.isFinite(detail.created_at)
        ? detail.created_at
        : fallback.created_at,
    updated_at:
      typeof detail.updated_at === "number" &&
      Number.isFinite(detail.updated_at)
        ? detail.updated_at
        : fallback.updated_at,
    workspace_id:
      typeof detail.workspace_id === "string"
        ? detail.workspace_id
        : fallback.workspace_id,
    messages: Array.isArray(detail.messages)
      ? detail.messages
      : fallback.messages,
    turns: Array.isArray(detail.turns) ? detail.turns : fallback.turns,
    items: Array.isArray(detail.items) ? detail.items : fallback.items,
    queued_turns: Array.isArray(detail.queued_turns)
      ? detail.queued_turns
      : fallback.queued_turns,
    thread_read: fallback.thread_read,
    execution_runtime:
      detailExecutionRuntime === undefined
        ? fallback.execution_runtime
        : detailExecutionRuntime,
    todo_items: Array.isArray(detail.todo_items)
      ? detail.todo_items
      : fallback.todo_items,
    child_subagent_sessions: Array.isArray(detail.child_subagent_sessions)
      ? detail.child_subagent_sessions
      : fallback.child_subagent_sessions,
  };
}

function timestampMillis(value: string | undefined): number {
  if (!value) {
    return Date.now();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

function executionStrategyFromProtocol(
  value: unknown,
): AsterExecutionStrategy | undefined {
  return value === "react" ? "react" : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export type AppServerSessionClient = ReturnType<
  typeof createAppServerSessionClient
>;
