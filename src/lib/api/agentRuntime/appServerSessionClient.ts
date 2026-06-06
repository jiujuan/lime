import {
  AppServerClient,
  type AppServerAgentTurn,
  type AppServerAgentSessionReadParams,
  type AppServerAgentSessionReadResponse,
  type AppServerBusinessObjectRef,
} from "@/lib/api/appServer";
import { METHOD_AGENT_SESSION_LIST } from "../../../../packages/app-server-client/src/protocol";
import type { AgentThreadTurn, AgentThreadTurnStatus } from "../agentProtocol";
import type {
  AsterExecutionStrategy,
  AsterSessionDetail,
  AsterSessionInfo,
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeListSessionsOptions,
} from "./types";

const DEFAULT_APP_ID = "desktop";

export type AppServerSessionRpcClient = Pick<
  AppServerClient,
  "startSession" | "readSession" | "request"
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
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  workspaceId?: string;
  workingDir?: string;
  executionStrategy?: string;
  messagesCount?: number;
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
    return response.result.sessions.map(appServerSessionOverviewToRuntimeInfo);
  }

  async function getAgentRuntimeSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AsterSessionDetail> {
    const response = await appServerClient.readSession(
      appServerSessionReadParamsFromOptions(sessionId, options),
    );
    return (
      readSessionDetail(response.result) ??
      appServerSessionReadToRuntimeDetail(response.result)
    );
  }

  return {
    createAgentRuntimeSession,
    getAgentRuntimeSession,
    listAgentRuntimeSessions,
  };
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
  return {
    id: response.session.sessionId,
    thread_id: response.session.threadId,
    name: response.session.sessionId,
    created_at: timestampMillis(response.session.createdAt),
    updated_at: timestampMillis(response.session.updatedAt),
    workspace_id: response.session.workspaceId,
    messages: [],
    turns: response.turns.map((turn) =>
      appServerTurnToRuntimeTurn(turn, fallbackTimestamp),
    ),
    items: [],
    queued_turns: [],
    thread_read: null,
    todo_items: [],
    child_subagent_sessions: [],
  };
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
      return "aborted";
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
