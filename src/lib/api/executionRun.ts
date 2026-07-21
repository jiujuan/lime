import {
  createAppServerClient,
  type AppServerAgentSession,
  type AppServerAgentSessionListResponse,
  type AppServerAgentSessionReadResponse,
  type AppServerAgentTurn,
} from "@/lib/api/appServer";

export type AgentRunSource = "chat" | "skill" | "automation";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "canceled"
  | "timeout";

export interface AgentRun {
  id: string;
  source: AgentRunSource;
  source_ref: string | null;
  session_id: string | null;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneralWorkbenchRunTodoItem {
  run_id: string;
  execution_id?: string | null;
  session_id?: string | null;
  artifact_paths?: string[];
  title: string;
  gate_key?: "topic_select" | "write_mode" | "publish_confirm" | null;
  status: AgentRunStatus;
  source: AgentRunSource | string;
  source_ref: string | null;
  started_at: string;
}

export interface GeneralWorkbenchRunTerminalItem {
  run_id: string;
  execution_id?: string | null;
  session_id?: string | null;
  artifact_paths?: string[];
  title: string;
  gate_key?: "topic_select" | "write_mode" | "publish_confirm" | null;
  status: AgentRunStatus;
  source: AgentRunSource | string;
  source_ref: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface GeneralWorkbenchRunState {
  run_state: "idle" | "auto_running";
  current_gate_key?:
    | "idle"
    | "topic_select"
    | "write_mode"
    | "publish_confirm"
    | null;
  queue_items: GeneralWorkbenchRunTodoItem[];
  latest_terminal: GeneralWorkbenchRunTerminalItem | null;
  recent_terminals?: GeneralWorkbenchRunTerminalItem[] | null;
  updated_at: string;
}

export interface GeneralWorkbenchRunHistoryPage {
  items: GeneralWorkbenchRunTerminalItem[];
  has_more: boolean;
  next_offset: number | null;
}

function rejectRetiredExecutionRunCommand(command: string): never {
  throw new Error(
    `${command} is retired until execution run read models move to App Server current methods`,
  );
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function safeLimit(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

function safeOffset(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAppServerThreadListResponse(
  value: unknown,
): AppServerAgentSessionListResponse {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error("thread/list did not return thread list");
  }
  const sessions = value.data.map((thread) => threadOverviewToSession(thread));
  if (sessions.some((session) => !session)) {
    throw new Error("thread/list did not return canonical thread summaries");
  }
  return {
    sessions: sessions as AppServerAgentSessionListResponse["sessions"],
  };
}

function normalizeAppServerThreadReadResponse(
  value: unknown,
): AppServerAgentSessionReadResponse {
  if (!isRecord(value) || !isRecord(value.thread)) {
    throw new Error("thread/read did not return thread read model");
  }
  const thread = value.thread;
  const session = threadToSession(thread);
  const turns = threadTurnsToAgentTurns(thread);
  if (!session || !turns) {
    throw new Error("thread/read did not return canonical thread detail");
  }
  return {
    session,
    turns,
    detail: {
      threadRead: thread,
      title: thread.name,
    },
  };
}

function threadOverviewToSession(
  value: unknown,
): AppServerAgentSessionListResponse["sessions"][number] | null {
  const thread = asCurrentThread(value);
  if (!thread) {
    return null;
  }
  const turns = threadTurnsToAgentTurns(thread) ?? [];
  return {
    sessionId: thread.sessionId,
    threadId: thread.threadId,
    title: thread.name,
    model: thread.modelProvider,
    createdAt: timestampFromUnixSeconds(thread.createdAt),
    updatedAt: timestampFromUnixSeconds(thread.updatedAt),
    archivedAt: undefined,
    workspaceId: undefined,
    workingDir: thread.cwd,
    executionStrategy: undefined,
    messagesCount: countThreadItems(thread.turns),
    threadStatus: currentThreadStatus(thread.status),
    latestTurnStatus: turns.at(-1)?.status,
    activeTurnId: turns.find((turn) => !isTerminalAgentTurn(turn.status))
      ?.turnId,
    queuedTurnCount: 0,
  };
}

function threadToSession(value: unknown): AppServerAgentSession | null {
  const thread = asCurrentThread(value);
  if (!thread) {
    return null;
  }
  return {
    sessionId: thread.sessionId,
    threadId: thread.threadId,
    appId: "desktop",
    status: currentThreadStatus(thread.status),
    createdAt: timestampFromUnixSeconds(thread.createdAt),
    updatedAt: timestampFromUnixSeconds(thread.updatedAt),
  };
}

function threadTurnsToAgentTurns(value: unknown): AppServerAgentTurn[] | null {
  const thread = asCurrentThread(value);
  if (!thread) {
    return null;
  }
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const normalized = turns.map((turn) => {
    if (!isRecord(turn) || typeof turn.id !== "string") {
      return null;
    }
    const status = currentTurnStatus(turn);
    return {
      turnId: turn.id,
      sessionId: thread.sessionId,
      threadId: thread.threadId,
      status,
      startedAt: timestampFromOptionalUnixSeconds(turn.startedAt),
      completedAt: timestampFromOptionalUnixSeconds(turn.completedAt),
    } satisfies AppServerAgentTurn;
  });
  return normalized.some((turn) => !turn)
    ? null
    : (normalized as AppServerAgentTurn[]);
}

type CurrentThread = {
  sessionId: string;
  threadId: string;
  status: unknown;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  modelProvider: string;
  name?: string;
  preview?: string;
  turns?: unknown[];
};

function asCurrentThread(value: unknown): CurrentThread | null {
  if (!isRecord(value)) {
    return null;
  }
  const sessionId = normalizeString(value.sessionId);
  const threadId = normalizeString(value.id);
  const createdAt = finiteNumber(value.createdAt);
  const updatedAt = finiteNumber(value.updatedAt);
  const cwd = normalizeString(value.cwd) ?? "";
  const modelProvider = normalizeString(value.modelProvider) ?? "";
  if (!sessionId || !threadId || createdAt === null || updatedAt === null) {
    return null;
  }
  return {
    sessionId,
    threadId,
    status: value.status,
    createdAt,
    updatedAt,
    cwd,
    modelProvider,
    name:
      normalizeString(value.name) ??
      normalizeString(value.preview) ??
      undefined,
    turns: Array.isArray(value.turns) ? value.turns : [],
  };
}

function currentThreadStatus(value: unknown): AppServerAgentSession["status"] {
  const type = isRecord(value)
    ? normalizeString(value.type)
    : normalizeString(value);
  switch (type) {
    case "active":
      return "running";
    case "systemError":
      return "failed";
    case "idle":
    case "notLoaded":
    default:
      return "idle";
  }
}

function currentTurnStatus(
  value: Record<string, unknown>,
): AppServerAgentTurn["status"] {
  const status = normalizeString(value.status);
  switch (status) {
    case "inProgress":
      return "running";
    case "completed":
      return "completed";
    case "interrupted":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "accepted";
  }
}

function isTerminalAgentTurn(status: AppServerAgentTurn["status"]): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function countThreadItems(turns: unknown[] | undefined): number {
  return (turns ?? []).reduce<number>((count, turn) => {
    if (!isRecord(turn) || !Array.isArray(turn.items)) {
      return count;
    }
    return count + turn.items.length;
  }, 0);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timestampFromUnixSeconds(value: number): string {
  return new Date(value * 1000).toISOString();
}

function timestampFromOptionalUnixSeconds(value: unknown): string | undefined {
  const number = finiteNumber(value);
  return number === null ? undefined : timestampFromUnixSeconds(number);
}

function statusFromSessionStatus(
  status: AppServerAgentSession["status"],
): AgentRunStatus {
  switch (status) {
    case "running":
    case "waitingAction":
      return "running";
    case "completed":
    case "idle":
      return "success";
    case "failed":
      return "error";
    case "canceled":
      return "canceled";
  }
}

function statusFromTurnStatus(
  status: AppServerAgentTurn["status"],
): AgentRunStatus {
  switch (status) {
    case "accepted":
    case "queued":
      return "queued";
    case "running":
    case "waitingAction":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "canceled":
      return "canceled";
  }
}

function isTerminalStatus(status: AgentRunStatus): boolean {
  return (
    status === "success" ||
    status === "error" ||
    status === "canceled" ||
    status === "timeout"
  );
}

function durationMs(
  startedAt: string,
  finishedAt: string | null,
): number | null {
  if (!finishedAt) {
    return null;
  }
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    return null;
  }
  return Math.max(0, finished - started);
}

function metadataFromValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function readDetail(
  response: AppServerAgentSessionReadResponse,
): Record<string, unknown> | null {
  return isRecord(response.detail) ? response.detail : null;
}

function readDetailThreadRead(
  response: AppServerAgentSessionReadResponse,
): Record<string, unknown> | null {
  const detail = readDetail(response);
  const threadRead = detail?.thread_read ?? detail?.threadRead;
  return isRecord(threadRead) ? threadRead : null;
}

function readArrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function latestStartedAt(turn: AppServerAgentTurn, fallback: string): string {
  return turn.startedAt || fallback;
}

function appServerSessionOverviewToAgentRun(
  session: AppServerAgentSessionListResponse["sessions"][number],
): AgentRun {
  const status: AgentRunStatus = session.archivedAt ? "canceled" : "success";
  return {
    id: session.sessionId,
    source: "chat",
    source_ref: session.title ?? null,
    session_id: session.sessionId,
    status,
    started_at: session.createdAt,
    finished_at: isTerminalStatus(status) ? session.updatedAt : null,
    duration_ms: durationMs(session.createdAt, session.updatedAt),
    error_code: null,
    error_message: null,
    metadata: metadataFromValue({
      source: "thread/list",
      title: session.title ?? null,
      model: session.model,
      thread_id: session.threadId ?? null,
      workspace_id: session.workspaceId ?? null,
      working_dir: session.workingDir ?? null,
      execution_strategy: session.executionStrategy ?? null,
      messages_count: session.messagesCount,
      archived_at: session.archivedAt ?? null,
    }),
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

function appServerReadResponseToAgentRun(
  response: AppServerAgentSessionReadResponse,
): AgentRun {
  const detail = readDetail(response);
  const title =
    typeof detail?.title === "string"
      ? detail.title
      : (response.session.businessObjectRef?.title ?? null);
  const status = statusFromSessionStatus(response.session.status);
  const latestTurn = [...response.turns].reverse()[0] ?? null;
  const startedAt =
    latestTurn?.startedAt ??
    response.session.createdAt ??
    response.session.updatedAt;
  const finishedAt =
    latestTurn?.completedAt ??
    (isTerminalStatus(status) ? response.session.updatedAt : null);

  return {
    id: response.session.sessionId,
    source: "chat",
    source_ref: title,
    session_id: response.session.sessionId,
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs(startedAt, finishedAt),
    error_code: status === "error" ? "agent_session_failed" : null,
    error_message: null,
    metadata: metadataFromValue({
      source: "thread/read",
      title,
      thread_id: response.session.threadId,
      workspace_id: response.session.workspaceId ?? null,
      business_object_ref: response.session.businessObjectRef ?? null,
      detail,
    }),
    created_at: response.session.createdAt,
    updated_at: response.session.updatedAt,
  };
}

function deriveTerminalRunsFromReadResponse(
  response: AppServerAgentSessionReadResponse,
): GeneralWorkbenchRunTerminalItem[] {
  const threadRead = readDetailThreadRead(response);
  const detailRuns = readArrayField(
    threadRead?.execution_runs ??
      threadRead?.executionRuns ??
      readDetail(response)?.execution_runs ??
      readDetail(response)?.executionRuns,
  )
    .map(normalizeTerminalItem)
    .filter((item): item is GeneralWorkbenchRunTerminalItem => Boolean(item))
    .filter((item) => isTerminalStatus(item.status));
  if (detailRuns.length > 0) {
    return detailRuns;
  }

  return response.turns
    .filter((turn) => isTerminalStatus(statusFromTurnStatus(turn.status)))
    .map((turn) => terminalItemFromTurn(response.session, turn))
    .reverse();
}

function deriveQueueItemsFromReadResponse(
  response: AppServerAgentSessionReadResponse,
  limit: number,
): GeneralWorkbenchRunTodoItem[] {
  const threadRead = readDetailThreadRead(response);
  const detailRuns = readArrayField(
    threadRead?.execution_runs ??
      threadRead?.executionRuns ??
      readDetail(response)?.execution_runs ??
      readDetail(response)?.executionRuns,
  )
    .map(normalizeTodoItem)
    .filter((item): item is GeneralWorkbenchRunTodoItem => Boolean(item))
    .filter((item) => !isTerminalStatus(item.status));
  if (detailRuns.length > 0) {
    return detailRuns.slice(0, limit);
  }

  return response.turns
    .filter((turn) => !isTerminalStatus(statusFromTurnStatus(turn.status)))
    .map((turn) => todoItemFromTurn(response.session, turn))
    .slice(0, limit);
}

function currentGateKeyFromQueueItems(
  items: GeneralWorkbenchRunTodoItem[],
): GeneralWorkbenchRunState["current_gate_key"] {
  return (
    items.find((item) => item.status === "running")?.gate_key ??
    items[0]?.gate_key ??
    "idle"
  );
}

function defaultRunTitle(session: AppServerAgentSession): string {
  return session.businessObjectRef?.title ?? "执行工作区编排";
}

function todoItemFromTurn(
  session: AppServerAgentSession,
  turn: AppServerAgentTurn,
): GeneralWorkbenchRunTodoItem {
  return {
    run_id: session.sessionId,
    execution_id: turn.turnId,
    session_id: session.sessionId,
    artifact_paths: [],
    title: defaultRunTitle(session),
    gate_key: "write_mode",
    status: statusFromTurnStatus(turn.status),
    source: "chat",
    source_ref: session.businessObjectRef?.kind ?? null,
    started_at: latestStartedAt(turn, session.updatedAt),
  };
}

function terminalItemFromTurn(
  session: AppServerAgentSession,
  turn: AppServerAgentTurn,
): GeneralWorkbenchRunTerminalItem {
  return {
    ...todoItemFromTurn(session, turn),
    finished_at: turn.completedAt ?? session.updatedAt,
  };
}

function normalizeStatus(value: unknown): AgentRunStatus | null {
  if (
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "error" ||
    value === "canceled" ||
    value === "timeout"
  ) {
    return value;
  }
  return null;
}

function normalizeGateKey(
  value: unknown,
): GeneralWorkbenchRunTodoItem["gate_key"] {
  return value === "topic_select" ||
    value === "write_mode" ||
    value === "publish_confirm"
    ? value
    : null;
}

function normalizeString(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeArtifactPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeTodoItem(value: unknown): GeneralWorkbenchRunTodoItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const runId = normalizeString(value.run_id ?? value.runId);
  const title = normalizeString(value.title);
  const status = normalizeStatus(value.status);
  const startedAt = normalizeString(value.started_at ?? value.startedAt);
  if (!runId || !title || !status || !startedAt) {
    return null;
  }
  return {
    run_id: runId,
    execution_id: normalizeString(value.execution_id ?? value.executionId),
    session_id: normalizeString(value.session_id ?? value.sessionId),
    artifact_paths: normalizeArtifactPaths(
      value.artifact_paths ?? value.artifactPaths,
    ),
    title,
    gate_key: normalizeGateKey(value.gate_key ?? value.gateKey),
    status,
    source: normalizeString(value.source) ?? "chat",
    source_ref: normalizeString(value.source_ref ?? value.sourceRef),
    started_at: startedAt,
  };
}

function normalizeTerminalItem(
  value: unknown,
): GeneralWorkbenchRunTerminalItem | null {
  const item = normalizeTodoItem(value);
  if (!item) {
    return null;
  }
  return {
    ...item,
    finished_at: normalizeString(
      isRecord(value) ? (value.finished_at ?? value.finishedAt) : null,
    ),
  };
}

export async function executionRunList(
  limit: number = 50,
  offset: number = 0,
): Promise<AgentRun[]> {
  const safeRequestLimit = safeLimit(limit, 50, 200);
  const safeRequestOffset = safeOffset(offset);
  const response = await createAppServerClient().listThreads({
    archived: true,
    limit: safeRequestLimit + safeRequestOffset,
  });
  const threadList = normalizeAppServerThreadListResponse(response.result);
  return threadList.sessions
    .map(appServerSessionOverviewToAgentRun)
    .slice(safeRequestOffset, safeRequestOffset + safeRequestLimit);
}

export async function executionRunGet(runId: string): Promise<AgentRun | null> {
  const sessionId = requireNonEmptyText(runId, "runId");
  try {
    const response = await createAppServerClient().readThread({
      threadId: sessionId,
      includeTurns: true,
    });
    const threadRead = normalizeAppServerThreadReadResponse(response.result);
    return appServerReadResponseToAgentRun(threadRead);
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function executionRunGetGeneralWorkbenchState(
  sessionId: string,
  limit: number = 3,
): Promise<GeneralWorkbenchRunState> {
  const normalizedSessionId = requireNonEmptyText(sessionId, "sessionId");
  const safeRequestLimit = safeLimit(limit, 3, 10);
  const response = await createAppServerClient().readThread({
    threadId: normalizedSessionId,
    includeTurns: true,
  });
  const threadRead = normalizeAppServerThreadReadResponse(response.result);
  const queueItems = deriveQueueItemsFromReadResponse(
    threadRead,
    safeRequestLimit,
  );
  const recentTerminals = deriveTerminalRunsFromReadResponse(threadRead).slice(
    0,
    safeRequestLimit,
  );
  return {
    run_state: queueItems.length > 0 ? "auto_running" : "idle",
    current_gate_key: currentGateKeyFromQueueItems(queueItems),
    queue_items: queueItems,
    latest_terminal: recentTerminals[0] ?? null,
    recent_terminals: recentTerminals,
    updated_at: threadRead.session.updatedAt,
  };
}

export async function executionRunListGeneralWorkbenchHistory(
  sessionId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<GeneralWorkbenchRunHistoryPage> {
  const normalizedSessionId = requireNonEmptyText(sessionId, "sessionId");
  const safeRequestLimit = safeLimit(limit, 20, 100);
  const safeRequestOffset = safeOffset(offset);
  const response = await createAppServerClient().readThread({
    threadId: normalizedSessionId,
    includeTurns: true,
  });
  const threadRead = normalizeAppServerThreadReadResponse(response.result);
  const items = deriveTerminalRunsFromReadResponse(threadRead);
  const pageItems = items.slice(
    safeRequestOffset,
    safeRequestOffset + safeRequestLimit,
  );
  const hasMore = safeRequestOffset + safeRequestLimit < items.length;
  return {
    items: pageItems,
    has_more: hasMore,
    next_offset: hasMore ? safeRequestOffset + safeRequestLimit : null,
  };
}

export function rejectRetiredExecutionRunCommandForTest(
  command: string,
): never {
  return rejectRetiredExecutionRunCommand(command);
}
