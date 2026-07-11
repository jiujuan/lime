import type { Artifact } from "@/lib/artifact/types";

export interface WorkspaceBrowserAssistCanvasControl {
  hasArtifact: boolean;
  suppressGeneralArtifactAutoOpen: () => void;
  suppressAutoOpen: () => void;
  clearArtifact: () => void;
}

export interface WorkspaceBrowserAssistArtifactOpenControl {
  openRuntimeForArtifact: (artifact?: Artifact) => void;
  suppressAutoOpen: () => void;
}
