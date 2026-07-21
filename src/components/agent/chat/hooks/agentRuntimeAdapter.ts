import type { UnlistenFn } from "@/lib/desktop-host/event";
import {
  createAgentSessionTurnStartParamsFromUserInputOp,
  type AgentEvent,
  type AgentOp,
} from "@/lib/api/agentProtocol";
import {
  listenAgentRuntimeEvent,
  type AgentRuntimeEventListener,
} from "@/lib/api/agentRuntimeEvents";
import type { AgentExecutionStrategy } from "@/lib/api/agentExecutionRuntime";
import type {
  TurnSteerParams,
  TurnSteerResponse,
} from "@limecloud/app-server-client";
import {
  createAgentRuntimeClient,
  type AgentRuntimeClient,
} from "@/lib/api/agentRuntime/clientFactory";
import type {
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeReplayedActionRequiredView,
} from "@/lib/api/agentRuntime/requestTypes";
import type {
  AgentRuntimeListSessionsOptions,
  AgentSessionDetail,
  AgentSessionInfo,
  RuntimeProviderSelection,
} from "@/lib/api/agentRuntime/sessionTypes";
import type { AgentAccessMode } from "./agentChatStorage";
import type { ActionRequiredScope, ApprovalDecision } from "../types";
import {
  projectChatRuntimeQueueControl,
  type ChatRuntimeQueueControlProjection,
} from "../projection/chatRuntimeQueueControlProjection";

export interface AgentRuntimeActionResponse {
  sessionId: string;
  requestId: string;
  actionType: "tool_confirmation" | "ask_user" | "elicitation";
  confirmed?: boolean;
  decision?: ApprovalDecision;
  response?: string;
  userData?: unknown;
  metadata?: Record<string, unknown>;
  eventName?: string;
  actionScope?: ActionRequiredScope;
}

export interface AgentSessionMetadataPatch {
  accessMode?: AgentAccessMode;
  providerType?: string;
  model?: string;
  executionStrategy?: AgentExecutionStrategy;
}

