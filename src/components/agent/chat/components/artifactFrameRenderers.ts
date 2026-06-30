import type { Artifact } from "@/lib/artifact/types";
import { registerArticleArtifactFrameRenderer } from "./ArticleArtifactFrame";
import {
  artifactFrameRegistry,
  resolveArtifactFrameRenderer as resolveArtifactFrameRendererFromRegistry,
} from "./artifactFrameRegistry";

export function registerDefaultArtifactFrameRenderers(): void {
  if (artifactFrameRegistry.getById("articleArtifacts")) {
    return;
  }
  registerArticleArtifactFrameRenderer();
}

export function resolveArtifactFrameRenderer(artifact: Artifact) {
  registerDefaultArtifactFrameRenderers();
  return resolveArtifactFrameRendererFromRegistry(artifact);
}

registerDefaultArtifactFrameRenderers();
