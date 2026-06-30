import { useMemo, useSyncExternalStore } from "react";

import {
  conversationProjectionStore,
  EMPTY_CONVERSATION_AGENT_UI_PROJECTION_SLICE,
  selectAgentUiProjectionEventsBySurfaceForScopeFromSlice,
  selectAgentUiProjectionEventsForScopeFromSlice,
  type ConversationAgentUiProjectionSlice,
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

const subscribeToDisabledProjectionSlice = () => () => undefined;

function getDisabledAgentUiProjectionSnapshot(): ConversationAgentUiProjectionSlice {
  return EMPTY_CONVERSATION_AGENT_UI_PROJECTION_SLICE;
}

export function useConversationProjectionSnapshot(): ConversationProjectionState {
  return useSyncExternalStore(
    conversationProjectionStore.subscribe,
    conversationProjectionStore.getSnapshot,
    conversationProjectionStore.getSnapshot,
  );
}

export function useConversationAgentUiProjectionSnapshot(options?: {
  enabled?: boolean;
}): ConversationAgentUiProjectionSlice {
  const enabled = options?.enabled ?? true;
  return useSyncExternalStore(
    enabled
      ? (listener) =>
          conversationProjectionStore.subscribeToSlice("agentUi", listener)
      : subscribeToDisabledProjectionSlice,
    enabled
      ? () => conversationProjectionStore.getSnapshot().agentUi
      : getDisabledAgentUiProjectionSnapshot,
    enabled
      ? () => conversationProjectionStore.getSnapshot().agentUi
      : getDisabledAgentUiProjectionSnapshot,
  );
}

export function useAgentUiProjectionEvents(
  filter?: AgentUiProjectionScopeFilter | null,
  options?: { enabled?: boolean },
): AgentUiProjectionEvent[] {
  const enabled = options?.enabled ?? true;
  const agentUi = useConversationAgentUiProjectionSnapshot({ enabled });
  return useMemo(
    () =>
      enabled
        ? selectAgentUiProjectionEventsForScopeFromSlice(agentUi, filter)
        : [],
    [agentUi, enabled, filter],
  );
}

export function useAgentUiProjectionEventsBySurface(
  surface: AgentUiSurface,
  filter?: AgentUiProjectionScopeFilter | null,
): AgentUiProjectionEvent[] {
  const agentUi = useConversationAgentUiProjectionSnapshot();
  return useMemo(
    () =>
      selectAgentUiProjectionEventsBySurfaceForScopeFromSlice(
        agentUi,
        surface,
        filter,
      ),
    [agentUi, filter, surface],
  );
}

export function useAgentUiProjectionSummary(
  filter?: AgentUiProjectionScopeFilter | null,
  options?: { enabled?: boolean },
): AgentUiProjectionSummary {
  const enabled = options?.enabled ?? true;
  const events = useAgentUiProjectionEvents(filter, { enabled });
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
