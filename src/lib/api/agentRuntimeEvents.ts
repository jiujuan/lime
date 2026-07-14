import { safeListen } from "@/lib/dev-bridge";
import type { UnlistenFn } from "@/lib/desktop-host/event";
import type { AgentEvent } from "@/lib/api/agentProtocol";
import { projectAgentRuntimeSequenceGatePayloads } from "./agentRuntime/eventSequenceGate";

export type AgentRuntimeEventHandler<TPayload = AgentEvent | unknown> =
  (event: { payload: TPayload | unknown }) => void;

export type AgentRuntimeEventListener = <TPayload = AgentEvent | unknown>(
  eventName: string,
  handler: AgentRuntimeEventHandler<TPayload>,
) => Promise<UnlistenFn>;

export interface AgentRuntimeEventTransportDeps {
  listen?: typeof safeListen;
}

export interface AgentRuntimeEventSourceDeps extends AgentRuntimeEventTransportDeps {
  listenEvent?: AgentRuntimeEventListener;
}

export interface AgentRuntimeEventSource {
  listenRuntimeEvent: AgentRuntimeEventListener;
}

const localRuntimeEventListeners = new Map<
  string,
  Set<AgentRuntimeEventHandler>
>();
let bridgeSubscriptionSequence = 0;
const PROCESSED_RUNTIME_EVENT_MARKER = "__lime_processed_agent_runtime_event";

export function publishAgentRuntimeEvent<TPayload = AgentEvent | unknown>(
  eventName: string,
  payload: TPayload,
): void {
  publishAgentRuntimeEventToLocalListeners(eventName, payload, true);
}

export function publishProcessedAgentRuntimeEvent<
  TPayload = AgentEvent | unknown,
>(eventName: string, payload: TPayload): void {
  publishAgentRuntimeEventToLocalListeners(eventName, payload, false);
}

function publishAgentRuntimeEventToLocalListeners<
  TPayload = AgentEvent | unknown,
>(eventName: string, payload: TPayload, runSequenceGate: boolean): void {
  const listeners = localRuntimeEventListeners.get(eventName);
  if (!listeners?.size) {
    return;
  }
  const projectedPayloads = runSequenceGate
    ? projectAgentRuntimeSequenceGatePayloads(
        eventName,
        payload,
        "fail-closed",
        "published",
      )
    : [markProcessedAgentRuntimePayload(payload)];

  for (const projectedPayload of projectedPayloads) {
    for (const handler of [...listeners]) {
      if (runSequenceGate) {
        handler({ payload: projectedPayload });
      } else {
        handler({
          payload: stripProcessedAgentRuntimePayloadMarker(projectedPayload),
        });
      }
    }
  }
}

function listenLocalAgentRuntimeEvent(
  eventName: string,
  handler: AgentRuntimeEventHandler,
): UnlistenFn {
  const listeners =
    localRuntimeEventListeners.get(eventName) ??
    new Set<AgentRuntimeEventHandler>();
  listeners.add(handler);
  localRuntimeEventListeners.set(eventName, listeners);

  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) {
      localRuntimeEventListeners.delete(eventName);
    }
  };
}

export function createAgentRuntimeEventListener({
  listen = safeListen,
}: AgentRuntimeEventTransportDeps = {}): AgentRuntimeEventListener {
  return async <TPayload = AgentEvent | unknown>(
    eventName: string,
    handler: AgentRuntimeEventHandler<TPayload>,
  ): Promise<UnlistenFn> => {
    const bridgeGateScope = `bridge:${++bridgeSubscriptionSequence}`;
    const bridgeHandler: AgentRuntimeEventHandler<TPayload> = (event) => {
      const projectedPayloads = isProcessedAgentRuntimePayload(event.payload)
        ? [event.payload]
        : projectAgentRuntimeSequenceGatePayloads(
            eventName,
            event.payload,
            "fail-closed",
            bridgeGateScope,
          );
      for (const projectedPayload of projectedPayloads) {
        handler({
          payload: stripProcessedAgentRuntimePayloadMarker(projectedPayload),
        } as Parameters<typeof handler>[0]);
      }
    };
    const unlistenLocal = listenLocalAgentRuntimeEvent(
      eventName,
      handler as AgentRuntimeEventHandler,
    );
    try {
      const unlistenBridge = await listen(
        eventName,
        bridgeHandler as (event: { payload: unknown }) => void,
      );
      return () => {
        unlistenLocal();
        unlistenBridge();
      };
    } catch (error) {
      unlistenLocal();
      throw error;
    }
  };
}

function markProcessedAgentRuntimePayload<TPayload>(
  payload: TPayload,
): TPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return {
    ...(payload as Record<string, unknown>),
    [PROCESSED_RUNTIME_EVENT_MARKER]: true,
  } as TPayload;
}

function isProcessedAgentRuntimePayload(payload: unknown): boolean {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>)[PROCESSED_RUNTIME_EVENT_MARKER] ===
      true,
  );
}

function stripProcessedAgentRuntimePayloadMarker<TPayload>(
  payload: TPayload,
): TPayload {
  if (!isProcessedAgentRuntimePayload(payload)) {
    return payload;
  }
  const { [PROCESSED_RUNTIME_EVENT_MARKER]: _marker, ...rest } =
    payload as Record<string, unknown>;
  return rest as TPayload;
}

export function createAgentRuntimeEventSource({
  listenEvent,
  listen,
}: AgentRuntimeEventSourceDeps = {}): AgentRuntimeEventSource {
  const resolvedListenEvent =
    listenEvent ?? createAgentRuntimeEventListener({ listen });

  async function listenRuntimeEvent(
    eventName: string,
    handler: AgentRuntimeEventHandler,
  ): Promise<UnlistenFn> {
    return await resolvedListenEvent(eventName, handler);
  }

  return {
    listenRuntimeEvent,
  };
}

export const defaultAgentRuntimeEventSource = createAgentRuntimeEventSource();

export const listenAgentRuntimeEvent: AgentRuntimeEventListener =
  defaultAgentRuntimeEventSource.listenRuntimeEvent;
