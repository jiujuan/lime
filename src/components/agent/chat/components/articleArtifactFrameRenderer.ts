import { ArticleArtifactFrame } from "./ArticleArtifactFrame";
import {
  registerArtifactFrameRenderer,
  type ArtifactFrameRendererEntry,
} from "./artifactFrameRegistry";
import { resolveArticleArtifactFrameModel } from "./articleArtifactProjection";

const articleArtifactFrameRenderer: ArtifactFrameRendererEntry = {
  id: "articleArtifacts",
  priority: 100,
  supports: (artifact) => Boolean(resolveArticleArtifactFrameModel(artifact)),
  component: ArticleArtifactFrame,
};

export function registerArticleArtifactFrameRenderer(): void {
  registerArtifactFrameRenderer(articleArtifactFrameRenderer);
}