export interface AgentRuntimeAdapter {
  getRuntimeProviderSelection(): Promise<RuntimeProviderSelection>;
  createSession(
    workspaceId?: string,
    name?: string,
    executionStrategy?: AgentExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ): Promise<string>;
  listSessions(
    options?: AgentRuntimeListSessionsOptions,
  ): Promise<AgentSessionInfo[]>;
  getSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AgentSessionDetail>;
  getSessionReadModel(
    sessionId: string,
  ): Promise<AgentSessionDetail["thread_read"]>;
  getThreadTurnControl(
    threadId: string,
  ): Promise<ChatRuntimeQueueControlProjection>;
  replayRequest(
    sessionId: string,
    requestId: string,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null>;
  renameSession(sessionId: string, title: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  setSessionExecutionStrategy(
    sessionId: string,
    executionStrategy: AgentExecutionStrategy,
  ): Promise<void>;
  setSessionAccessMode?(
    sessionId: string,
    accessMode: AgentAccessMode,
  ): Promise<void>;
  setSessionProviderSelection(
    sessionId: string,
    providerType: string,
    model: string,
  ): Promise<void>;
  updateSessionMetadata?(
    sessionId: string,
    patch: AgentSessionMetadataPatch,
  ): Promise<void>;
  generateSessionTitle?(
    sessionId: string,
    previewText?: string,
  ): Promise<string>;
  submitOp(op: AgentOp): Promise<void>;
  steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse>;
  compactSession(sessionId: string, eventName: string): Promise<void>;
  interruptTurn(
    sessionId: string,
    turnId?: string,
    eventName?: string,
  ): Promise<boolean>;
  resumeThread(threadId: string): Promise<boolean>;
  runUserShellCommand(
    threadId: string,
    command: string,
    eventName: string,
  ): Promise<void>;
  respondToAction(request: AgentRuntimeActionResponse): Promise<void>;
  listenToTurnEvents(
    eventName: string,
    handler: (event: { payload: AgentEvent | unknown }) => void,
  ): Promise<UnlistenFn>;
}

export interface AgentRuntimeAdapterDeps {
  client?: Pick<
    AgentRuntimeClient,
    | "compactAgentRuntimeSession"
    | "createAgentRuntimeSession"
    | "deleteAgentRuntimeSession"
    | "generateAgentRuntimeSessionTitle"
    | "getAgentRuntimeSession"
    | "getAgentRuntimeThreadRead"
    | "readAgentRuntimeThread"
    | "getRuntimeProviderSelection"
    | "interruptAgentRuntimeTurn"
    | "listAgentRuntimeSessions"
    | "replayAgentRuntimeRequest"
    | "resumeThread"
    | "respondAgentRuntimeAction"
    | "runUserShellCommand"
    | "steerAgentRuntimeTurn"
    | "submitAgentRuntimeTurn"
    | "updateAgentRuntimeSession"
  >;
  listenRuntimeEvent?: AgentRuntimeEventListener;
}

function buildGetSessionRequestKey(
  sessionId: string,
  options?: AgentRuntimeGetSessionOptions,
): string {
  return JSON.stringify({
    sessionId,
    historyBeforeMessageId: options?.historyBeforeMessageId ?? null,
    historyLimit: options?.historyLimit ?? null,
    historyOffset: options?.historyOffset ?? null,
    resumeSessionStartHooks: options?.resumeSessionStartHooks === true,
  });
}

export function createAgentRuntimeAdapter({
  client = createAgentRuntimeClient(),
  listenRuntimeEvent = listenAgentRuntimeEvent,
}: AgentRuntimeAdapterDeps = {}): AgentRuntimeAdapter {
  const getSessionInFlight = new Map<string, Promise<AgentSessionDetail>>();

  return {
    async getRuntimeProviderSelection() {
      return client.getRuntimeProviderSelection();
    },
    async createSession(workspaceId, name, executionStrategy, options) {
      return client.createAgentRuntimeSession(
        workspaceId,
        name,
        executionStrategy,
        options,
      );
    },
    async listSessions(options) {
      return client.listAgentRuntimeSessions(options);
    },
    async getSession(sessionId, options) {
      const key = buildGetSessionRequestKey(sessionId, options);
      const existing = getSessionInFlight.get(key);
      if (existing) {
        return existing;
      }

      const request = client
        .getAgentRuntimeSession(sessionId, options)
        .finally(() => {
          if (getSessionInFlight.get(key) === request) {
            getSessionInFlight.delete(key);
          }
        });
      getSessionInFlight.set(key, request);
      return request;
    },
    async getSessionReadModel(sessionId) {
      const detail = await client.getAgentRuntimeSession(sessionId);
      const threadId = detail.thread_id?.trim();
      if (!threadId) {
        throw new Error(
          "canonical session detail did not include a thread_id for thread/read",
        );
      }
      return client.getAgentRuntimeThreadRead(threadId);
    },
    async getThreadTurnControl(threadId) {
      const result = projectChatRuntimeQueueControl(
        await client.readAgentRuntimeThread(threadId),
      );
      if (!result.ok) {
        throw new Error(
          `canonical turn-control projection rejected: ${result.reason}`,
        );
      }
      if (result.projection.threadId !== threadId.trim()) {
        throw new Error("canonical turn-control thread identity mismatch");
      }
      return result.projection;
    },
    async replayRequest(sessionId, requestId) {
      return client.replayAgentRuntimeRequest({
        session_id: sessionId,
        request_id: requestId,
      });
    },
    async renameSession(sessionId, title) {
      await client.updateAgentRuntimeSession({
        session_id: sessionId,
        name: title,
      });
    },
    async deleteSession(sessionId) {
      await client.deleteAgentRuntimeSession(sessionId);
    },
    async setSessionExecutionStrategy(sessionId, executionStrategy) {
      await client.updateAgentRuntimeSession({
        session_id: sessionId,
        execution_strategy: executionStrategy,
      });
    },
    async setSessionAccessMode(sessionId, accessMode) {
      await client.updateAgentRuntimeSession({
        session_id: sessionId,
        recent_access_mode: accessMode,
      });
    },
    async setSessionProviderSelection(sessionId, providerType, model) {
      await client.updateAgentRuntimeSession({
        session_id: sessionId,
        provider_selector: providerType,
        model_name: model,
      });
    },
    async updateSessionMetadata(sessionId, patch) {
      const request: Parameters<
        AgentRuntimeClient["updateAgentRuntimeSession"]
      >[0] = {
        session_id: sessionId,
      };
      if (patch.accessMode) {
        request.recent_access_mode = patch.accessMode;
      }
      if (patch.providerType) {
        request.provider_selector = patch.providerType;
      }
      if (patch.model) {
        request.model_name = patch.model;
      }
      if (patch.executionStrategy) {
        request.execution_strategy = patch.executionStrategy;
      }
      await client.updateAgentRuntimeSession(request);
    },
    async generateSessionTitle(sessionId, previewText) {
      return client.generateAgentRuntimeSessionTitle(sessionId, previewText);
    },
    async submitOp(op) {
      switch (op.type) {
        case "user_input":
          await client.submitAgentRuntimeTurn(
            createAgentSessionTurnStartParamsFromUserInputOp(op),
          );
          return;
        default:
          throw new Error(`当前 runtime adapter 尚不支持 AgentOp: ${op.type}`);
      }
    },
    async steerTurn(params) {
      const response = await client.steerAgentRuntimeTurn(params);
      return response.result;
    },
    async compactSession(sessionId, eventName) {
      await client.compactAgentRuntimeSession({
        session_id: sessionId,
        event_name: eventName,
      });
    },
    async interruptTurn(sessionId, turnId, eventName) {
      return client.interruptAgentRuntimeTurn({
        session_id: sessionId,
        ...(turnId ? { turn_id: turnId } : {}),
        ...(eventName ? { event_name: eventName } : {}),
      });
    },
    async resumeThread(threadId) {
      const normalizedThreadId = threadId.trim();
      const response = await client.resumeThread({
        threadId: normalizedThreadId,
      });
      return response.result.thread.id === normalizedThreadId;
    },
    async runUserShellCommand(threadId, command, eventName) {
      await client.runUserShellCommand({ threadId, command }, eventName);
    },
    async respondToAction(request) {
      await client.respondAgentRuntimeAction({
        session_id: request.sessionId,
        request_id: request.requestId,
        action_type: request.actionType,
        confirmed: request.confirmed,
        decision: request.decision,
        response: request.response,
        user_data: request.userData,
        metadata: request.metadata,
        ...(request.eventName ? { event_name: request.eventName } : {}),
        ...(request.actionScope
          ? {
              action_scope: {
                session_id: request.actionScope.sessionId,
                thread_id: request.actionScope.threadId,
                turn_id: request.actionScope.turnId,
              },
            }
          : {}),
      });
    },
    async listenToTurnEvents(eventName, handler) {
      return listenRuntimeEvent(eventName, handler);
    },
  };
}

export const defaultAgentRuntimeAdapter = createAgentRuntimeAdapter();
