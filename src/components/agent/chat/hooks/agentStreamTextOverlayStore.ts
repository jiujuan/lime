import { useCallback, useSyncExternalStore } from "react";

export interface AgentStreamTextOverlaySnapshot {
  messageId: string;
  eventName: string;
  content: string;
  boundary?: string;
  updatedAt: number;
}

const overlays = new Map<string, AgentStreamTextOverlaySnapshot>();
const listeners = new Map<string, Set<() => void>>();

function emit(messageId: string) {
  listeners.get(messageId)?.forEach((listener) => listener());
}

function subscribe(messageId: string, listener: () => void): () => void {
  let messageListeners = listeners.get(messageId);
  if (!messageListeners) {
    messageListeners = new Set();
    listeners.set(messageId, messageListeners);
  }
  messageListeners.add(listener);

  return () => {
    messageListeners?.delete(listener);
    if (messageListeners?.size === 0) {
      listeners.delete(messageId);
    }
  };
}

export function upsertAgentStreamTextOverlay(params: {
  messageId: string;
  eventName: string;
  content: string;
  boundary?: string;
  updatedAt?: number;
}) {
  if (!params.messageId) {
    return;
  }

  if (!params.content) {
    clearAgentStreamTextOverlay(params.messageId);
    return;
  }

  overlays.set(params.messageId, {
    messageId: params.messageId,
    eventName: params.eventName,
    content: params.content,
    boundary: params.boundary,
    updatedAt: params.updatedAt ?? Date.now(),
  });
  emit(params.messageId);
}

export function clearAgentStreamTextOverlay(messageId: string) {
  if (!messageId || !overlays.delete(messageId)) {
    return;
  }
  emit(messageId);
}

export function getAgentStreamTextOverlay(
  messageId: string | null | undefined,
): AgentStreamTextOverlaySnapshot | null {
  return messageId ? (overlays.get(messageId) ?? null) : null;
}

export function clearAllAgentStreamTextOverlays() {
  const messageIds = Array.from(overlays.keys());
  overlays.clear();
  messageIds.forEach(emit);
}

export function useAgentStreamTextOverlay(
  messageId: string | null | undefined,
): AgentStreamTextOverlaySnapshot | null {
  const subscribeSnapshot = useCallback(
    (listener: () => void) => {
      if (!messageId) {
        return () => {};
      }
      return subscribe(messageId, listener);
    },
    [messageId],
  );
  const getSnapshot = useCallback(
    () => getAgentStreamTextOverlay(messageId),
    [messageId],
  );

  return useSyncExternalStore(subscribeSnapshot, getSnapshot, getSnapshot);
}
