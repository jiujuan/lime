import { logAgentDebug } from "@/lib/agentDebug";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import { normalizeLegacyThreadItem } from "../agentTextNormalization";
import type { AgentThreadItem } from "../agentProtocol";
import { normalizeQueuedTurnSnapshots } from "../queuedTurn";
import {
  createAppServerSessionClient,
  type AppServerSessionClient,
  type AppServerSessionRpcClient,
} from "./appServerSessionClient";
import {
  normalizeSubagentParentContext,
  normalizeSubagentSessionInfo,
  normalizeThreadReadModel,
} from "./normalizers";
import type {
  AsterExecutionStrategy,
  AsterSessionDetail,
  AsterSessionInfo,
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeListSessionsOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeUpdateSessionRequest,
} from "./types";

function isTransientSessionReadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error || "Unknown error");
  const normalizedMessage = message.toLowerCase();

  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("Load failed") ||
    message.includes("ECONNREFUSED") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("aborterror")
  );
}

export interface AgentRuntimeSessionClientDeps {
  appServerClient?: AppServerSessionRpcClient;
  appServerSessionClient?: AppServerSessionClient;
}

export const AGENT_RUNTIME_SESSIONS_CHANGED_EVENT =
  "lime:agent-runtime-sessions-changed";

export interface AgentRuntimeSessionsChangedDetail {
  reason: "created" | "updated" | "archived" | "deleted" | "external";
  sessionId?: string;
  workspaceId?: string;
}

export function notifyAgentRuntimeSessionsChanged(
  detail: AgentRuntimeSessionsChangedDetail,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AGENT_RUNTIME_SESSIONS_CHANGED_EVENT, { detail }),
  );
}

