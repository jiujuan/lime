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
  "startSession" | "readSession" | "updateSession" | "request"
>;

export type AppServerAgentSessionListParams = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
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

export interface AppServerSessionClientDeps {
  appServerClient?: AppServerSessionRpcClient;
}

export function createAppServerSessionClient({
  appServerClient = new AppServerClient(),
}: AppServerSessionClientDeps = {}) {
  async function createAgentRuntimeSession(
    workspaceId: string,
    name?: string,
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ): Promise<string> {
    const normalizedWorkspaceId = requireWorkspaceId(workspaceId);
    const normalizedName = name?.trim() || "新对话";
    const response = await appServerClient.startSession({
      appId: DEFAULT_APP_ID,
      workspaceId: normalizedWorkspaceId,
      businessObjectRef: sessionBusinessObjectRef({
        workspaceId: normalizedWorkspaceId,
        name: normalizedName,
        executionStrategy,
        runStartHooks: options?.runStartHooks,
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
    assertAppServerAgentSessionListResponse(response.result);
    return response.result.sessions.map(appServerSessionOverviewToRuntimeInfo);
  }

  async function getAgentRuntimeSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AsterSessionDetail> {
    const response = await appServerClient.readSession(
      appServerSessionReadParamsFromOptions(sessionId, options),
    );
    assertAppServerAgentSessionReadResponse(response.result);
    return (
      readSessionDetail(response.result) ??
      appServerSessionReadToRuntimeDetail(response.result)
    );
  }

  async function updateAgentRuntimeSession(
    request: AgentRuntimeUpdateSessionRequest,
  ): Promise<void> {
    await appServerClient.updateSession(
      appServerSessionUpdateParamsFromRequest(request),
    );
  }

  return {
    createAgentRuntimeSession,
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

function assertAppServerAgentSessionListResponse(
  value: unknown,
): asserts value is AppServerAgentSessionListResponse {
  if (!isAppServerAgentSessionListResponse(value)) {
    throw new Error("agentSession/list did not return session list");
  }
}

function assertAppServerAgentSessionReadResponse(
  value: unknown,
): asserts value is AppServerAgentSessionReadResponse {
  if (!isAppServerAgentSessionReadResponse(value)) {
    throw new Error("agentSession/read did not return session detail");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAppServerAgentSession(value: unknown): value is AppServerAgentSession {
  return (
    isRecord(value) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.threadId) &&
    isNonEmptyString(value.appId) &&
    optionalString(value.workspaceId) &&
    isAppServerAgentSessionStatus(value.status) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isAppServerAgentSessionOverview(
  value: unknown,
): value is AppServerAgentSessionOverview {
  return (
    isRecord(value) &&
    isNonEmptyString(value.sessionId) &&
    optionalString(value.threadId) &&
    optionalString(value.title) &&
    isString(value.model) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (value.archivedAt === null || optionalString(value.archivedAt)) &&
    optionalString(value.workspaceId) &&
    optionalString(value.workingDir) &&
    optionalString(value.executionStrategy) &&
    isFiniteNumber(value.messagesCount)
  );
}

function isAppServerAgentSessionListResponse(
  value: unknown,
): value is AppServerAgentSessionListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isAppServerAgentSessionOverview)
  );
}

function isAppServerAgentSessionReadResponse(
  value: unknown,
): value is AppServerAgentSessionReadResponse {
  return (
    isRecord(value) &&
    isAppServerAgentSession(value.session) &&
    Array.isArray(value.turns) &&
    value.turns.every(isAppServerAgentTurn)
  );
}

function isAppServerAgentTurn(value: unknown): value is AppServerAgentTurn {
  return (
    isRecord(value) &&
    isNonEmptyString(value.turnId) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.threadId) &&
    isAppServerAgentTurnStatus(value.status) &&
    optionalString(value.startedAt) &&
    optionalString(value.completedAt)
  );
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return typeof value === "undefined" || typeof value === "string";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sessionBusinessObjectRef({
  workspaceId,
  name,
  executionStrategy,
  runStartHooks,
  metadata,
}: {
  workspaceId: string;
  name: string;
  executionStrategy?: AsterExecutionStrategy;
  runStartHooks?: boolean;
  metadata?: Record<string, unknown>;
}): AppServerBusinessObjectRef {
  return {
    kind: "agent.session",
    id: `agent-session:${workspaceId}:${Date.now()}`,
    title: name,
    metadata: {
      ...metadata,
      title: name,
      executionStrategy,
      ...(runStartHooks === false ? { runStartHooks: false } : {}),
    },
  };
}

function appServerSessionListParamsFromOptions(
  options?: AgentRuntimeListSessionsOptions,
): AppServerAgentSessionListParams {
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
    workspaceId: workspaceId || undefined,
    limit,
  });
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
  response: AppServerAgentSessionReadResponse & { detail?: unknown },
): AsterSessionDetail | null {
  const detail = response.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  return detail as AsterSessionDetail;
}

function requireWorkspaceId(workspaceId?: string): string {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedWorkspaceId) {
    throw new Error("workspaceId 不能为空，请先选择项目工作区");
  }
  return normalizedWorkspaceId;
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
