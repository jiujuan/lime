import type { UnlistenFn } from "@/lib/desktop-host/event";
import {
  createSubmitTurnRequestFromAgentOp,
  type AgentEvent,
  type AgentOp,
} from "@/lib/api/agentProtocol";
import {
  listenAgentRuntimeEvent,
  type AgentRuntimeEventListener,
} from "@/lib/api/agentRuntimeEvents";
import {
  createAgentRuntimeClient,
  type AgentRuntimeCreateSessionOptions,
  type AgentRuntimeGetSessionOptions,
  type AgentRuntimeListSessionsOptions,
  type AgentRuntimeReplayedActionRequiredView,
  type AgentRuntimeClient,
  type AgentRuntimeInitStatus,
  type AsterExecutionStrategy,
  type AsterSessionDetail,
  type AsterSessionInfo,
} from "@/lib/api/agentRuntime";
import type { AgentAccessMode } from "./agentChatStorage";
import type { ActionRequiredScope, ApprovalDecision } from "../types";

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
  executionStrategy?: AsterExecutionStrategy;
}

export interface AgentRuntimeAdapter {
  init(): Promise<AgentRuntimeInitStatus>;
  createSession(
    workspaceId?: string,
    name?: string,
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ): Promise<string>;
  listSessions(
    options?: AgentRuntimeListSessionsOptions,
  ): Promise<AsterSessionInfo[]>;
  getSession(
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ): Promise<AsterSessionDetail>;
  getSessionReadModel(
    sessionId: string,
  ): Promise<AsterSessionDetail["thread_read"]>;
  replayRequest(
    sessionId: string,
    requestId: string,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null>;
  renameSession(sessionId: string, title: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  setSessionExecutionStrategy(
    sessionId: string,
    executionStrategy: AsterExecutionStrategy,
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
  compactSession(sessionId: string, eventName: string): Promise<void>;
  interruptTurn(
    sessionId: string,
    turnId?: string,
    eventName?: string,
  ): Promise<boolean>;
  resumeThread(sessionId: string, turnId?: string): Promise<boolean>;
  promoteQueuedTurn(sessionId: string, queuedTurnId: string): Promise<boolean>;
  removeQueuedTurn(sessionId: string, queuedTurnId: string): Promise<boolean>;
  respondToAction(request: AgentRuntimeActionResponse): Promise<void>;
  listenToTurnEvents(
    eventName: string,
    handler: (event: { payload: AgentEvent | unknown }) => void,
  ): Promise<UnlistenFn>;
  listenToTeamEvents(
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
    | "initAgentRuntime"
    | "interruptAgentRuntimeTurn"
    | "listAgentRuntimeSessions"
    | "promoteAgentRuntimeQueuedTurn"
    | "replayAgentRuntimeRequest"
    | "removeAgentRuntimeQueuedTurn"
    | "resumeAgentRuntimeThread"
    | "respondAgentRuntimeAction"
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
  const getSessionInFlight = new Map<string, Promise<AsterSessionDetail>>();

  return {
    async init() {
      return client.initAgentRuntime();
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
      return client.getAgentRuntimeThreadRead(sessionId);
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
            createSubmitTurnRequestFromAgentOp(op),
          );
          return;
        default:
          throw new Error(`当前 runtime adapter 尚不支持 AgentOp: ${op.type}`);
      }
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
    async resumeThread(sessionId, turnId) {
      return client.resumeAgentRuntimeThread({
        session_id: sessionId,
        ...(turnId ? { turn_id: turnId } : {}),
      });
    },
    async promoteQueuedTurn(sessionId, queuedTurnId) {
      return client.promoteAgentRuntimeQueuedTurn({
        session_id: sessionId,
        queued_turn_id: queuedTurnId,
      });
    },
    async removeQueuedTurn(sessionId, queuedTurnId) {
      return client.removeAgentRuntimeQueuedTurn({
        session_id: sessionId,
        queued_turn_id: queuedTurnId,
      });
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
    async listenToTeamEvents(eventName, handler) {
      return listenRuntimeEvent(eventName, handler);
    },
  };
}

export const defaultAgentRuntimeAdapter = createAgentRuntimeAdapter();
