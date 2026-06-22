import type {
  WorkspaceRightSurfaceCommand,
  WorkspaceRightSurfaceCommandOrigin,
} from "./rightSurfaceCommand";
import {
  scheduleWorkspaceRightSurfaceCommand,
  type WorkspaceRightSurfaceRequestPriority,
  type WorkspaceRightSurfaceScheduleDecision,
} from "./rightSurfaceScheduler";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceLayoutVariant,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export interface WorkspaceRightSurfaceIntent {
  id: string;
  command: WorkspaceRightSurfaceCommand;
  priority: WorkspaceRightSurfaceRequestPriority;
  createdAt: number;
  ttlMs?: number;
}

export interface WorkspaceRightSurfaceIntentQueueState {
  surfaceState: WorkspaceRightSurfaceState;
  pendingIntents: WorkspaceRightSurfaceIntent[];
}

export interface CreateWorkspaceRightSurfaceOpenIntentInput {
  id: string;
  kind: WorkspaceRightSurfaceKind;
  origin: WorkspaceRightSurfaceCommandOrigin;
  createdAt: number;
  priority?: WorkspaceRightSurfaceRequestPriority;
  layoutVariant?: WorkspaceRightSurfaceLayoutVariant;
  reason?: string;
  ttlMs?: number;
}

export interface CreateWorkspaceRightSurfaceCloseIntentInput {
  id: string;
  origin: WorkspaceRightSurfaceCommandOrigin;
  createdAt: number;
  priority?: WorkspaceRightSurfaceRequestPriority;
  reason?: string;
  ttlMs?: number;
}

export interface ApplyWorkspaceRightSurfaceIntentInput {
  state: WorkspaceRightSurfaceIntentQueueState;
  intent: WorkspaceRightSurfaceIntent;
  userLockedSurface?: WorkspaceRightSurfaceKind | null;
}

export interface ApplyWorkspaceRightSurfaceIntentResult {
  state: WorkspaceRightSurfaceIntentQueueState;
  decision: WorkspaceRightSurfaceScheduleDecision;
}

export function createWorkspaceRightSurfaceOpenIntent({
  id,
  kind,
  origin,
  createdAt,
  priority = "foreground",
  layoutVariant,
  reason,
  ttlMs,
}: CreateWorkspaceRightSurfaceOpenIntentInput): WorkspaceRightSurfaceIntent {
  return {
    id,
    priority,
    createdAt,
    ttlMs,
    command: {
      action: "open",
      kind,
      origin,
      layoutVariant,
      reason,
    },
  };
}

export function createWorkspaceRightSurfaceCloseIntent({
  id,
  origin,
  createdAt,
  priority = "foreground",
  reason,
  ttlMs,
}: CreateWorkspaceRightSurfaceCloseIntentInput): WorkspaceRightSurfaceIntent {
  return {
    id,
    priority,
    createdAt,
    ttlMs,
    command: {
      action: "close",
      origin,
      reason,
    },
  };
}

export function applyWorkspaceRightSurfaceIntent({
  state,
  intent,
  userLockedSurface = null,
}: ApplyWorkspaceRightSurfaceIntentInput): ApplyWorkspaceRightSurfaceIntentResult {
  const decision = scheduleWorkspaceRightSurfaceCommand({
    current: state.surfaceState,
    command: intent.command,
    priority: intent.priority,
    userLockedSurface,
  });

  if (decision.status === "accepted") {
    return {
      decision,
      state: {
        surfaceState: decision.state,
        pendingIntents: removePendingIntent(state.pendingIntents, intent.id),
      },
    };
  }

  if (decision.status === "deferred") {
    return {
      decision,
      state: {
        surfaceState: state.surfaceState,
        pendingIntents: upsertPendingIntent(state.pendingIntents, intent),
      },
    };
  }

  return { decision, state };
}

export function pruneExpiredWorkspaceRightSurfaceIntents(
  pendingIntents: WorkspaceRightSurfaceIntent[],
  now: number,
): WorkspaceRightSurfaceIntent[] {
  return pendingIntents.filter((intent) => {
    if (intent.ttlMs === undefined) {
      return true;
    }

    return now - intent.createdAt <= intent.ttlMs;
  });
}

function upsertPendingIntent(
  pendingIntents: WorkspaceRightSurfaceIntent[],
  intent: WorkspaceRightSurfaceIntent,
): WorkspaceRightSurfaceIntent[] {
  return [...removePendingIntent(pendingIntents, intent.id), intent];
}

function removePendingIntent(
  pendingIntents: WorkspaceRightSurfaceIntent[],
  intentId: string,
): WorkspaceRightSurfaceIntent[] {
  return pendingIntents.filter((intent) => intent.id !== intentId);
}
