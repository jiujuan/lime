import {
  AppServerAgentRuntimeClient as BaseAppServerAgentRuntimeClient,
  type AgentRuntimeClient,
  type AgentRuntimeClientOptions as BaseAgentRuntimeClientOptions,
  type AgentRuntimeClientSubscription,
  type AgentRuntimeEventListener,
  type AgentSessionActionRespondParams,
  type AgentSessionActionRespondResponse,
  type AgentSessionEventNotification,
  type AgentSessionReadParams,
  type AgentSessionReadResponse,
  type AgentSessionToolInventoryReadParams,
  type AgentSessionToolInventoryReadResponse,
  type AgentSessionTurnCancelParams,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AppServerConnection,
  type AppServerRequestOptions,
  type AppServerRequestResult,
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type JsonRpcMessage,
  type StructuredOutputContract,
  agentSessionEventNotification,
} from "@limecloud/app-server-client";

export type { StructuredOutputContract };
import {
  AgentRuntimeEventPipeline,
  type AgentRuntimeEventPipelineResult,
  type AgentRuntimeEventAdapter,
  type AgentRuntimeEventPipelineMiddleware,
} from "./eventPipeline.js";
import type {
  AgentRuntimeSequenceVerifierLike,
  AgentRuntimeSequenceVerifierMode,
} from "./eventVerifier.js";

export interface AgentRuntimeClientOptions extends BaseAgentRuntimeClientOptions {
  sequenceVerifier?: AgentRuntimeSequenceVerifierLike;
  sequenceVerifierMode?: AgentRuntimeSequenceVerifierMode;
  adapters?: readonly AgentRuntimeEventAdapter[];
  middlewares?: readonly AgentRuntimeEventPipelineMiddleware[];
}

export class AppServerAgentRuntimeClient implements AgentRuntimeClient {
  readonly connection: AppServerConnection;
  readonly #base: BaseAppServerAgentRuntimeClient;
  readonly #listeners = new Set<AgentRuntimeEventListener>();
  readonly #eventPipeline: AgentRuntimeEventPipeline;
  readonly #pendingNextEvents: AgentSessionEventNotification[] = [];

  constructor(
    connection: AppServerConnection,
    options: AgentRuntimeClientOptions = {},
  ) {
    this.connection = connection;
    this.#base = new BaseAppServerAgentRuntimeClient(connection, {
      request: options.request,
    });
    this.#eventPipeline = new AgentRuntimeEventPipeline({
      sequenceVerifier: options.sequenceVerifier,
      sequenceVerifierMode: options.sequenceVerifierMode,
      adapters: options.adapters,
      middlewares: options.middlewares,
    });
  }

  async startTurn(
    params: AgentSessionTurnStartParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>> {
    return await this.#base.startTurn(params, options);
  }

  async cancelTurn(
    params: AgentSessionTurnCancelParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>> {
    return await this.#base.cancelTurn(params, options);
  }

  async respondAction(
    params: AgentSessionActionRespondParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>> {
    return await this.#base.respondAction(params, options);
  }

  async readThread(
    params: AgentSessionReadParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>> {
    return await this.#base.readThread(params, options);
  }

  async readToolInventory(
    params: AgentSessionToolInventoryReadParams = {},
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>> {
    return await this.#base.readToolInventory(params, options);
  }

  async exportEvidence(
    params: EvidenceExportParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<EvidenceExportResponse>> {
    return await this.#base.exportEvidence(params, options);
  }

  subscribeEvents(
    listener: AgentRuntimeEventListener,
  ): AgentRuntimeClientSubscription {
    this.#listeners.add(listener);
    return {
      unsubscribe: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async dispatchEvent(message: JsonRpcMessage): Promise<boolean> {
    const notification = agentSessionEventNotification(message);
    if (!notification) {
      return false;
    }
    const result = await this.#dispatchNotification(notification);
    return result.accepted;
  }

  async #dispatchNotification(
    notification: AgentSessionEventNotification,
  ): Promise<AgentRuntimeEventPipelineResult> {
    const pipelineResult = await this.#eventPipeline.process(notification);
    if (!pipelineResult.accepted) {
      return pipelineResult;
    }
    for (const notification of pipelineResult.notifications) {
      for (const listener of this.#listeners) {
        await listener(notification.params.event, notification);
      }
    }
    return pipelineResult;
  }

  async nextEvent(timeoutMs?: number): Promise<AgentSessionEventNotification> {
    for (;;) {
      const pending = this.#pendingNextEvents.shift();
      if (pending) {
        return pending;
      }
      const notification = await this.connection.nextNotification(timeoutMs);
      const agentNotification = agentSessionEventNotification(notification);
      if (!agentNotification) {
        continue;
      }
      const result = await this.#dispatchNotification(
        agentNotification,
      );
      if (result.accepted) {
        const [next, ...rest] = result.notifications;
        this.#pendingNextEvents.push(...rest);
        return next;
      }
      if (result.reason === "dropped") {
        continue;
      }
      if (result.reason === "sequence_violation") {
        throw this.#eventPipeline.sequenceViolationError();
      }
    }
  }
}

export function createAgentRuntimeClient(
  connection: AppServerConnection,
  options: AgentRuntimeClientOptions = {},
): AgentRuntimeClient {
  return new AppServerAgentRuntimeClient(connection, options);
}
