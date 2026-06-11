import type {
  AgentRuntimeClient,
  AgentRuntimeClientSubscription,
  AgentRuntimeEventListener,
  AgentSessionActionRespondParams,
  AgentSessionActionRespondResponse,
  AgentSessionEventNotification,
  AgentSessionReadParams,
  AgentSessionReadResponse,
  AgentSessionTurnCancelParams,
  AgentSessionTurnCancelResponse,
  AgentSessionTurnStartParams,
  AgentSessionTurnStartResponse,
  AppServerRequestOptions,
  AppServerRequestResult,
  EvidenceExportParams,
  EvidenceExportResponse,
  JsonRpcMessage,
  JsonRpcNotification,
} from "@limecloud/app-server-client";

const METHOD_AGENT_SESSION_EVENT = "agentSession/event";

export type AgentRuntimeLifecycleClient = Pick<
  AgentRuntimeClient,
  "startTurn" | "readThread" | "cancelTurn" | "respondAction"
>;

type AgentRuntimeGatewayMethod<Params, Result> = (
  params: Params,
  options?: AppServerRequestOptions,
) => Promise<AppServerRequestResult<Result>>;

export type AgentRuntimeSessionGateway = {
  startTurn: AgentRuntimeGatewayMethod<
    AgentSessionTurnStartParams,
    AgentSessionTurnStartResponse
  >;
  readSession: AgentRuntimeGatewayMethod<
    AgentSessionReadParams,
    AgentSessionReadResponse
  >;
  cancelTurn: AgentRuntimeGatewayMethod<
    AgentSessionTurnCancelParams,
    AgentSessionTurnCancelResponse
  >;
  respondAction: AgentRuntimeGatewayMethod<
    AgentSessionActionRespondParams,
    AgentSessionActionRespondResponse
  >;
  exportEvidence?: AgentRuntimeGatewayMethod<
    EvidenceExportParams,
    EvidenceExportResponse
  >;
  nextEvent?(timeoutMs?: number): Promise<AgentSessionEventNotification>;
  drainEvents?(limit?: number): Promise<JsonRpcMessage[]>;
};

export function createAgentRuntimeClientFromSessionGateway(
  gateway: AgentRuntimeSessionGateway,
): AgentRuntimeClient {
  const eventRouter = new AgentRuntimeGatewayEventRouter();
  return {
    startTurn: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.startTurn, params, options),
    readThread: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.readSession, params, options),
    cancelTurn: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.cancelTurn, params, options),
    respondAction: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.respondAction, params, options),
    exportEvidence: (params, options) =>
      callOptionalAgentRuntimeSessionGateway(
        gateway.exportEvidence,
        "exportEvidence",
        params,
        options,
      ),
    subscribeEvents(listener) {
      return eventRouter.subscribe(listener);
    },
    async dispatchEvent(message) {
      return await eventRouter.dispatch(message);
    },
    async nextEvent(timeoutMs) {
      if (gateway.nextEvent) {
        const notification = await gateway.nextEvent(timeoutMs);
        await eventRouter.dispatch(notification);
        return notification;
      }
      if (gateway.drainEvents) {
        return await nextDrainedAgentRuntimeEvent(
          gateway,
          eventRouter,
          timeoutMs,
        );
      }
      throw new Error(
        "AgentRuntime session gateway does not expose agentSession/event subscription.",
      );
    },
  };
}

function callAgentRuntimeSessionGateway<Params, Result>(
  method: (
    params: Params,
    options?: AppServerRequestOptions,
  ) => Promise<AppServerRequestResult<Result>>,
  params: Params,
  options?: AppServerRequestOptions,
): Promise<AppServerRequestResult<Result>> {
  if (options === undefined) {
    return method(params);
  }
  return method(params, options);
}

async function callOptionalAgentRuntimeSessionGateway<Params, Result>(
  method: AgentRuntimeGatewayMethod<Params, Result> | undefined,
  methodName: string,
  params: Params,
  options?: AppServerRequestOptions,
): Promise<AppServerRequestResult<Result>> {
  if (!method) {
    throw new Error(
      `AgentRuntime session gateway does not expose ${methodName}.`,
    );
  }
  return callAgentRuntimeSessionGateway(method, params, options);
}

async function nextDrainedAgentRuntimeEvent(
  gateway: AgentRuntimeSessionGateway,
  eventRouter: AgentRuntimeGatewayEventRouter,
  timeoutMs?: number,
): Promise<AgentSessionEventNotification> {
  const messages = await gateway.drainEvents?.(1);
  for (const message of messages ?? []) {
    const notification = agentSessionEventNotificationFromMessage(message);
    if (notification) {
      await eventRouter.dispatch(notification);
      return notification;
    }
  }
  throw new Error(
    timeoutMs === undefined
      ? "AgentRuntime session gateway drainEvents did not return agentSession/event."
      : `AgentRuntime session gateway drainEvents did not return agentSession/event within ${timeoutMs}ms.`,
  );
}

class AgentRuntimeGatewayEventRouter {
  readonly #listeners = new Set<AgentRuntimeEventListener>();

  subscribe(listener: AgentRuntimeEventListener): AgentRuntimeClientSubscription {
    this.#listeners.add(listener);
    return {
      unsubscribe: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async dispatch(message: JsonRpcMessage): Promise<boolean> {
    const notification = agentSessionEventNotificationFromMessage(message);
    if (!notification) {
      return false;
    }
    for (const listener of this.#listeners) {
      await listener(notification.params.event, notification);
    }
    return true;
  }
}

function agentSessionEventNotificationFromMessage(
  message: JsonRpcMessage,
): AgentSessionEventNotification | undefined {
  if (!isJsonRpcNotification(message)) {
    return undefined;
  }
  if (message.method !== METHOD_AGENT_SESSION_EVENT) {
    return undefined;
  }
  if (!isRecord(message.params) || !("event" in message.params)) {
    return undefined;
  }
  return message as AgentSessionEventNotification;
}

function isJsonRpcNotification(
  message: JsonRpcMessage,
): message is JsonRpcNotification {
  return isRecord(message) && "method" in message && !("id" in message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
