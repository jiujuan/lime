import { useMemo, useSyncExternalStore } from "react";

import {
  conversationProjectionStore,
  selectAgentUiProjectionEventsBySurfaceForScope,
  selectAgentUiProjectionEventsForScope,
  type AgentUiProjectionScopeFilter,
  type ConversationProjectionState,
} from "./conversationProjectionStore";
import type {
  AgentUiProjectionEvent,
  AgentUiSurface,
} from "./agentUiEventProjection";
import {
  EMPTY_AGENT_UI_PROJECTION_SUMMARY,
  findLatestAgentUiProjectionEventForArtifact,
  summarizeAgentUiProjectionEvents,
  type AgentUiProjectionSummary,
} from "./agentUiProjectionSummary";

export function useConversationProjectionSnapshot(): ConversationProjectionState {
  return useSyncExternalStore(
    conversationProjectionStore.subscribe,
    conversationProjectionStore.getSnapshot,
    conversationProjectionStore.getSnapshot,
  );
}

export function useAgentUiProjectionEvents(
  filter?: AgentUiProjectionScopeFilter | null,
): AgentUiProjectionEvent[] {
  const snapshot = useConversationProjectionSnapshot();
  return useMemo(
    () => selectAgentUiProjectionEventsForScope(snapshot, filter),
    [filter, snapshot],
  );
}

export function useAgentUiProjectionEventsBySurface(
  surface: AgentUiSurface,
  filter?: AgentUiProjectionScopeFilter | null,
): AgentUiProjectionEvent[] {
  const snapshot = useConversationProjectionSnapshot();
  return useMemo(
    () =>
      selectAgentUiProjectionEventsBySurfaceForScope(
        snapshot,
        surface,
        filter,
      ),
    [filter, snapshot, surface],
  );
}

export function useAgentUiProjectionSummary(
  filter?: AgentUiProjectionScopeFilter | null,
  options?: { enabled?: boolean },
): AgentUiProjectionSummary {
  const events = useAgentUiProjectionEvents(filter);
  const enabled = options?.enabled ?? true;
  return useMemo(
    () =>
      enabled
        ? summarizeAgentUiProjectionEvents(events)
        : EMPTY_AGENT_UI_PROJECTION_SUMMARY,
    [enabled, events],
  );
}

export function useLatestAgentUiProjectionEventForArtifact(
  artifactId?: string | null,
  filter?: AgentUiProjectionScopeFilter | null,
): AgentUiProjectionEvent | null {
  const events = useAgentUiProjectionEvents(filter);
  return useMemo(
    () => findLatestAgentUiProjectionEventForArtifact(events, artifactId),
    [artifactId, events],
  );
}