export function createSessionClient({
  appServerClient,
  appServerSessionClient = createAppServerSessionClient({ appServerClient }),
}: AgentRuntimeSessionClientDeps = {}) {
  async function createAgentRuntimeSession(
    workspaceId: string,
    name?: string,
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ): Promise<string> {
    const sessionId = await appServerSessionClient.createAgentRuntimeSession(
      workspaceId,
      name,
      executionStrategy,
      options,
    );
    notifyAgentRuntimeSessionsChanged({
      reason: "created",
      sessionId,
      workspaceId,
    });
    return sessionId;
  }

  async function listAgentRuntimeSessions(
    options?: AgentRuntimeListSessionsOptions,
  ): Promise<AsterSessionInfo[]> {
    const startedAt = Date.now();
    let settled = false;
    const includeArchived = options?.includeArchived === true;
    const archivedOnly = options?.archivedOnly === true;
    const workspaceId = options?.workspaceId?.trim();
    const limit =
      typeof options?.limit === "number" &&
      Number.isFinite(options.limit) &&
      options.limit >= 0
        ? Math.trunc(options.limit)
        : undefined;
    const slowTimer: number | null =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            if (settled) {
              return;
            }

            logAgentDebug(
              "AgentApi",
              "runtimeListSessions.slow",
              {
                elapsedMs: Date.now() - startedAt,
              },
              {
                dedupeKey: "runtimeListSessions.slow",
                level: "info",
                throttleMs: 1000,
              },
            );
          }, 1000)
        : null;

    const listMetricContext = {
      archivedOnly,
      includeArchived,
      limit: limit ?? null,
      workspaceId: workspaceId ?? null,
    };
    recordAgentUiPerformanceMetric(
      "agentRuntime.listSessions.start",
      listMetricContext,
    );
    logAgentDebug("AgentApi", "runtimeListSessions.start", listMetricContext);

    try {
      const sessions = await appServerSessionClient.listAgentRuntimeSessions({
        includeArchived,
        archivedOnly,
        workspaceId,
        limit,
      });
      settled = true;
      recordAgentUiPerformanceMetric("agentRuntime.listSessions.success", {
        ...listMetricContext,
        durationMs: Date.now() - startedAt,
        sessionsCount: sessions.length,
      });
      logAgentDebug("AgentApi", "runtimeListSessions.success", {
        archivedOnly,
        durationMs: Date.now() - startedAt,
        limit,
        sessionsCount: sessions.length,
        includeArchived,
        workspaceId: workspaceId ?? null,
      });
      return sessions;
    } catch (error) {
      settled = true;
      recordAgentUiPerformanceMetric("agentRuntime.listSessions.error", {
        ...listMetricContext,
        durationMs: Date.now() - startedAt,
      });
      logAgentDebug(
        "AgentApi",
        "runtimeListSessions.error",
        {
          archivedOnly,
          durationMs: Date.now() - startedAt,
          error,
          limit,
          workspaceId: workspaceId ?? null,
        },
        { level: "warn" },
      );
      throw error;
    } finally {
      if (slowTimer !== null) {
        clearTimeout(slowTimer);
      }
    }
  }

  async function getAgentRuntimeSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AsterSessionDetail> {
    const startedAt = Date.now();
    let settled = false;
    const resumeSessionStartHooks = options?.resumeSessionStartHooks === true;
    const historyLimit =
      typeof options?.historyLimit === "number" &&
      Number.isFinite(options.historyLimit) &&
      options.historyLimit >= 0
        ? Math.trunc(options.historyLimit)
        : undefined;
    const historyOffset =
      typeof options?.historyOffset === "number" &&
      Number.isFinite(options.historyOffset) &&
      options.historyOffset >= 0
        ? Math.trunc(options.historyOffset)
        : undefined;
    const historyBeforeMessageId =
      typeof options?.historyBeforeMessageId === "number" &&
      Number.isFinite(options.historyBeforeMessageId) &&
      options.historyBeforeMessageId > 0
        ? Math.trunc(options.historyBeforeMessageId)
        : undefined;
    const slowTimer: number | null =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            if (settled) {
              return;
            }

            logAgentDebug(
              "AgentApi",
              "runtimeGetSession.slow",
              {
                elapsedMs: Date.now() - startedAt,
                historyLimit: historyLimit ?? null,
                historyOffset: historyOffset ?? null,
                historyBeforeMessageId: historyBeforeMessageId ?? null,
                resumeSessionStartHooks,
                sessionId,
              },
              {
                dedupeKey: `runtimeGetSession.slow:${sessionId}`,
                level: "info",
                throttleMs: 1000,
              },
            );
          }, 1000)
        : null;

    const getSessionMetricContext = {
      historyLimit: historyLimit ?? null,
      historyOffset: historyOffset ?? null,
      historyBeforeMessageId: historyBeforeMessageId ?? null,
      resumeSessionStartHooks,
      sessionId,
    };
    recordAgentUiPerformanceMetric(
      "agentRuntime.getSession.start",
      getSessionMetricContext,
    );
    logAgentDebug(
      "AgentApi",
      "runtimeGetSession.start",
      getSessionMetricContext,
    );

    try {
      const detail = await appServerSessionClient.getAgentRuntimeSession(
        sessionId,
        {
          ...(resumeSessionStartHooks ? { resumeSessionStartHooks: true } : {}),
          ...(typeof historyLimit === "number" ? { historyLimit } : {}),
          ...(typeof historyOffset === "number" ? { historyOffset } : {}),
          ...(typeof historyBeforeMessageId === "number"
            ? { historyBeforeMessageId }
            : {}),
        },
      );
      const normalizedDetail = detail as AsterSessionDetail | null | undefined;
      const normalizedSessionDetail: AsterSessionDetail = {
        ...(detail as AsterSessionDetail),
        messages: Array.isArray(normalizedDetail?.messages)
          ? normalizedDetail.messages
          : [],
        turns: Array.isArray(normalizedDetail?.turns)
          ? normalizedDetail.turns
          : [],
        items: Array.isArray(normalizedDetail?.items)
          ? normalizedDetail.items.map((item) =>
              normalizeLegacyThreadItem(item as AgentThreadItem),
            )
          : [],
        child_subagent_sessions: Array.isArray(
          normalizedDetail?.child_subagent_sessions,
        )
          ? normalizedDetail.child_subagent_sessions.map(
              normalizeSubagentSessionInfo,
            )
          : [],
        subagent_parent_context: normalizeSubagentParentContext(
          normalizedDetail?.subagent_parent_context,
        ),
        queued_turns: normalizeQueuedTurnSnapshots(
          normalizedDetail?.queued_turns,
        ),
        thread_read: normalizeThreadReadModel(normalizedDetail?.thread_read),
        todo_items: Array.isArray(normalizedDetail?.todo_items)
          ? normalizedDetail.todo_items
          : [],
      };
      settled = true;
      recordAgentUiPerformanceMetric("agentRuntime.getSession.success", {
        ...getSessionMetricContext,
        childSubagentSessionsCount:
          normalizedSessionDetail.child_subagent_sessions?.length ?? 0,
        durationMs: Date.now() - startedAt,
        itemsCount: normalizedSessionDetail.items?.length ?? 0,
        messagesCount: normalizedSessionDetail.messages?.length ?? 0,
        queuedTurnsCount: normalizedSessionDetail.queued_turns?.length ?? 0,
        turnsCount: normalizedSessionDetail.turns?.length ?? 0,
      });
      logAgentDebug("AgentApi", "runtimeGetSession.success", {
        childSubagentSessionsCount:
          normalizedSessionDetail.child_subagent_sessions?.length ?? 0,
        durationMs: Date.now() - startedAt,
        historyLimit: historyLimit ?? null,
        historyOffset: historyOffset ?? null,
        historyBeforeMessageId: historyBeforeMessageId ?? null,
        itemsCount: normalizedSessionDetail.items?.length ?? 0,
        messagesCount: normalizedSessionDetail.messages?.length ?? 0,
        queuedTurnsCount: normalizedSessionDetail.queued_turns?.length ?? 0,
        resumeSessionStartHooks,
        sessionId,
        turnsCount: normalizedSessionDetail.turns?.length ?? 0,
      });
      return normalizedSessionDetail;
    } catch (error) {
      settled = true;
      recordAgentUiPerformanceMetric("agentRuntime.getSession.error", {
        ...getSessionMetricContext,
        durationMs: Date.now() - startedAt,
      });
      logAgentDebug(
        "AgentApi",
        "runtimeGetSession.error",
        {
          durationMs: Date.now() - startedAt,
          error,
          historyLimit: historyLimit ?? null,
          historyOffset: historyOffset ?? null,
          historyBeforeMessageId: historyBeforeMessageId ?? null,
          resumeSessionStartHooks,
          sessionId,
        },
        { level: isTransientSessionReadError(error) ? "warn" : "error" },
      );
      throw error;
    } finally {
      if (slowTimer !== null) {
        clearTimeout(slowTimer);
      }
    }
  }

  async function updateAgentRuntimeSession(
    request: AgentRuntimeUpdateSessionRequest,
    notificationReason: AgentRuntimeSessionsChangedDetail["reason"] = "updated",
  ): Promise<void> {
    await appServerSessionClient.updateAgentRuntimeSession(request);
    notifyAgentRuntimeSessionsChanged({
      reason: notificationReason,
      sessionId: request.session_id,
    });
  }

  async function archiveManyAgentRuntimeSessions(
    sessionIds: string[],
  ): Promise<AsterSessionInfo[]> {
    const sessions =
      await appServerSessionClient.archiveManyAgentRuntimeSessions(sessionIds);
    notifyAgentRuntimeSessionsChanged({
      reason: "archived",
    });
    return sessions;
  }

  async function deleteAgentRuntimeSession(sessionId: string): Promise<void> {
    return await updateAgentRuntimeSession({
      session_id: sessionId,
      archived: true,
    }, "deleted");
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

export const {
  archiveManyAgentRuntimeSessions,
  createAgentRuntimeSession,
  deleteAgentRuntimeSession,
  getAgentRuntimeSession,
  listAgentRuntimeSessions,
  updateAgentRuntimeSession,
} = createSessionClient();
