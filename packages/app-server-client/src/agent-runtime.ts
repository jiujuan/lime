import {
  agentSessionEventNotification,
  type AgentEvent,
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
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type JsonRpcMessage,
} from "./protocol.js";
import {
  AppServerConnection,
  type AppServerRequestOptions,
  type AppServerRequestResult,
} from "./connection.js";

export type AgentEventListener = (
  event: AgentEvent,
  notification: AgentSessionEventNotification,
) => void | Promise<void>;

export type AgentRuntimeEventListener = AgentEventListener;

export type AgentRuntimeClientOptions = {
  request?: AppServerRequestOptions;
};

export type AgentRuntimeClientSubscription = {
  unsubscribe(): void;
};

export interface AgentRuntimeClient {
  startTurn(
    params: AgentSessionTurnStartParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>>;
  cancelTurn(
    params: AgentSessionTurnCancelParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>>;
  respondAction(
    params: AgentSessionActionRespondParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>>;
  readThread(
    params: AgentSessionReadParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>>;
  readToolInventory(
    params?: AgentSessionToolInventoryReadParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>>;
  exportEvidence(
    params: EvidenceExportParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<EvidenceExportResponse>>;
  subscribeEvents(
    listener: AgentRuntimeEventListener,
  ): AgentRuntimeClientSubscription;
  dispatchEvent(message: JsonRpcMessage): Promise<boolean>;
  nextEvent(timeoutMs?: number): Promise<AgentSessionEventNotification>;
}

export class AppServerAgentEventRouter {
  #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async dispatch(message: JsonRpcMessage): Promise<boolean> {
    const notification = agentSessionEventNotification(message);
    if (!notification) {
      return false;
    }
    for (const listener of this.#listeners) {
      await listener(notification.params.event, notification);
    }
    return true;
  }
}

export class AppServerAgentRuntimeClient implements AgentRuntimeClient {
  readonly connection: AppServerConnection;
  readonly eventRouter: AppServerAgentEventRouter;
  readonly defaultRequestOptions: AppServerRequestOptions;

  constructor(
    connection: AppServerConnection,
    options: AgentRuntimeClientOptions = {},
  ) {
    this.connection = connection;
    this.eventRouter = new AppServerAgentEventRouter();
    this.defaultRequestOptions = options.request ?? {};
  }

  async startTurn(
    params: AgentSessionTurnStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>> {
    return await this.connection.startTurn(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async cancelTurn(
    params: AgentSessionTurnCancelParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>> {
    return await this.connection.cancelTurn(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async respondAction(
    params: AgentSessionActionRespondParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>> {
    return await this.connection.respondAction(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async readThread(
    params: AgentSessionReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>> {
    return await this.connection.readSession(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async readToolInventory(
    params: AgentSessionToolInventoryReadParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>> {
    return await this.connection.readAgentSessionToolInventory(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async exportEvidence(
    params: EvidenceExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<EvidenceExportResponse>> {
    return await this.connection.exportEvidence(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  subscribeEvents(
    listener: AgentRuntimeEventListener,
  ): AgentRuntimeClientSubscription {
    const unsubscribe = this.eventRouter.subscribe(listener);
    return { unsubscribe };
  }

  async dispatchEvent(message: JsonRpcMessage): Promise<boolean> {
    return await this.eventRouter.dispatch(message);
  }

  async nextEvent(timeoutMs?: number): Promise<AgentSessionEventNotification> {
    for (;;) {
      const notification = await this.connection.nextNotification(timeoutMs);
      const agentNotification = agentSessionEventNotification(notification);
      if (agentNotification) {
        await this.dispatchEvent(agentNotification);
        return agentNotification;
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

function mergeRequestOptions(
  defaults: AppServerRequestOptions,
  overrides: AppServerRequestOptions,
): AppServerRequestOptions {
  return { ...defaults, ...overrides };
}
