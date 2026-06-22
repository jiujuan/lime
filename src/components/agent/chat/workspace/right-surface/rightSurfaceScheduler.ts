import { canOpenWorkspaceRightSurface } from "./rightSurfaceController";
import {
  applyWorkspaceRightSurfaceCommand,
  resolveWorkspaceRightSurfaceCommandSource,
  type WorkspaceRightSurfaceCommand,
} from "./rightSurfaceCommand";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export type WorkspaceRightSurfaceRequestPriority =
  | "foreground"
  | "background";

export type WorkspaceRightSurfaceScheduleStatus =
  | "accepted"
  | "rejected"
  | "deferred"
  | "ignored";

export type WorkspaceRightSurfaceScheduleReason =
  | "source_not_allowed"
  | "background_request_deferred"
  | "user_locked_surface"
  | "no_state_change";

export interface WorkspaceRightSurfaceScheduleInput {
  current: WorkspaceRightSurfaceState;
  command: WorkspaceRightSurfaceCommand;
  priority?: WorkspaceRightSurfaceRequestPriority;
  userLockedSurface?: WorkspaceRightSurfaceKind | null;
}

export interface WorkspaceRightSurfaceScheduleDecision {
  status: WorkspaceRightSurfaceScheduleStatus;
  state: WorkspaceRightSurfaceState;
  reasonCode?: WorkspaceRightSurfaceScheduleReason;
}

export function scheduleWorkspaceRightSurfaceCommand({
  current,
  command,
  priority = "foreground",
  userLockedSurface = null,
}: WorkspaceRightSurfaceScheduleInput): WorkspaceRightSurfaceScheduleDecision {
  if (command.action === "close") {
    return {
      status: "accepted",
      state: applyWorkspaceRightSurfaceCommand(current, command),
    };
  }

  const source = resolveWorkspaceRightSurfaceCommandSource(command.origin);
  if (!canOpenWorkspaceRightSurface(command.kind, source)) {
    return {
      status: "rejected",
      state: current,
      reasonCode: "source_not_allowed",
    };
  }

  if (
    userLockedSurface &&
    current.activeSurface === userLockedSurface &&
    command.kind !== userLockedSurface &&
    command.origin !== "user"
  ) {
    return {
      status: "deferred",
      state: current,
      reasonCode: "user_locked_surface",
    };
  }

  if (
    priority === "background" &&
    command.origin !== "user" &&
    current.activeSurface !== null &&
    command.kind !== current.activeSurface
  ) {
    return {
      status: "deferred",
      state: current,
      reasonCode: "background_request_deferred",
    };
  }

  const nextState = applyWorkspaceRightSurfaceCommand(current, command);
  if (nextState === current) {
    return {
      status: "ignored",
      state: current,
      reasonCode: "no_state_change",
    };
  }

  return {
    status: "accepted",
    state: nextState,
  };
}
