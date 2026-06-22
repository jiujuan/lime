import type { ReactNode } from "react";
import type {
  RightSurfaceDefinition,
  WorkspaceRightSurfaceKind,
} from "./rightSurfaceTypes";

interface RightSurfaceHostProps {
  activeSurface: WorkspaceRightSurfaceKind | null;
  definitions: readonly RightSurfaceDefinition[];
}

export function RightSurfaceHost({
  activeSurface,
  definitions,
}: RightSurfaceHostProps): ReactNode {
  if (!activeSurface) {
    return null;
  }

  const definition = definitions.find((item) => item.kind === activeSurface);
  if (!definition) {
    return null;
  }

  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      data-testid="workspace-right-surface-host"
      data-surface={activeSurface}
    >
      {definition.render({ activeSurface })}
    </div>
  );
}
