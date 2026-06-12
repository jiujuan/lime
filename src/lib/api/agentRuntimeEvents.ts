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
  listenSubagentStatus(
    sessionId: string,
    handler: AgentRuntimeEventHandler,
  ): Promise<UnlistenFn>;
  listenSubagentStream(
    sessionId: string,
    handler: AgentRuntimeEventHandler,
  ): Promise<UnlistenFn>;
}

export function getAgentSubagentStatusEventName(sessionId: string): string {
  return `agent_subagent_status:${sessionId}`;
}

export function getAgentSubagentStreamEventName(sessionId: string): string {
  return `agent_subagent_stream:${sessionId}`;
}

export function dedupeAgentRuntimeEventNames(
  eventNames: Array<string | null | undefined>,
): string[] {
  return eventNames.filter((value, index, values): value is string => {
    return Boolean(value) && values.indexOf(value) === index;
  });
}

const localRuntimeEventListeners = new Map<
  string,
  Set<AgentRuntimeEventHandler>
>();
let bridgeSubscriptionSequence = 0;

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
    : [payload];

  for (const projectedPayload of projectedPayloads) {
    for (const handler of [...listeners]) {
      handler({ payload: projectedPayload });
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
      const projectedPayloads = projectAgentRuntimeSequenceGatePayloads(
        eventName,
        event.payload,
        "fail-closed",
        bridgeGateScope,
      );
      for (const projectedPayload of projectedPayloads) {
        handler({ payload: projectedPayload } as Parameters<typeof handler>[0]);
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

  async function listenSubagentStatus(
    sessionId: string,
    handler: AgentRuntimeEventHandler,
  ): Promise<UnlistenFn> {
    return await listenRuntimeEvent(
      getAgentSubagentStatusEventName(sessionId),
      handler,
    );
  }

  async function listenSubagentStream(
    sessionId: string,
    handler: AgentRuntimeEventHandler,
  ): Promise<UnlistenFn> {
    return await listenRuntimeEvent(
      getAgentSubagentStreamEventName(sessionId),
      handler,
    );
  }

  return {
    listenRuntimeEvent,
    listenSubagentStatus,
    listenSubagentStream,
  };
}

export const defaultAgentRuntimeEventSource = createAgentRuntimeEventSource();

export const listenAgentRuntimeEvent: AgentRuntimeEventListener =
  defaultAgentRuntimeEventSource.listenRuntimeEvent;

export async function listenAgentSubagentStatus(
  sessionId: string,
  handler: AgentRuntimeEventHandler,
): Promise<UnlistenFn> {
  return await defaultAgentRuntimeEventSource.listenSubagentStatus(
    sessionId,
    handler,
  );
}

export async function listenAgentSubagentStream(
  sessionId: string,
  handler: AgentRuntimeEventHandler,
): Promise<UnlistenFn> {
  return await defaultAgentRuntimeEventSource.listenSubagentStream(
    sessionId,
    handler,
  );
}
