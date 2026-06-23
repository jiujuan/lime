import type { ReactNode } from "react";
import type {
  RightSurfaceDefinition,
  RightSurfaceRenderInput,
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceSource,
} from "./rightSurfaceTypes";

export type WorkspaceRightSurfaceSlot = "canvasPanel";
export type WorkspaceRightSurfaceExclusiveGroup = "workspaceRightSurface";
export type WorkspaceRightSurfaceCollapseTarget = "topToolbar" | "none";

export interface WorkspaceRightSurfaceSpec {
  kind: WorkspaceRightSurfaceKind;
  slot: WorkspaceRightSurfaceSlot;
  exclusiveGroup: WorkspaceRightSurfaceExclusiveGroup;
  openSources: readonly WorkspaceRightSurfaceSource[];
  collapseTarget: WorkspaceRightSurfaceCollapseTarget;
}

export type WorkspaceRightSurfaceRenderers = Partial<
  Record<
    WorkspaceRightSurfaceKind,
    (input: RightSurfaceRenderInput) => ReactNode
  >
>;

export const WORKSPACE_RIGHT_SURFACE_SPECS: readonly WorkspaceRightSurfaceSpec[] =
  [
    {
      kind: "workbench",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "appSurface",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "productProfile",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "expertInfo",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "objectCanvas",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "files",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "route", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "shell",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "runtime"],
      collapseTarget: "topToolbar",
    },
    {
      kind: "harness",
      slot: "canvasPanel",
      exclusiveGroup: "workspaceRightSurface",
      openSources: ["user", "runtime"],
      collapseTarget: "topToolbar",
    },
  ];

export function getWorkspaceRightSurfaceSpec(
  kind: WorkspaceRightSurfaceKind,
): WorkspaceRightSurfaceSpec | null {
  return (
    WORKSPACE_RIGHT_SURFACE_SPECS.find((spec) => spec.kind === kind) ?? null
  );
}

export function buildWorkspaceRightSurfaceDefinitions(
  renderers: WorkspaceRightSurfaceRenderers,
): RightSurfaceDefinition[] {
  return WORKSPACE_RIGHT_SURFACE_SPECS.flatMap((spec) => {
    const render = renderers[spec.kind];
    return render ? [{ kind: spec.kind, render }] : [];
  });
}
