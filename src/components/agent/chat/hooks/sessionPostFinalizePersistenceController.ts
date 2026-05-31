import type { SessionModelPreference } from "./agentChatShared";

export interface SessionPostFinalizePersistencePlan {
  persistedWorkspaceId: string | null;
  providerPreferenceToApply: SessionModelPreference | null;
  runtimeTopicWorkspaceIdToApply: string | null;
  topicWorkspaceId: string | null;
}

export interface SessionPostFinalizePersistenceApplyPlan {
  providerPreferenceToApply: SessionModelPreference | null;
  runtimeTopicWorkspaceIdToApply: string | null;
  sessionWorkspaceIdToPersist: string | null;
}

export function resolveSessionDetailTopicWorkspaceId(params: {
  knownWorkspaceId?: string | null;
  resolvedWorkspaceId?: string | null;
  runtimeWorkspaceId?: string | null;
}): string | null {
  return (
    params.runtimeWorkspaceId ||
    params.knownWorkspaceId ||
    params.resolvedWorkspaceId ||
    null
  );
}

export function resolvePersistedSessionWorkspaceId(params: {
  resolvedWorkspaceId?: string | null;
  runtimeWorkspaceId?: string | null;
}): string | null {
  return params.runtimeWorkspaceId || params.resolvedWorkspaceId || null;
}

export function buildSessionPostFinalizePersistencePlan(params: {
  knownWorkspaceId?: string | null;
  providerPreferenceToApply?: SessionModelPreference | null;
  resolvedWorkspaceId?: string | null;
  runtimeWorkspaceId?: string | null;
}): SessionPostFinalizePersistencePlan {
  return {
    persistedWorkspaceId: resolvePersistedSessionWorkspaceId(params),
    providerPreferenceToApply: params.providerPreferenceToApply ?? null,
    runtimeTopicWorkspaceIdToApply: params.runtimeWorkspaceId || null,
    topicWorkspaceId: resolveSessionDetailTopicWorkspaceId(params),
  };
}

export function buildSessionPostFinalizePersistenceApplyPlan(
  plan: SessionPostFinalizePersistencePlan,
): SessionPostFinalizePersistenceApplyPlan {
  return {
    providerPreferenceToApply: plan.providerPreferenceToApply,
    runtimeTopicWorkspaceIdToApply: plan.runtimeTopicWorkspaceIdToApply,
    sessionWorkspaceIdToPersist: plan.persistedWorkspaceId,
  };
}

export function applyRuntimeTopicWorkspaceIdToTopics<
  TTopic extends { id: string; workspaceId?: string | null },
>(
  topics: TTopic[],
  params: {
    runtimeTopicWorkspaceIdToApply?: string | null;
    topicId: string;
  },
): TTopic[] {
  if (!params.runtimeTopicWorkspaceIdToApply) {
    return topics;
  }

  return topics.map((topic) =>
    topic.id === params.topicId
      ? {
          ...topic,
          workspaceId: params.runtimeTopicWorkspaceIdToApply,
        }
      : topic,
  );
}
