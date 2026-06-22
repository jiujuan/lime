import {
  closeWorkspaceRightSurface,
  openWorkspaceRightSurface,
} from "./rightSurfaceController";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceLayoutVariant,
  WorkspaceRightSurfaceSource,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export type WorkspaceRightSurfaceCommandOrigin =
  | WorkspaceRightSurfaceSource
  | "skill"
  | "mcpTool";

export type WorkspaceRightSurfaceCommand =
  | WorkspaceRightSurfaceOpenCommand
  | WorkspaceRightSurfaceCloseCommand;

export interface WorkspaceRightSurfaceOpenCommand {
  action: "open";
  kind: WorkspaceRightSurfaceKind;
  origin: WorkspaceRightSurfaceCommandOrigin;
  layoutVariant?: WorkspaceRightSurfaceLayoutVariant;
  reason?: string;
}

export interface WorkspaceRightSurfaceCloseCommand {
  action: "close";
  origin: WorkspaceRightSurfaceCommandOrigin;
  reason?: string;
}

export function resolveWorkspaceRightSurfaceCommandSource(
  origin: WorkspaceRightSurfaceCommandOrigin,
): WorkspaceRightSurfaceSource {
  return origin === "skill" || origin === "mcpTool" ? "runtime" : origin;
}

export function applyWorkspaceRightSurfaceCommand(
  current: WorkspaceRightSurfaceState,
  command: WorkspaceRightSurfaceCommand,
): WorkspaceRightSurfaceState {
  const source = resolveWorkspaceRightSurfaceCommandSource(command.origin);

  if (command.action === "close") {
    return closeWorkspaceRightSurface(current, { source });
  }

  return openWorkspaceRightSurface(current, {
    kind: command.kind,
    source,
    layoutVariant: command.layoutVariant,
  });
}
