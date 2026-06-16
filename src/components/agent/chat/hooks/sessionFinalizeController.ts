import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";

export interface CrossWorkspaceSessionRestoreContext {
  currentWorkingDir?: string | null;
  currentWorkspaceId: string;
  knownWorkingDir?: string | null;
  knownWorkspaceId: string;
  topicId: string;
}

export interface SessionWorkspaceRestorePlan {
  crossWorkspaceContext: CrossWorkspaceSessionRestoreContext | null;
  knownWorkspaceId: string | null;
  shouldReject: boolean;
}

export interface SessionFinalizeSuccessStatePlan {
  shouldClearAutoRestoringSession: boolean;
  shouldResetSessionHydrating: boolean;
}

export function resolveSessionKnownWorkspaceId(params: {
  runtimeWorkspaceId?: string | null;
  shadowWorkspaceId?: string | null;
  topicWorkspaceId?: string | null;
}): string | null {
  return (
    params.runtimeWorkspaceId ||
    params.topicWorkspaceId ||
    params.shadowWorkspaceId ||
    null
  );
}

export function normalizeSessionScopeWorkingDir(
  workingDir?: string | null,
): string | null {
  const normalized = workingDir?.trim().replace(/[\\/]+$/u, "");
  return normalized ? normalized : null;
}

export function isCrossWorkspaceSessionDetail(params: {
  knownWorkingDir?: string | null;
  knownWorkspaceId?: string | null;
  resolvedWorkingDir?: string | null;
  resolvedWorkspaceId?: string | null;
}): boolean {
  if (params.resolvedWorkingDir && params.knownWorkingDir) {
    return params.knownWorkingDir !== params.resolvedWorkingDir;
  }

  return Boolean(
    params.resolvedWorkspaceId &&
      params.knownWorkspaceId &&
    params.knownWorkspaceId !== params.resolvedWorkspaceId,
  );
}

export function buildCrossWorkspaceSessionRestoreContext(params: {
  knownWorkingDir?: string | null;
  knownWorkspaceId: string;
  resolvedWorkingDir?: string | null;
  resolvedWorkspaceId: string;
  topicId: string;
}): CrossWorkspaceSessionRestoreContext {
  return {
    currentWorkingDir: params.resolvedWorkingDir ?? null,
    currentWorkspaceId: params.resolvedWorkspaceId,
    knownWorkingDir: params.knownWorkingDir ?? null,
    knownWorkspaceId: params.knownWorkspaceId,
    topicId: params.topicId,
  };
}

export function buildSessionWorkspaceRestorePlan(params: {
  resolvedWorkspaceId?: string | null;
  resolvedWorkingDir?: string | null;
  runtimeWorkingDir?: string | null;
  runtimeWorkspaceId?: string | null;
  shadowWorkspaceId?: string | null;
  topicId: string;
  topicWorkingDir?: string | null;
  topicWorkspaceId?: string | null;
}): SessionWorkspaceRestorePlan {
  const resolvedWorkingDir = normalizeSessionScopeWorkingDir(
    params.resolvedWorkingDir,
  );
  const knownWorkingDir =
    normalizeSessionScopeWorkingDir(params.runtimeWorkingDir) ||
    normalizeSessionScopeWorkingDir(params.topicWorkingDir);
  const cwdMatchesCurrentScope = Boolean(
    resolvedWorkingDir &&
      knownWorkingDir &&
      resolvedWorkingDir === knownWorkingDir,
  );
  const knownWorkspaceId = cwdMatchesCurrentScope
    ? params.runtimeWorkspaceId || params.resolvedWorkspaceId || null
    : resolveSessionKnownWorkspaceId(params);
  const shouldReject = isCrossWorkspaceSessionDetail({
    knownWorkingDir,
    knownWorkspaceId,
    resolvedWorkingDir,
    resolvedWorkspaceId: params.resolvedWorkspaceId,
  });

  return {
    crossWorkspaceContext:
      shouldReject && params.resolvedWorkspaceId && knownWorkspaceId
        ? buildCrossWorkspaceSessionRestoreContext({
            knownWorkingDir,
            knownWorkspaceId,
            resolvedWorkingDir,
            resolvedWorkspaceId: params.resolvedWorkspaceId,
            topicId: params.topicId,
          })
        : null,
    knownWorkspaceId,
    shouldReject,
  };
}

export function resolveShadowSessionExecutionStrategyFallback(params: {
  persistedExecutionStrategy?: AsterExecutionStrategy | null;
  runtimeExecutionStrategy?: AsterExecutionStrategy | null;
  topicExecutionStrategy?: AsterExecutionStrategy | null;
}): AsterExecutionStrategy | null {
  if (params.runtimeExecutionStrategy || params.topicExecutionStrategy) {
    return null;
  }
  return params.persistedExecutionStrategy ?? null;
}

export function resolveSessionExecutionStrategyOverride(params: {
  defaultExecutionStrategy?: AsterExecutionStrategy;
  runtimeExecutionStrategy?: AsterExecutionStrategy | null;
  shadowExecutionStrategyFallback?: AsterExecutionStrategy | null;
  topicExecutionStrategy?: AsterExecutionStrategy | null;
}): AsterExecutionStrategy {
  return normalizeExecutionStrategy(
    params.runtimeExecutionStrategy ||
      params.topicExecutionStrategy ||
      params.shadowExecutionStrategyFallback ||
      params.defaultExecutionStrategy ||
      "react",
  );
}

export function buildSessionFinalizeSuccessStatePlan(): SessionFinalizeSuccessStatePlan {
  return {
    shouldClearAutoRestoringSession: true,
    shouldResetSessionHydrating: true,
  };
}
