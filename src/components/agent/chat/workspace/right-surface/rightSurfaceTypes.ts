import type { ReactNode } from "react";

export type WorkspaceRightSurfaceKind =
  | "workbench"
  | "appSurface"
  | "productProfile"
  | "expertInfo"
  | "objectCanvas"
  | "browser"
  | "files"
  | "shell"
  | "harness";

export type WorkspaceRightSurfaceSource = "user" | "route" | "runtime";

export type WorkspaceRightSurfaceLayoutVariant =
  | "docked"
  | "expanded"
  | "canvasFirst";

export interface WorkspaceRightSurfaceState {
  activeSurface: WorkspaceRightSurfaceKind | null;
  previousSurface: WorkspaceRightSurfaceKind | null;
  openSurfaces: readonly WorkspaceRightSurfaceKind[];
  source: WorkspaceRightSurfaceSource;
  layoutVariant: WorkspaceRightSurfaceLayoutVariant;
}

export interface RightSurfaceRenderInput {
  activeSurface: WorkspaceRightSurfaceKind | null;
}

export interface RightSurfaceDefinition {
  kind: WorkspaceRightSurfaceKind;
  label?: string | null;
  render(input: RightSurfaceRenderInput): ReactNode;
}
