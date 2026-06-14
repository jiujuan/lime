import type {
  AgentRuntimeClient,
  AgentRuntimeClientSubscription,
  AgentRuntimeEventListener,
  AgentSessionActionRespondParams,
  AgentSessionActionRespondResponse,
  AgentSessionEventNotification,
  AgentSessionReadParams,
  AgentSessionReadResponse,
  AgentSessionToolInventoryReadParams,
  AgentSessionToolInventoryReadResponse,
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
import {
  AgentRuntimeEventPipeline,
  type AgentRuntimeEventAdapter,
  type AgentRuntimeEventPipelineResult,
  type AgentRuntimeEventPipelineMiddleware,
} from "./eventPipeline.js";
import {
  type AgentRuntimeSequenceViolationError,
  type AgentRuntimeSequenceVerifierLike,
  type AgentRuntimeSequenceVerifierMode,
} from "./eventVerifier.js";

export {
  AgentRuntimeEventSequenceGate,
  AgentRuntimeSequenceViolationError,
  runtimeExecutionEventFromAgentEvent,
  type AgentRuntimeSequenceVerifierLike,
  type AgentRuntimeSequenceVerifierMode,
} from "./eventVerifier.js";
export {
  AgentRuntimeEventPipeline,
  createSchemaVersionCompatibilityMiddleware,
  withEvent,
  type AgentRuntimeEventAdapter,
  type AgentRuntimeEventMiddleware,
  type AgentRuntimeEventMiddlewareFunction,
  type AgentRuntimeEventPipelineContext,
  type AgentRuntimeEventPipelineMiddleware,
  type AgentRuntimeEventPipelineOptions,
} from "./eventPipeline.js";

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
  readToolInventory?: AgentRuntimeGatewayMethod<
    AgentSessionToolInventoryReadParams,
    AgentSessionToolInventoryReadResponse
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

export interface AgentRuntimeClientFromGatewayOptions {
  sequenceVerifier?: AgentRuntimeSequenceVerifierLike;
  sequenceVerifierMode?: AgentRuntimeSequenceVerifierMode;
  adapters?: readonly AgentRuntimeEventAdapter[];
  middlewares?: readonly AgentRuntimeEventPipelineMiddleware[];
}

export function createAgentRuntimeClientFromSessionGateway(
  gateway: AgentRuntimeSessionGateway,
  options: AgentRuntimeClientFromGatewayOptions = {},
): AgentRuntimeClient {
  const eventRouter = new AgentRuntimeGatewayEventRouter(options);
  return {
    startTurn: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.startTurn, params, options),
    readThread: (params, options) =>
      callAgentRuntimeSessionGateway(gateway.readSession, params, options),
    readToolInventory: (params = {}, options) =>
      callOptionalAgentRuntimeSessionGateway(
        gateway.readToolInventory,
        "readToolInventory",
        params,
        options,
      ),
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
      const result = await eventRouter.dispatch(message);
      return result.accepted;
    },
    async nextEvent(timeoutMs) {
      const pending = eventRouter.takePendingNextEvent();
      if (pending) {
        return pending;
      }
      if (gateway.nextEvent) {
        for (;;) {
          const notification = await gateway.nextEvent(timeoutMs);
          const result = await eventRouter.dispatch(notification);
          if (result.accepted) {
            const [next, ...rest] = result.notifications;
            eventRouter.queuePendingNextEvents(rest);
            return next;
          }
          if (result.reason === "sequence_violation") {
            throw eventRouter.sequenceViolationError();
          }
        }
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
  const pending = eventRouter.takePendingNextEvent();
  if (pending) {
    return pending;
  }
  const messages = await gateway.drainEvents?.(1);
  for (const message of messages ?? []) {
    const notification = agentSessionEventNotificationFromMessage(message);
    if (notification) {
      const result = await eventRouter.dispatch(notification);
      if (result.accepted) {
        const [next, ...rest] = result.notifications;
        eventRouter.queuePendingNextEvents(rest);
        return next;
      }
      if (result.reason === "sequence_violation") {
        throw eventRouter.sequenceViolationError();
      }
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
  readonly #eventPipeline: AgentRuntimeEventPipeline;
  readonly #pendingNextEvents: AgentSessionEventNotification[] = [];

  constructor(options: AgentRuntimeClientFromGatewayOptions = {}) {
    this.#eventPipeline = new AgentRuntimeEventPipeline({
      sequenceVerifier: options.sequenceVerifier,
      sequenceVerifierMode: options.sequenceVerifierMode,
      adapters: options.adapters,
      middlewares: options.middlewares,
    });
  }

  subscribe(listener: AgentRuntimeEventListener): AgentRuntimeClientSubscription {
    this.#listeners.add(listener);
    return {
      unsubscribe: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async dispatch(
    message: JsonRpcMessage,
  ): Promise<AgentRuntimeEventPipelineResult> {
    const notification = agentSessionEventNotificationFromMessage(message);
    if (!notification) {
      return { accepted: false, reason: "dropped" };
    }
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

  takePendingNextEvent(): AgentSessionEventNotification | undefined {
    return this.#pendingNextEvents.shift();
  }

  queuePendingNextEvents(notifications: readonly AgentSessionEventNotification[]): void {
    this.#pendingNextEvents.push(...notifications);
  }

  sequenceViolationError(): AgentRuntimeSequenceViolationError {
    return this.#eventPipeline.sequenceViolationError();
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
